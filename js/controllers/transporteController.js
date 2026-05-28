/**
 * @fileoverview Controlador maestro de la Terminal del Fichero de Flota y Capacidad Vehicular.
 * Gestiona el ciclo de vida de furgones, auditorías de carga y el visor de novedades mecánicas.
 * @version 3.0.0
 * @package MartinezRouting.Controllers
 */

import { DatabaseService } from '../services/databaseService.js';
import { Sanitizers } from '../utils/sanitizers.js';

export class TransporteController {
    /**
     * Inicializa las referencias de elementos del DOM del módulo de Flota.
     */
    constructor() {
        // Elementos principales del formulario operativo
        this.formTransporte = document.getElementById('form-alta-transporte');
        this.idEdicionInput = document.getElementById('t-id-edicion');
        this.internoInput = document.getElementById('t-numero-unidad');
        this.modeloInput = document.getElementById('t-modelo-unidad');
        this.choferInput = document.getElementById('t-nombre-chofer');
        this.tamanioSelect = document.getElementById('t-tamanio-unidad');
        this.observacionesInput = document.getElementById('t-comentarios-unidad');
        this.btnSubmit = document.getElementById('btn-submit-transporte');
        this.btnCancelar = document.getElementById('btn-cancelar-edicion');

        // Contenedores del visor de grilla y búsquedas predictivas
        this.flotaContainer = document.getElementById('listado-flota-maestra');
        this.searchFlotaInput = document.getElementById('search-flota');
        
        // Componentes del cuadro de diálogo modal de reclamos históricos
        this.modalReclamos = document.getElementById('modal-historial-reclamos');
        this.modalInternoTitulo = document.getElementById('modal-interno-titulo');
        this.modalListadoNovedades = document.getElementById('modal-listado-novedades');
        this.btnCloseModal = document.getElementById('btn-cerrar-modal-reclamos');
        
        /** * Almacén local inmutable en memoria virtual para búsquedas en tiempo real libres de XSS.
         * @type {Array<Object>} 
         */
        this.flotaLocalCache = []; 

        /** * Puntero de desuscripción de streams reactivos de red.
         * @type {Function|null} 
         * @private
         */
        this._unsubscribeFlota = null;
    }

    /**
     * Inicializa la interfaz y activa la escucha de flujos de datos.
     */
    init() {
        if (this.flotaContainer) {
            this.escucharFlotaMaestraTiempoReal();
        }
        this.setupFormListener();
        this.setupSearchListener();
        this.setupModalCloseListener();
        this.setupCancelButtonListener();
    }

    /**
     * Se conecta de forma reactiva al pool de datos unificado del DatabaseService.
     */
    escucharFlotaMaestraTiempoReal() {
        // Purga reactiva preventiva contra leaks de memoria
        if (this._unsubscribeFlota) this._unsubscribeFlota();

        this._unsubscribeFlota = DatabaseService.escucharFlotaMasterCompleta((flotaMasterData) => {
            // Clonamos profundamente la colección para aislar el hilo visual del Store/Firebase
            this.flotaLocalCache = structuredClone(flotaMasterData);
            this.renderFleetList(this.flotaLocalCache);
        });
    }

    /**
     * Inicializa los filtros predictivos en memoria local libre de latencia.
     */
    setupSearchListener() {
        if (!this.searchFlotaInput) return;
        
        this.searchFlotaInput.addEventListener('input', () => {
            const term = this.searchFlotaInput.value.toLowerCase().trim();
            
            if (!term) {
                this.renderFleetList(this.flotaLocalCache);
                return;
            }

            const filtered = this.flotaLocalCache.filter(f => 
                String(f.numeroUnidad).toLowerCase().includes(term) || 
                String(f.nombreChofer).toLowerCase().includes(term) ||
                String(f.modeloUnidad).toLowerCase().includes(term)
            );
            
            this.renderFleetList(filtered);
        });
    }

