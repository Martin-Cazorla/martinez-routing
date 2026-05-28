/**
 * @fileoverview Controlador maestro de la Consola Cartográfica de Despacho y Ruteo.
 * Orquesta la captura geoespacial por lazo, asignaciones masivas en lote y renderizado reactivo.
 * @version 3.0.0
 * @package MartinezRouting.Controllers
 */

import { store } from '../state/store.js'; 
import { MapModule } from '../modules/mapModule.js'; 
import { DatabaseService } from '../services/databaseService.js';
import { Sanitizers } from '../utils/sanitizers.js'; 

export class ShippingController {
    /**
     * Inicializa las variables de control y los elementos estructurales de la consola de ruteo.
     */
    constructor() {
        /** @type {MapModule|null} Instanceado del lienzo cartográfico de Leaflet */
        this.mapModule = null;
        
        // Elementos de filtrado y paneles laterales
        this.filterSelect = null;
        this.sidebarContainer = null;
        this.mapDateFilter = document.getElementById('map-date-filter');

        // Componentes del cuadro de diálogo nativo <dialog> de asignación en lote
        this.dialogAsignacion = document.getElementById('modal-asignacion-flota');
        this.loteCantidadDisplay = document.getElementById('modal-lote-cantidad');
        this.selectTransporteLote = document.getElementById('select-transporte-lote');
        this.btnConfirmarLote = document.getElementById('btn-confirmar-despacho-lote');
        this.btnCancelarLote = document.getElementById('btn-cancelar-lote');
        this.btnCloseX = document.getElementById('btn-close-assignment-dialog');

        /** @type {Array<string>} Buffer transaccional temporal de IDs de órdenes seleccionadas */
        this.loteIdsSeleccionados = [];
        
        /** @type {Object} Contenedor inmutable de desuscripciones para aislamiento de memoria */
        this._unsubscribes = { pedidos: null, store: null }; 
    }

    /**
     * Inicializa los listeners de interfaz y suscribe el componente al SSOT (Single Source of Truth).
     */
    init() {
        this.filterSelect = document.getElementById('filter-franja');
        this.sidebarContainer = document.getElementById('pedidos-list-append');

        if (this.mapDateFilter) {
            this.mapDateFilter.value = new Date().toISOString().split('T')[0];
            this.mapDateFilter.addEventListener('change', () => this.sincronizarMapaPorFecha());
        }

        // Inicialización controlada del lienzo cartográfico acoplado al lazo selector geométrico
        if (!this.mapModule) {
            try {
                this.mapModule = new MapModule('map', (selectedIds) => {
                    this.handleMassAssignment(selectedIds);
                });
            } catch (mapError) {
                console.error("[ShippingController] Error crítico al montar el lienzo de Leaflet:", mapError);
            }
        }

        // Suscripción estricta al almacén unificado e inmutable de estado global
        this._unsubscribes.store = store.subscribe((state) => this.render(state));
        
        this.setupEventListeners();
        this.setupDialogListeners();
        this.sincronizarMapaPorFecha(); 
    }

    /**
     * Rompe el flujo anterior de red y solicita un nuevo canal de escucha basado en la fecha seleccionada.
     */
    sincronizarMapaPorFecha() {
        if (!this.mapDateFilter) return;
        const fechaSeleccionada = this.mapDateFilter.value;
        
        // Actualizamos los parámetros de filtrado global del Store
        store.updateFiltros({ fecha: fechaSeleccionada });

        // Purgamos el stream anterior para prevenir fugas parásitas de cuota de red
        if (this._unsubscribes.pedidos) this._unsubscribes.pedidos();

        // Conectamos el flujo asíncrono delegando en el DatabaseService
        this._unsubscribes.pedidos = DatabaseService.escucharPedidosPorFecha(fechaSeleccionada, (pedidosData) => {
            // Seteamos los datos en el Store usando mutaciones atómicas seguras
            store.setPedidos(pedidosData);
        });
    }

