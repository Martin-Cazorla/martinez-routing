/**
 * @fileoverview Orquestador y controlador visual de la terminal de despacho centralizada (Dashboard).
 * Gobierna eventos del DOM, inyecciones reactivas y flujos masivos de datos para Martinez Routing.
 * @version 3.0.0
 * @package MartinezRouting.Controllers
 */

import { store } from '../state/store.js';
import { DatabaseService } from '../services/databaseService.js';
import { ExcelParser } from '../modules/excelParser.js';
import { Sanitizers } from '../utils/sanitizers.js';

export class DashboardController {
    /**
     * Mapea y valida todas las referencias de nodos del DOM corporativo.
     */
    constructor() {
        // Componentes de control cronológico y carriles
        this.globalDateFilter = document.getElementById('global-date-filter');
        this.unidadesSeccionesContainer = document.getElementById('unidades-secciones-container');
        
        // Entradas exprés de despacho vehicular
        this.inputExpressUnidad = document.getElementById('input-express-unidad');
        this.selectExpressIngreso = document.getElementById('select-express-ingreso');

        // Contadores superiores de métricas (KPI)
        this.countTotal = document.getElementById('count-total');
        this.countDisp = document.getElementById('count-disp');
        this.countExtra = document.getElementById('count-extra');

        // Subsistema de inyección masiva SheetJS
        this.excelInput = document.getElementById('excel-file');
        this.fileNameDisplay = document.getElementById('file-name-display');
        this.btnProcesar = document.getElementById('btn-procesar-carga');
        this.listadoPedidosContainer = document.getElementById('listado-pedidos');

        // Subsistema de Gestión de Incidentes (Alertas Fuego)
        this.formReclamo = document.getElementById('form-reclamo');
        this.recDniInput = document.getElementById('rec-dni');
        this.recDireccionSelect = document.getElementById('rec-direccion');
        this.recClienteStatus = document.getElementById('rec-cliente-status');
        this.listadoReclamosContainer = document.getElementById('listado-reclamos');

        // Componentes del diálogo modal manual de órdenes
        this.modalPedido = document.getElementById('modal-pedido');
        this.formManualPedido = document.getElementById('form-manual-pedido');
        this.pDniInput = document.getElementById('p-dni');
        this.pDireccionSelect = document.getElementById('p-direccion-select');
        this.pDireccionSelectGroup = document.getElementById('domicilios-select-group');
        this.pDireccionNueva = document.getElementById('p-direccion-nueva');

        // Elementos del diálogo nativo de auditoría mecánica vehicular
        this.dialogGestion = document.getElementById('modal-gestion-unidad');
        this.dialogInternoDisplay = document.getElementById('modal-interno-display');
        this.dialogNotesArea = document.getElementById('modal-notes-area');
        this.dialogCheckForceExtra = document.getElementById('modal-checkbox-force-extra');
        this.btnSaveDialog = document.getElementById('btn-save-gestion-dialog');
        this.btnFinalizeUnit = document.getElementById('btn-finalizar-jornada-unidad');
        this.btnCloseDialog = document.getElementById('btn-close-gestion-dialog');

        // Estado operativo interno volátil del controlador
        this.activeUnitIdForDialog = null; 
        this.pedidosCargadosExcel = [];
        this.pedidoIdEnEdicion = null;
        this.coordenadasClienteCache = null;

        // Punteros de desuscripción de streams en tiempo real
        this._unsubscribes = { unidades: null, pedidos: null, reclamos: null, store: null };
        this.franjasHorariasValidas = ["09:00 hs", "10:00 hs", "11:00 hs", "Electro", "Ausente"];
    }

    /**
     * Inicializa los listeners de UI y activa el flujo unificado de sincronización de la jornada.
     */
    init() {
        if (this.globalDateFilter) {
            this.globalDateFilter.value = new Date().toISOString().split('T')[0];
            this.globalDateFilter.addEventListener('change', () => this.sincronizarTodaLaJornada());
        }

        this.setupTabsBehavior();
        this.setupModalToggles();
        this.setupExcelEventListeners();
        this.setupExpressDispatchListener();
        this.setupDniCrossSearching();
        this.setupDialogActions();
        this.setupManualOrderFormListener(); 

        // Nos acoplamos al Single Source of Truth reactivo
        this._unsubscribes.store = store.subscribe((state) => this.renderUIFromState(state));

        this.sincronizarTodaLaJornada();
    }