    /**
     * Renderiza la grilla de transporte utilizando clases semánticas de nuestro Design System.
     * @param {Array<Object>} fleet Colección de vehículos filtrados seguros.
     */
    renderFleetList(fleet) {
        if (!this.flotaContainer) return;

        if (!Array.isArray(fleet) || fleet.length === 0) {
            this.flotaContainer.innerHTML = `
                <div class="placeholder-vacio-jornada">
                    No se encontraron unidades de transporte registradas en el Fichero Central.
                </div>`;
            return;
        }

        // Esterilización profunda y tipado seguro de estructuras complejas ante vectores XSS
        const safeFleet = Sanitizers.sanitizeStructure(fleet);

        this.flotaContainer.innerHTML = safeFleet.map(f => {
            const qReclamos = Array.isArray(f.historialNovedades) ? f.historialNovedades.length : 0;
            const badgeClass = qReclamos > 0 ? 'badge--danger' : 'badge--success';
            const intSeguro = f.numeroUnidad;

            return `
                <div class="card-panel transporte-master-row" data-id="${intSeguro}">
                    <div class="transporte-master-row__info">
                        <strong class="transporte-master-row__title">Interno: #${intSeguro}</strong>
                        <span class="badge ${badgeClass} transporte-master-row__badge-pill">
                            ${qReclamos} Incidentes
                        </span>
                        <span class="transporte-master-row__meta">📋 <strong>Modelo:</strong> ${f.modeloUnidad}</span>
                        <span class="transporte-master-row__meta">👨‍✈️ <strong>Chofer:</strong> ${f.nombreChofer}</span>
                        <span class="transporte-master-row__meta-sub">📦 <strong>Capacidad:</strong> ${f.tamanioUnidad}</span>
                        ${f.comentariosUnidad ? `<span class="transporte-master-row__notes">📝 <em>Fijo: ${f.comentariosUnidad}</em></span>` : ''}
                    </div>
                    <div class="transporte-master-row__actions">
                        <button class="btn-primary btn-edit-maestro" data-id="${intSeguro}">
                            Editar Ficha
                        </button>
                        <button class="btn-primary btn-ver-reclamos" data-id="${intSeguro}">
                            Ver Reclamos
                        </button>
                        <button class="btn-danger btn-delete-maestro" data-id="${intSeguro}">
                            Remover
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        this.vincularEventosTarjetas();
    }

    /**
     * Vincula listeners lógicos resolviendo colisiones XSS por medio de indexación de memoria virtual.
     */
    vincularEventosTarjetas() {
        // Operación de Erradicación Física de la Unidad
        this.flotaContainer.querySelectorAll('.btn-delete-maestro').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm(`⚠️ ¿Desea eliminar la unidad #${id} permanentemente del Fichero Maestro? Se perderán sus datos base.`)) {
                    try {
                        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                        const { db } = await import('../services/firebaseConfig.js');
                        
                        await deleteDoc(doc(db, "flota_maestra", id));
                        this.limpiarFormularioEdicion();
                    } catch (error) {
                        console.error("[TransporteController] Borrado interrumpido:", error);
                    }
                }
            });
        });

        // Apertura Asíncrona de Novedades de Taller Mecánico
        this.flotaContainer.querySelectorAll('.btn-ver-reclamos').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idInterno = e.target.getAttribute('data-id');
                this.abrirModalReclamos(idInterno);
            });
        });

        // Captura e Inyección Segura para Edición Inline (Mitiga Attribute Injection XSS)
        this.flotaContainer.querySelectorAll('.btn-edit-maestro').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');

                // Recuperamos el objeto limpio original directamente de la memoria virtual
                const vehiculoOriginal = this.flotaLocalCache.find(f => String(f.numeroUnidad) === String(id));
                if (!vehiculoOriginal) return;

                // Cargamos de forma estricta los buffers sobre el formulario operativo
                this.idEdicionInput.value = vehiculoOriginal.numeroUnidad;
                this.internoInput.value = vehiculoOriginal.numeroUnidad;
                this.internoInput.disabled = true; // Protegemos el ID por ser clave primaria distribuida

                this.modeloInput.value = vehiculoOriginal.modeloUnidad;
                this.choferInput.value = vehiculoOriginal.nombreChofer;
                this.tamanioSelect.value = vehiculoOriginal.tamanioUnidad;
                this.observacionesInput.value = vehiculoOriginal.comentariosUnidad || '';

                this.btnSubmit.textContent = "Actualizar Ficha Unidad";
                this.btnCancelar.style.display = "inline-block";

                this.modeloInput.focus();
            });
        });
    }

    /**
     * Invoca el historial logístico de incidentes mapeando arrays de forma protegida.
     * @param {string} interno Número de interno vehicular a auditar.
     */
    async abrirModalReclamos(interno) {
        if (!this.modalReclamos) return;

        if (this.modalInternoTitulo) this.modalInternoTitulo.textContent = interno;
        this.modalListadoNovedades.innerHTML = `<div class="transporte-master-row__modal-loading">Buscando historial técnico en taller...</div>`;
        
        this.modalReclamos.classList.add('open');
        this.modalReclamos.setAttribute('aria-hidden', 'false');

        try {
            // Localizamos el camión en la caché para evitar llamadas parásitas redundantes a Firestore
            const vehiculo = this.flotaLocalCache.find(f => String(f.numeroUnidad) === String(interno));
            const notesHistorial = vehiculo && Array.isArray(vehiculo.historialNovedades) ? vehiculo.historialNovedades : [];

            if (notesHistorial.length === 0) {
                this.modalListadoNovedades.innerHTML = `
                    <div class="transporte-master-row__modal-empty">
                        ✅ Esta unidad no registra alertas mecánicas o reclamos en su historial operativo.
                    </div>`;
                return;
            }

            // Sanitización granular reactiva sobre la colección de strings de novedades
            const safeNotes = notesHistorial.map(n => Sanitizers.escapeHtml(n));

            this.modalListadoNovedades.innerHTML = safeNotes.map(nota => `
                <div class="transporte-master-row__incident-item">
                    ${nota}
                </div>
            `).reverse().join('');

        } catch (error) {
            console.error("[TransporteController] Fallo al desplegar la bitácora:", error);
            this.modalListadoNovedades.innerHTML = `<div class="badge--danger">Error de hardware al leer el historial.</div>`;
        }
    }

    /**
     * Configura el listener de envío del formulario mapeando las firmas al contrato de base de datos.
     */
    setupFormListener() {
        if (!this.formTransporte) return;

        this.formTransporte.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = "Sincronizando registro maestro...";

            const interno = Sanitizers.sanitizeAlphanumericCode(this.internoInput.value);
            const esEdicion = this.idEdicionInput.value !== "";
            
            // Re-armamos el contrato del modelo vehicular homologado
            const payloadData = {
                numeroUnidad: interno,
                modeloUnidad: this.modeloInput.value.trim(),
                nombreChofer: this.choferInput.value.trim(),
                tamanioUnidad: this.tamanioSelect.value,
                comentariosUnidad: this.observacionesInput.value.trim()
            };

            try {
                // Conservación atómica del historial mecánico: Si es edición, delegamos la lectura/preservación al servicio
                if (esEdicion) {
                    const vehiculoPrevio = this.flotaLocalCache.find(f => String(f.numeroUnidad) === String(interno));
                    payloadData.historialNovedades = vehiculoPrevio ? vehiculoPrevio.historialNovedades : [];
                } else {
                    payloadData.historialNovedades = [];
                }

                // Invocación asíncrona unificada al servicio distribuido
                await DatabaseService.guardarVehiculoMaestro(payloadData);
                
                alert(`¡Unidad #${interno} guardada con éxito en el Fichero Central!`);
                this.limpiarFormularioEdicion();
            } catch (error) {
                console.error("[TransporteController] Inyección fallida:", error);
                alert("Fallo estructural al intentar persistir los datos de la flota.");
            } finally {
                this.btnSubmit.disabled = false;
                this.btnSubmit.textContent = this.idEdicionInput.value ? "Actualizar Ficha Unidad" : "Guardar en Fichero Global";
            }
        });
    }

    setupModalCloseListener() {
        if (this.btnCloseModal) {
            this.btnCloseModal.addEventListener('click', () => {
                this.modalReclamos.classList.remove('open');
                this.modalReclamos.setAttribute('aria-hidden', 'true');
            });
        }

        if (this.modalReclamos) {
            this.modalReclamos.addEventListener('click', (e) => {
                if (e.target === this.modalReclamos) {
                    this.modalReclamos.classList.remove('open');
                    this.modalReclamos.setAttribute('aria-hidden', 'true');
                }
            });
        }
    }

    setupCancelButtonListener() {
        if (this.btnCancelar) {
            this.btnCancelar.addEventListener('click', () => this.limpiarFormularioEdicion());
        }
    }

    /**
     * Restablece los inputs y desbloquea el campo del identificador vehicular primario.
     */
    limpiarFormularioEdicion() {
        if (this.formTransporte) this.formTransporte.reset();
        this.idEdicionInput.value = "";
        this.internoInput.disabled = false;
        this.btnSubmit.textContent = "Guardar en Fichero Global";
        this.btnCancelar.style.display = "none";
    }

    /**
     * Erradica formalmente los listeners e hilos de red abiertos al desmontar el controlador.
     */
    destroy() {
        if (this._unsubscribeFlota) this._unsubscribeFlota();
    }
}

// Inicialización controlada enlazada al ciclo de vida del DOM
document.addEventListener('DOMContentLoaded', () => {
    const transporteCtrl = new TransporteController();
    transporteCtrl.init();
    
    // Indexación en ventana para auditoría y testing de inyecciones
    window.CurrentTransporteController = transporteCtrl;
});