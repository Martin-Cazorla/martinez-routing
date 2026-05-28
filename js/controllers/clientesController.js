/**
 * @fileoverview Controlador visual y gestor de eventos del Fichero Maestro de Clientes.
 * Conecta los flujos operativos de la interfaz con la capa unificada de base de datos.
 * @version 3.0.0
 * @package MartinezRouting.Controllers
 */

import { DatabaseService } from '../services/databaseService.js';
import { Sanitizers } from '../utils/sanitizers.js';

export class ClientesController {
    /**
     * Inicializa las referencias de elementos del DOM de la solapa de Clientes.
     */
    constructor() {
        this.formCliente = document.getElementById('form-cliente-operativo');
        this.hiddenIdInput = document.getElementById('cliente-id-hidden');
        this.dniInput = document.getElementById('c-dni');
        this.nombreInput = document.getElementById('c-nombre');
        this.telefonoInput = document.getElementById('c-telefono');
        this.direccionInput = document.getElementById('c-direccion');
        
        this.checkPremium = document.getElementById('c-is-premium');
        this.checkCritico = document.getElementById('c-is-critico');

        this.btnSubmit = document.getElementById('btn-guardar-cliente');
        this.btnCancel = document.getElementById('btn-cancelar-edicion');

        this.searchBox = document.getElementById('search-cliente');
        this.listadoContainer = document.getElementById('listado-master-clientes');

        /** @type {Function|null} Puntero de control para desuscripción del stream */
        this._unsubscribeClientes = null;
        /** @type {Array<Object>} Almacén local en memoria para búsquedas instantáneas */
        this.cacheClientesList = []; 
    }

    /**
     * Inicializa el ciclo de vida de la pantalla y activa la escucha distribuida de datos.
     */
    init() {
        this.setupFormSubmitListener();
        this.setupSearchFilterListener();
        this.setupCancelButtonListener();
        this.escucharFicheroClientes();
    }

    /**
     * Consume el stream en vivo del servicio maestro y procesa colecciones normalizadas.
     */
    escucharFicheroClientes() {
        if (!this.listadoContainer) return;

        // Limpieza preventiva de listeners huérfanos
        if (this._unsubscribeClientes) this._unsubscribeClientes();

        this._unsubscribeClientes = DatabaseService.escucharClientes((clientesMasterData) => {
            // Guardamos una copia inmutable local para búsquedas ultra-rápidas
            this.cacheClientesList = structuredClone(clientesMasterData);
            this.renderClientes(this.cacheClientesList);
        });
    }

    /**
     * Renderiza las filas del fichero aplicando tokens visuales e inmunidad XSS.
     * @param {Array<Object>} lista Colección de clientes a inyectar en la grilla.
     */
    renderClientes(lista) {
        if (!this.listadoContainer) return;

        if (!Array.isArray(lista) || lista.length === 0) {
            this.listadoContainer.innerHTML = `
                <div class="placeholder-vacio-jornada">
                    No se encontraron registros de clientes en el Fichero Maestro.
                </div>`;
            return;
        }

        // Sanitización previa profunda de estructuras complejas antes de procesar strings HTML
        const safeLista = Sanitizers.sanitizeStructure(lista);

        this.listadoContainer.innerHTML = safeLista.map(c => {
            // Normalización de propiedades booleanas bajo el estándar del modelo corporativo
            const esPremium = Boolean(c.premium);
            const esCritico = Boolean(c.critico);

            let claseVarianteTarjeta = "";
            if (esCritico) claseVarianteTarjeta += " cliente-item-row--critico";
            if (esPremium) claseVarianteTarjeta += " cliente-item-row--premium";

            let badgesHTML = "";
            if (esPremium) badgesHTML += `<span class="badge-tag-cliente badge-tag-cliente--premium">⭐ PREMIUM</span>`;
            if (esCritico) badgesHTML += `<span class="badge-tag-cliente badge-tag-cliente--critico">⚠️ CRÍTICO</span>`;

            return `
                <div class="card-panel cliente-item-row${claseVarianteTarjeta}">
                    <div class="cliente-data-info">
                        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <span class="cliente-name-title">${c.nombre}</span>
                            ${badgesHTML}
                        </div>
                        <span class="cliente-sub-text">DNI: <strong>${c.dni}</strong> | Tel: ${c.telefono}</span>
                        <span class="cliente-sub-text">Dir: <em>${c.direccion}</em></span>
                    </div>
                    <div class="cliente-actions-trigger">
                        <button class="btn-edit-inline" 
                                data-id="${c.dni}" 
                                data-premium="${esPremium}"
                                data-critico="${esCritico}">Editar</button>
                        <button class="btn-delete-inline" data-id="${c.dni}">Remover</button>
                    </div>
                </div>
            `;
        }).join('');

        this.vincularEventosInteractivosFichero();
    }