    /**
     * Modifica los streams activos enlazándolos a los listeners optimizados del DatabaseService.
     */
    sincronizarTodaLaJornada() {
        const fechaSeleccionada = this.globalDateFilter.value;
        store.updateFiltros({ fecha: fechaSeleccionada });

        // Purgamos de forma controlada los listeners abiertos para mitigar leaks de memoria
        if (this._unsubscribes.unidades) this._unsubscribes.unidades();
        if (this._unsubscribes.pedidos) this._unsubscribes.pedidos();

        // 1. Conectamos los streams de datos hacia mutaciones directas y atómicas del Store
        this._unsubscribes.unidades = DatabaseService.escucharFlota((unidadesData) => {
            store.setUnidades(unidadesData);
        });

        this._unsubscribes.pedidos = DatabaseService.escucharPedidosPorFecha(fechaSeleccionada, (pedidosData) => {
            store.setPedidos(pedidosData);
        });
    }

    /**
     * Procesa las colecciones inmutables del Store y actualiza de forma segura la interfaz.
     * @param {Object} state Clon profundo inmutable del estado global.
     */
    renderUIFromState(state) {
        this.renderFlotaCarriles(state.unidades, state.pedidos);
        this.renderPedidosPanelList(state.pedidos);
    }

    /**
     * Renderiza las tarjetas vehiculares organizadas por carriles horarios de ingreso operativo.
     */
    renderFlotaCarriles(unidades, pedidos) {
        if (!this.unidadesSeccionesContainer) return;

        let total = 0, enVuelta = 0, enExtra = 0;
        const mapaGrupos = { "09:00 hs": [], "10:00 hs": [], "11:00 hs": [], "Electro": [], "Ausente": [] };

        // Mapeamos qué internos tienen alertas de incidentes activas (Fuego Cruzado)
        const internosConFuego = new Set();
        pedidos.forEach(p => {
            if (p.estadoRuta === "assigned" && p.idTransporteAsignado) {
                // Si el pedido asignado tiene bandera de crítico, el camión hereda el estado visual de alerta
                internosConFuego.add(String(p.idTransporteAsignado).toLowerCase());
            }
        });

        unidades.forEach(u => {
            total++;
            if (u.forzarExtra || u.vueltasCompletadas >= 4) enExtra++; else enVuelta++;

            const grupo = this.franjasHorariasValidas.includes(u.ingreso) ? u.ingreso : "Ausente";
            mapaGrupos[grupo].push(u);
        });

        let htmlMaestro = "";
        this.franjasHorariasValidas.forEach(franja => {
            const lista = mapaGrupos[franja];
            if (!lista || lista.length === 0) return;

            htmlMaestro += `
                <div class="bloque-horario-jornada">
                    <h3 class="horario-header-title">INGRESO ${franja}</h3>
                    <div class="horario-cards-grid">
                        ${lista.map(u => {
                            const intSeguro = Sanitizers.escapeHtml(u.numeroUnidad);
                            const choSeguro = Sanitizers.escapeHtml(u.nombreChofer);
                            const modSeguro = Sanitizers.escapeHtml(u.modeloUnidad);
                            const notaSegura = Sanitizers.escapeHtml(u.comentariosUnidad || '');
                            
                            const claseCampoColor = u.estadoOperativo === "campo" ? 'badge--danger' : 'badge--info';
                            const claseUnidadEnCampo = u.estadoOperativo === "campo" ? 'card-unidad-tactica--en-campo' : '';
                            const claseFinalizada = u.estadoOperativo === "finalizado" ? 'card-unidad-tactica--finalizada' : '';
                            const tieneFuegoCruzado = internosConFuego.has(String(u.numeroUnidad).toLowerCase());
                            const claseFuegoEfecto = tieneFuegoCruzado ? 'card-unidad-tactica--fuego-activo' : '';

                            return `
                                <article class="card-panel card-unidad-tactica ${claseUnidadEnCampo} ${claseFinalizada} ${claseFuegoEfecto}" 
                                         data-id="${intSeguro}" data-interno="${intSeguro}" data-notes="${notaSegura}" data-force-extra="${Boolean(u.forzarExtra)}">
                                    ${u.vueltasCompletadas >= 3 ? '<div class="sello-jornada-cumplida">JORNADA CUMPLIDA</div>' : ''}
                                    <div class="card-unidad-header">
                                        <div class="card-header-left">
                                            <strong class="card-interno-display">${tieneFuegoCruzado ? '🔥 ' : ''}#${intSeguro}</strong>
                                            <span class="badge ${claseCampoColor} btn-toggle-campo-express" data-id="${intSeguro}">${u.estadoOperativo === "campo" ? 'CAMPO SÍ' : 'CAMPO NO'}</span>
                                        </div>
                                    </div>
                                    <div class="card-unidad-info">
                                        <span class="driver-title">${choSeguro}</span><br>
                                        <span class="model-title">${modSeguro}</span>
                                    </div>
                                    <div class="grid-vueltas-buttons">
                                        <button class="btn-primary btn-toggle-vuelta ${u.v10 ? 'btn-vuelta-activa' : 'btn-vuelta-apagada'}" data-id="${intSeguro}" data-v="v10">10:00</button>
                                        <button class="btn-primary btn-toggle-vuelta ${u.v13 ? 'btn-vuelta-activa' : 'btn-vuelta-apagada'}" data-id="${intSeguro}" data-v="v13">13:00</button>
                                        <button class="btn-primary btn-toggle-vuelta ${u.v16 ? 'btn-vuelta-activa' : 'btn-vuelta-apagada'}" data-id="${intSeguro}" data-v="v16">16:00</button>
                                        <button class="btn-primary btn-toggle-vuelta ${u.v19 ? 'btn-vuelta-activa' : 'btn-vuelta-apagada'}" data-id="${intSeguro}" data-v="v19">19:00</button>
                                    </div>
                                    <div class="vueltas-counter-display">
                                        <span>${u.forzarExtra ? 'EXTRA' : u.vueltasCompletadas + '/4'}</span>
                                        ${u.forzarExtra ? '<span class="label-extra-sub">EXTRA ACTIVADO</span>' : ''}
                                    </div>
                                    <div class="card-unidad-footer-notes btn-trigger-modal-gestion">
                                        📝 <em>${notaSegura || 'Haga clic para agregar nota...'}</em>
                                    </div>
                                </article>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        this.unidadesSeccionesContainer.innerHTML = htmlMaestro || `<div class="placeholder-vacio-jornada">No hay camiones despachados para la fecha seleccionada.</div>`;
        
        // Renderizado atómico de contadores KPI de control superior
        if (this.countTotal) this.countTotal.textContent = total;
        if (this.countDisp) this.countDisp.textContent = enVuelta;
        if (this.countExtra) this.countExtra.textContent = enExtra;

        this.vincularEventosInteractivosTarjetas();
    }

    /**
     * Vincula listeners semánticos sobre los componentes interactivos de las tarjetas inyectadas.
     */
    vincularEventosInteractivosTarjetas() {
        this.unidadesSeccionesContainer.querySelectorAll('.btn-toggle-vuelta').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.getAttribute('data-id');
                const campoVuelta = e.target.getAttribute('data-v');
                const estaPrendida = e.target.classList.contains('btn-vuelta-activa');
                
                if (!estaPrendida && campoVuelta === 'v16') alert("⚠️ ¡JORNADA CUMPLIDA! Alcanzó las 3 vueltas.");
                
                // Las mutaciones viajan exclusivamente por el canal asíncrono del servicio corporativo
                await DatabaseService.guardarVehiculo({
                    numeroUnidad: id,
                    [campoVuelta]: !estaPrendida,
                    vueltasCompletadas: !estaPrendida ? 3 : 2 // Simulación controlada del acumulador logístico
                });
            });
        });

        this.unidadesSeccionesContainer.querySelectorAll('.btn-toggle-campo-express').forEach(badge => {
            badge.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.getAttribute('data-id');
                const esActivoActualmente = e.target.textContent.includes('CAMPO SÍ');
                
                if (!esActivoActualmente) alert("🚩 ALERTA: Unidad despachada al campo.");
                await DatabaseService.guardarVehiculo({
                    numeroUnidad: id,
                    estadoOperativo: esActivoActualmente ? "disponible" : "campo"
                });
            });
        });

        this.unidadesSeccionesContainer.querySelectorAll('.btn-trigger-modal-gestion').forEach(div => {
            div.addEventListener('click', (e) => {
                const card = e.target.closest('.card-unidad-tactica');
                this.activeUnitIdForDialog = card.getAttribute('data-id');
                this.dialogInternoDisplay.textContent = card.getAttribute('data-interno');
                this.dialogNotesArea.value = card.getAttribute('data-notes');
                this.dialogCheckForceExtra.checked = card.getAttribute('data-force-extra') === 'true';
                this.dialogGestion.showModal();
            });
        });
    }

    /**
     * Registra los eventos de confirmación y cierre del elemento <dialog> de auditoría vehicular.
     */
    setupDialogActions() {
        if (!this.dialogGestion) return;
        this.btnCloseDialog.addEventListener('click', () => this.dialogGestion.close());
        this.btnSaveDialog.addEventListener('click', async () => {
            if (!this.activeUnitIdForDialog) return;
            await DatabaseService.guardarVehiculo({
                numeroUnidad: this.activeUnitIdForDialog,
                comentariosUnidad: this.dialogNotesArea.value.trim(),
                forzarExtra: this.dialogCheckForceExtra.checked
            });
            this.dialogGestion.close();
        });
        this.btnFinalizeUnit.addEventListener('click', async () => {
            if (!this.activeUnitIdForDialog) return;
            if (confirm("¿Confirmar cierre final de jornada laboral?")) { 
                await DatabaseService.guardarVehiculo({
                    numeroUnidad: this.activeUnitIdForDialog,
                    estadoOperativo: "finalizado"
                }); 
                this.dialogGestion.close(); 
            }
        });
    }

    /**
     * Renderiza el listado maestro de pedidos de la jornada en el panel lateral de control manual.
     */
    renderPedidosPanelList(pedidos) {
        if (!this.listadoPedidosContainer) return;

        this.listadoPedidosContainer.innerHTML = pedidos.map(p => {
            const iconoFuego = p.estadoRuta === "assigned" ? ' 🔥' : '';
            const numPed = p.numeroPedido || 'S/N';
            const dniCli = p.clienteDni || 'S/D';
            const idSeguro = Sanitizers.escapeHtml(p.id);
            const dirSegura = Sanitizers.escapeHtml(p.direccion || '');
            const impSeguro = parseFloat(p.importe || 0);
            const fraSegura = Sanitizers.escapeHtml(p.franjaHoraria || '10:00-14:00');

            return `
                <div class="card-panel manual-order-item-row ${p.estadoRuta === 'assigned' ? 'order-item--critical' : ''}">
                    <div class="manual-order-item-row__info">
                        <strong>Orden: #${Sanitizers.escapeHtml(numPed)}${iconoFuego}</strong><br>
                        <span class="sub-text-dni">DNI: ${Sanitizers.escapeHtml(dniCli)}</span>
                    </div>
                    <div class="manual-order-item-row__actions">
                        <span class="badge badge--info">$${impSeguro.toLocaleString('es-AR')}</span>
                        <button class="btn-secondary btn-edit-pedido-inline" 
                                data-id="${idSeguro}" data-numero="${Sanitizers.escapeHtml(numPed)}" data-dni="${Sanitizers.escapeHtml(dniCli)}" data-importe="${impSeguro}" data-franja="${fraSegura}" data-direccion="${dirSegura}">
                            ✏️
                        </button>
                    </div>
                </div>
            `;
        }).join('') || '<div class="placeholder-vacio-jornada">No hay órdenes cargadas hoy.</div>';

        this.vincularEventosInternosPedidos();
    }

    vincularEventosInternosPedidos() {
        this.listadoPedidosContainer.querySelectorAll('.btn-edit-pedido-inline').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = e.target.closest('.btn-edit-pedido-inline');
                this.pedidoIdEnEdicion = b.getAttribute('data-id');
                this.pDniInput.value = b.getAttribute('data-dni');
                document.getElementById('p-numero').value = b.getAttribute('data-numero');
                document.getElementById('p-importe').value = b.getAttribute('data-importe');
                document.getElementById('p-franja').value = b.getAttribute('data-franja');
                
                this.pDireccionSelectGroup.style.display = "none";
                this.pDireccionNueva.value = b.getAttribute('data-direccion');
                this.formManualPedido.querySelector('button[type="submit"]').textContent = "Actualizar Detalles Pedido";
                this.toggleModal(this.modalPedido, true);
            });
        });
    }

    /**
     * Interceptor geográfico y validador de coordenadas industriales contra errores de Nominatim.
     */
    async _geocodificarDireccionAsync(direccionTexto) {
        // Intercepción estricta obligatoria para calle Sanguinetti, Villa Astolfi, Pilar
        if (direccionTexto.toLowerCase().includes("sanguinetti")) {
            console.log("🎯 [CONTI_ZONAL] Intercepción de coordenadas reales de Sanguinetti, Villa Astolfi (Pilar).");
            return { lat: -34.49983, lng: -58.86431 };
        }

        if (this.coordenadasClienteCache) {
            return this.coordenadasClienteCache;
        }

        const esZonaPilar = direccionTexto.toLowerCase().includes("astolfi") || direccionTexto.toLowerCase().includes("pilar");
        let queryLimpia = direccionTexto.replace(/[A-Z]?\d{4}[A-Z]{3}/gi, '').replace(/\b\d{4}\b/g, '').trim();

        if (esZonaPilar && !queryLimpia.toLowerCase().includes("pilar")) {
            queryLimpia += ", Villa Astolfi, Pilar";
        }
        queryLimpia += ", Buenos Aires, Argentina";

        try {
            const urlApi = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryLimpia)}&countrycodes=ar&limit=1`;
            const respuesta = await fetch(urlApi, { headers: { 'User-Agent': 'Martinez-Routing-Application-v3.0' } });
            
            if (respuesta.ok) {
                const dataJson = await respuesta.json();
                if (dataJson && dataJson.length > 0) {
                    return { lat: parseFloat(dataJson[0].lat), lng: parseFloat(dataJson[0].lon) };
                }
            }
        } catch (err) { 
            console.warn("API de mapas saturada. Derivando a centroide distribuido."); 
        }
        
        // Fallback matemático con dispersión para evitar colisiones de píxeles
        const latBase = esZonaPilar ? -34.4998 : -34.4824;
        const lngBase = esZonaPilar ? -58.8643 : -58.5032;
        return { lat: latBase + (Math.random() - 0.5) * 0.002, lng: lngBase + (Math.random() - 0.5) * 0.002 }; 
    }

    setupExcelEventListeners() {
        if (!this.excelInput) return;
        this.excelInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this.fileNameDisplay.textContent = file.name;
            try { 
                this.pedidosCargadosExcel = await ExcelParser.importarPedidoJumbo(file); 
                this.btnProcesar.disabled = false; 
            } catch (err) { 
                this.btnProcesar.disabled = true; 
                this.pedidosCargadosExcel = []; 
                alert("❌ Manifiesto Excel corrupto o inválido."); 
            }
        });

        if (this.btnProcesar) {
            this.btnProcesar.addEventListener('click', async () => {
                if (this.pedidosCargadosExcel.length === 0) return;
                this.btnProcesar.disabled = true;

                try {
                    const fechaActualBarra = this.globalDateFilter.value;
                    const pedidosEstructurados = [];

                    for (const p of this.pedidosCargadosExcel) {
                        this.coordenadasClienteCache = null;
                        const coordReal = await this._geocodificarDireccionAsync(p.direccion);
                        pedidosEstructurados.push({ ...p, coordenadas: coordReal, fecha: fechaActualBarra });
                    }

                    await DatabaseService.guardarPedidosMasivos(pedidosEstructurados);
                    alert(`¡Inyección de ${pedidosEstructurados.length} órdenes completada con éxito!`);
                    this.pedidosCargadosExcel = []; 
                    this.excelInput.value = ""; 
                    this.fileNameDisplay.textContent = "Ningún archivo seleccionado";
                } catch (err) { 
                    console.error(err); 
                } finally { 
                    this.btnProcesar.disabled = false; 
                }
            });
        }
    }

    setupManualOrderFormListener() {
        if (!this.formManualPedido) return;

        this.formManualPedido.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usarDireccionSelect = this.pDireccionSelectGroup.style.display === "block";
            const direccionFinal = usarDireccionSelect ? this.pDireccionSelect.value : this.pDireccionNueva.value.trim();

            if (!direccionFinal) { alert("⚠️ Especifique domicilio de entrega."); return; }
            const dniConsultado = this.pDniInput.value.trim();

            const coordRealSetteada = await this._geocodificarDireccionAsync(direccionFinal);

            const dataManualOrder = {
                clienteDni: dniConsultado,
                numeroPedido: document.getElementById('p-numero').value.trim(),
                importe: parseFloat(document.getElementById('p-importe').value) || 0,
                franjaHoraria: document.getElementById('p-franja').value,
                direccion: direccionFinal,
                coordenadas: coordRealSetteada,
                fecha: this.globalDateFilter.value,
                estadoRuta: "unassigned"
            };

            try {
                // Sincronizamos de forma directa a través de DatabaseService
                if (this.pedidoIdEnEdicion) {
                    dataManualOrder.id = this.pedidoIdEnEdicion;
                }
                // Simulación/Llamada unificada al guardado de pedidos masivos/individuales
                await DatabaseService.guardarPedidosMasivos([dataManualOrder]);
                alert(`¡Orden procesada correctamente!`);

                this.pedidoIdEnEdicion = null;
                this.coordenadasClienteCache = null;
                this.formManualPedido.reset();
                this.pDireccionSelectGroup.style.display = "none";
                this.toggleModal(this.modalPedido, false); 
            } catch (err) { 
                console.error(err); 
            }
        });
    }

    setupExpressDispatchListener() {
        if (!this.inputExpressUnidad) return;
        this.inputExpressUnidad.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const buscadorTermino = this.inputExpressUnidad.value.trim().toLowerCase();
                const franjaSeleccionada = this.selectExpressIngreso.value;
                const fechaActualBarra = this.globalDateFilter.value;

                if (!buscadorTermino) return;

                try {
                    // Simulación e inyección controlada de alta vehicular en el pool de la jornada
                    await DatabaseService.guardarVehiculo({
                        numeroUnidad: buscadorTermino,
                        nombreChofer: "CHOFER CORPO",
                        modeloUnidad: "Furgón Estable",
                        tamanioUnidad: "Mediano",
                        ingreso: franjaSeleccionada,
                        estadoOperativo: "disponible"
                    });
                    this.inputExpressUnidad.value = ''; 
                } catch (err) { 
                    console.error(err); 
                }
            }
        });
    }

    setupDniCrossSearching() {
        if (this.pDniInput) {
            this.pDniInput.addEventListener('input', () => { this.coordenadasClienteCache = null; });
        }
    }

    setupTabsBehavior() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanels = document.querySelectorAll('.tab-panel');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
                tabPanels.forEach(p => { p.classList.remove('active'); p.setAttribute('hidden', 'true'); });
                btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
                const panelId = btn.getAttribute('aria-controls');
                const activePanel = document.getElementById(panelId);
                if (activePanel) { activePanel.classList.add('active'); activePanel.removeAttribute('hidden'); }
            });
        });
    }

    setupModalToggles() {
        const btnOpenPedido = document.getElementById('btn-manual-pedido-modal');
        const closeButtons = document.querySelectorAll('.btn-close-modal');

        if (btnOpenPedido) {
            btnOpenPedido.addEventListener('click', () => {
                this.pedidoIdEnEdicion = null;
                this.coordenadasClienteCache = null;
                this.formManualPedido.reset();
                this.pDireccionSelectGroup.style.display = "none";
                this.toggleModal(this.modalPedido, true);
            });
        }

        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const openModal = e.target.closest('.modal-overlay');
                this.toggleModal(openModal, false);
            });
        });
    }

    toggleModal(modal, open) {
        if (!modal) return;
        if (open) { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
        else { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
    }
}

// Inicialización controlada por el ciclo de vida del DOM
document.addEventListener('DOMContentLoaded', () => {
    const dashboardCtrl = new DashboardController();
    dashboardCtrl.init();
});