    /**
     * Registra gestores de eventos para los selectores de filtrado perimetral.
     */
    setupEventListeners() {
        if (!this.filterSelect) return;
        this.filterSelect.addEventListener('change', (e) => {
            store.updateFiltros({ franjaHoraria: e.target.value });
        });
    }

    /**
     * Modifica los flujos de confirmación y gestiona el ciclo de vida del modal nativo.
     */
    setupDialogListeners() {
        if (!this.dialogAsignacion) return;
        
        const cerrarModal = () => {
            this.dialogAsignacion.close();
            this.loteIdsSeleccionados = [];
        };
        
        if (this.btnCloseX) this.btnCloseX.addEventListener('click', cerrarModal);
        if (this.btnCancelarLote) this.btnCancelarLote.addEventListener('click', cerrarModal);

        if (this.btnConfirmarLote) {
            this.btnConfirmarLote.addEventListener('click', async () => {
                if (this.loteIdsSeleccionados.length === 0) return;
                const internoElegido = this.selectTransporteLote.value;
                
                if (!internoElegido) {
                    alert("❌ Seleccione una unidad de transporte válida.");
                    return;
                }

                this.btnConfirmarLote.disabled = true;
                this.btnConfirmarLote.textContent = "Despachando lote...";

                try {
                    // Consumimos el servicio unificado atómico de actualización masiva
                    await DatabaseService.asignarPedidosAVehiculo(this.loteIdsSeleccionados, internoElegido);
                    
                    alert(`¡Lote de ${this.loteIdsSeleccionados.length} órdenes asignado con éxito al Interno #${internoElegido}!`);
                    cerrarModal();
                } catch (err) { 
                    console.error("[ShippingController] Error transaccional al despachar lote masivo:", err);
                    alert("Ocurrió un error en el servidor al intentar consolidar el despacho.");
                } finally {
                    this.btnConfirmarLote.disabled = false;
                    this.btnConfirmarLote.textContent = "Confirmar Despacho Lote";
                }
            });
        }
    }

    /**
     * Intercepta las mutaciones inmutables del Store y actualiza de forma síncrona los componentes.
     * @param {Object} state Clon profundo inmutable del estado global de la aplicación.
     */
    render(state) {
        const pedidos = state?.pedidos || [];
        const filtros = state?.filtros || { franjaHoraria: 'all' };

        // Lógica de negocio discriminatoria: Solo mostramos órdenes pendientes y sin asignación vehicular
        const pedidosFiltrados = pedidos.filter(pedido => {
            const cumpleFranja = filtros.franjaHoraria === 'all' || pedido.franjaHoraria === filtros.franjaHoraria;
            const estaDisponible = !pedido.idTransporteAsignado && pedido.estadoRuta === "unassigned"; 
            return cumpleFranja && estaDisponible;
        });

        // 1. Sincronizamos las capas cartográficas vectoriales en Leaflet
        if (this.mapModule) {
            this.mapModule.updateMarkers(pedidosFiltrados);
            this.mapModule.resize();
        }

        // 2. Renderizamos el panel lateral de soporte analítico
        this.renderListSidebar(pedidosFiltrados);
    }