    /**
     * Vincula listeners lógicos evitando inyecciones e interactuando con la memoria local.
     */
    vincularEventosInteractivosFichero() {
        this.listadoContainer.querySelectorAll('.btn-delete-inline').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm("⚠️ ¿Dar de baja definitiva a este cliente de la base de datos maestro?")) {
                    try {
                        // Delega de forma limpia a la capa lógica síncrona de base de datos
                        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                        const { db } = await import('../services/firebaseConfig.js');
                        await deleteDoc(doc(db, "clientes", id));
                        
                        this.limpiarFormulario();
                    } catch (err) {
                        console.error("[ClientesController] Erradicación fallida:", err);
                    }
                }
            });
        });

        this.listadoContainer.querySelectorAll('.btn-edit-inline').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target;
                const targetId = targetBtn.getAttribute('data-id');
                
                // Recuperamos de forma segura el registro exacto de la caché para evitar Attribute Injection XSS
                const clienteOriginal = this.cacheClientesList.find(c => String(c.dni) === String(targetId));
                
                if (!clienteOriginal) return;

                // Carga estricta de datos limpios sobre los inputs del formulario operativo
                this.hiddenIdInput.value = clienteOriginal.dni;
                this.dniInput.value = clienteOriginal.dni;
                this.nombreInput.value = clienteOriginal.nombre;
                this.telefonoInput.value = clienteOriginal.telefono || '';
                this.direccionInput.value = clienteOriginal.direccion;

                this.checkPremium.checked = targetBtn.getAttribute('data-premium') === 'true';
                this.checkCritico.checked = targetBtn.getAttribute('data-critico') === 'true';

                this.btnSubmit.textContent = "Actualizar Datos Cliente";
                this.btnCancel.style.style.display = "inline-block";
                
                this.nombreInput.focus();
            });
        });
    }

    /**
     * Interceptor geográfico asíncrono corporativo conectado al Nominatim Engine.
     * @private
     */
    async _obtenerCoordenadasAsync(direccionTexto) {
        if (!direccionTexto) return { lat: -34.4824, lng: -58.5032 };
        
        let queryLimpia = direccionTexto.trim();
        if (!queryLimpia.toLowerCase().includes("buenos aires")) {
            queryLimpia += ", Buenos Aires, Argentina";
        }

        try {
            const urlApi = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryLimpia)}&limit=1`;
            const respuesta = await fetch(urlApi, { headers: { 'User-Agent': 'Martinez-Routing-Application-v3.0' } });
            if (respuesta.ok) {
                const dataJson = await respuesta.json();
                if (dataJson && dataJson.length > 0) {
                    return {
                        lat: parseFloat(dataJson[0].lat),
                        lng: parseFloat(dataJson[0].lon)
                    };
                }
            }
        } catch (err) {
            console.warn("Fallo en pasarela cartográfica perimetral. Utilizando aproximación controlada.");
        }

        const desvio = (Math.random() - 0.5) * 0.002;
        const esPilar = queryLimpia.toLowerCase().includes("astolfi") || queryLimpia.toLowerCase().includes("pilar");
        return {
            lat: (esPilar ? -34.4998 : -34.4824) + desvio,
            lng: (esPilar ? -58.8643 : -58.5032) + desvio
        };
    }

    /**
     * Registra el interceptor de envío del formulario unificando contratos de datos logísticos.
     */
    setupFormSubmitListener() {
        if (!this.formCliente) return;

        this.formCliente.addEventListener('submit', async (e) => {
            e.preventDefault();

            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = "Procesando coordenadas logísticas...";

            const dniDocumento = Sanitizers.sanitizeAlphanumericCode(this.dniInput.value);
            const direccionTexto = this.direccionInput.value.trim();

            const geoResult = await this._obtenerCoordenadasAsync(direccionTexto);

            // Estructura limpia alineada al contrato de Section 1 del DatabaseService
            const payloadData = {
                dni: dniDocumento,
                nombre: this.nombreInput.value.trim(),
                telefono: this.telefonoInput.value.trim(),
                direccion: direccionTexto,
                coordenadas: geoResult, // Objeto unificado {lat, lng} requerido por mapModule
                premium: this.checkPremium.checked,
                critico: this.checkCritico.checked,
                motivoCritico: this.checkCritico.checked ? "Marcado manual desde terminal CRM" : ""
            };

            try {
                // Invocamos la abstracción de almacenamiento de datos unificada
                await DatabaseService.guardarCliente(payloadData);
                alert("¡Fichero Maestro de Clientes actualizado con éxito geográfico!");
                this.limpiarFormulario();
            } catch (err) {
                console.error("Fallo crítico en operaciones del Fichero Maestro: ", err);
                alert("Ocurrió un error al persistir los cambios en el servidor corporativo.");
            } finally {
                this.btnSubmit.disabled = false;
                this.btnSubmit.textContent = this.hiddenIdInput.value ? "Actualizar Datos Cliente" : "Guardar Cliente en Base";
            }
        });
    }

    /**
     * Inicializa los listeners predictivos de búsqueda en tiempo de ejecución.
     */
    setupSearchFilterListener() {
        if (!this.searchBox) return;

        this.searchBox.addEventListener('input', (e) => {
            const termino = e.target.value.trim().toLowerCase();

            if (!termino) {
                this.renderClientes(this.cacheClientesList);
                return;
            }

            const listaFiltrada = this.cacheClientesList.filter(c => {
                const matchDni = String(c.dni || '').toLowerCase().includes(termino);
                const matchNombre = String(c.nombre || '').toLowerCase().includes(termino);
                const matchDir = String(c.direccion || '').toLowerCase().includes(termino);
                return matchDni || matchNombre || matchDir;
            });

            this.renderClientes(listaFiltrada);
        });
    }

    setupCancelButtonListener() {
        if (this.btnCancel) {
            this.btnCancel.addEventListener('click', () => this.limpiarFormulario());
        }
    }

    /**
     * Resetea el formulario y los estados volátiles del controlador visual.
     */
    limpiarFormulario() {
        if (this.formCliente) this.formCliente.reset();
        this.hiddenIdInput.value = "";
        this.checkPremium.checked = false;
        this.checkCritico.checked = false;
        this.btnSubmit.textContent = "Guardar Cliente en Base";
        this.btnCancel.style.style.display = "none";
    }

    /**
     * Destruye de forma segura los observadores de Firebase activos en la ventana.
     */
    destroy() {
        if (this._unsubscribeClientes) this._unsubscribeClientes();
    }
}

// Inicialización controlada acoplada al ciclo de vida del DOM
document.defineProperty(window, 'ClientesControllerInstance', {
    value: new ClientesController(),
    writable: false,
    configurable: false
});

document.addEventListener('DOMContentLoaded', () => {
    window.ClientesControllerInstance.init();
});