    /**
     * Inserta las tarjetas informativas en la barra lateral inyectando datos sanitizados.
     * @param {Array<Object>} pedidos Matriz de órdenes filtradas seguras.
     */
    renderListSidebar(pedidos) {
        if (!this.sidebarContainer) return;

        if (pedidos.length === 0) {
            this.sidebarContainer.innerHTML = `
                <div class="placeholder-vacio-jornada">
                    No hay pedidos disponibles para asignar en esta ventana.
                </div>`;
            return;
        }

        // Higienizamos de forma preventiva la estructura completa antes de generar los strings literales
        const safePedidos = Sanitizers.sanitizeStructure(pedidos);

        this.sidebarContainer.innerHTML = safePedidos.map(p => {
            const importeSeguro = parseFloat(p.importe || 0).toLocaleString('es-AR', { 
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            const franjaClass = this._getClassPorFranja(p.franjaHoraria);

            let claseAlertaFila = ""; 
            let iconoTag = "";
            
            if (p.critico || p.esCritico) { 
                claseAlertaFila = " card-pedido--critical-alert"; 
                iconoTag = "🔥 "; 
            } else if (p.premium) { 
                claseAlertaFila = " card-pedido--premium-alert"; 
                iconoTag = "⭐ "; 
            }

            return `
                <div class="card-pedido ${franjaClass}${claseAlertaFila}" data-id="${p.id}">
                    <div class="card-pedido__info">
                        <span class="card-pedido__number">${iconoTag}Orden: <strong>#${p.numeroPedido}</strong></span>
                        <span class="card-pedido__amount">$${importeSeguro}</span>
                    </div>
                    <div class="card-pedido__meta">
                        <span class="card-pedido__tag">${p.franjaHoraria}</span>
                        <span class="card-pedido__location-text">${p.direccion}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Mapea la ventana de distribución horaria hacia su correspondiente clase en el Design System.
     * @param {string} franja Criterio horario de entrega.
     * @returns {string} Clase utilitaria del componente SCSS.
     * @private
     */
    _getClassPorFranja(franja) {
        switch (franja) {
            case '10:00-14:00': return 'card-pedido--urgente';
            case '13:00-16:00': return 'card-pedido--mediodia';
            case '16:00-19:00': return 'card-pedido--tarde';
            case '19:00-21:30': return 'card-pedido--nocturno';
            default: return '';
        }
    }

    /**
     * Intercepta la captura del lazo cartográfico, mapea la flota maestra activa y despliega el modal.
     * @param {Array<string>} selectedIds Matriz conteniendo los IDs de documentos de Firestore capturados.
     */
    async handleMassAssignment(selectedIds) {
        if (!Array.isArray(selectedIds) || selectedIds.length === 0) return;
        
        this.loteIdsSeleccionados = selectedIds;
        this.loteCantidadDisplay.textContent = selectedIds.length;

        try {
            // Reutilizamos el canal asíncrono para leer la flota del día y poblar el input transaccional
            const flotaActiva = await DatabaseService.obtenerFlotaEstatica();
            
            let optionsHtml = '<option value="">-- Seleccione Unidad de Destino --</option>';
            
            // Sanitización estructural exhaustiva sobre la colección de camiones mapeados
            const safeFlota = Sanitizers.sanitizeStructure(flotaActiva);

            safeFlota.forEach(vehiculo => {
                optionsHtml += `
                    <option value="${vehiculo.numeroUnidad}">
                        Interno #${vehiculo.numeroUnidad} - ${vehiculo.nombreChofer} (${vehiculo.modeloUnidad})
                    </option>`;
            });

            this.selectTransporteLote.innerHTML = optionsHtml;
            
            if (this.dialogAsignacion) {
                this.dialogAsignacion.showModal(); // Disparador nativo HTML5 libre de inyecciones
            }
        } catch (err) { 
            console.error("[ShippingController] Error al recopilar la flota para despacho masivo:", err); 
        }
    }

    /**
     * Cierra formalmente todas las suscripciones reactivas e hilos de red abiertos al desmontar el controlador.
     */
    destroy() {
        if (this._unsubscribes.pedidos) this._unsubscribes.pedidos();
        if (this._unsubscribes.store) this._unsubscribes.store();
    }
}

// Inicialización perimetral vinculada de forma segura al ciclo de vida del documento
document.addEventListener('DOMContentLoaded', () => {
    const shippingCtrl = new ShippingController();
    shippingCtrl.init();
    
    // Indexación global en ventana para herramientas de diagnóstico técnico en consola
    window.CurrentShippingController = shippingCtrl;
});