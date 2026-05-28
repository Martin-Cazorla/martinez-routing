/**
 * @fileoverview Controlador maestro e indicador ejecutivo (KPI Dashboard) de Martinez Routing.
 * Sincroniza datos consolidados en tiempo real delegando en la capa de servicios distribuidos.
 * @version 3.0.0
 * @package MartinezRouting.Controllers
 */

import { DatabaseService } from '../services/databaseService.js';
import { Sanitizers } from '../utils/sanitizers.js';

export class IndexController {
    /**
     * Inicializa los punteros del DOM y normaliza la estampa cronológica perimetral.
     */
    constructor() {
        // Mapeo selectivo de nodos KPIs superiores
        this.kpiPedidos = document.getElementById('kpi-pedidos');
        this.kpiUnidades = document.getElementById('kpi-unidades');
        this.kpiExtras = document.getElementById('kpi-extras');
        
        // Panel de control de incidentes críticos
        this.containerCriticos = document.getElementById('append-kpi-criticos');
        
        // Formato NoSQL YYYY-MM-DD local
        this.fechaHoy = new Date().toISOString().split('T')[0];

        /** * Almacén inmutable de desuscripciones para prevenir fugas de memoria de red.
         * @private
         */
        this._unsubscribes = { pedidos: null, flota: null, clientes: null };
    }

    /**
     * Orquesta el arranque síncrono del módulo defensivo y activa los flujos de control.
     */
    init() {
        console.log(`🚀 Inicializando Terminal de Control Ejecutivo para la jornada: ${this.fechaHoy}`);
        this.activarMonitoreoKpis();
    }

    /**
     * Suscribe el componente a los flujos reactivos del DatabaseService.
     */
    activarMonitoreoKpis() {
        // 1. Stream de Pedidos de la Jornada
        if (this.kpiPedidos) {
            this._unsubscribes.pedidos = DatabaseService.escucharPedidosPorFecha(this.fechaHoy, (pedidos) => {
                this.kpiPedidos.textContent = pedidos.length;
            });
        }

        // 2. Stream de Flota Vehicular Completa (Normalizado sobre /transporte)
        if (this.kpiUnidades && this.kpiExtras) {
            this._unsubscribes.flota = DatabaseService.escucharFlota((unidades) => {
                let totalUnidades = unidades.length;
                let totalExtras = 0;

                unidades.forEach((u) => {
                    // Regla de negocio: furgones forzados o con jornada máxima
                    if (u.forzarExtra || u.vueltasCompletadas >= 4) {
                        totalExtras++;
                    }
                });

                this.kpiUnidades.textContent = totalUnidades;
                this.kpiExtras.textContent = totalExtras;
            });
        }

        // 3. Stream del Top de Contingencias Críticas del CRM de Clientes
        if (this.containerCriticos) {
            this._unsubscribes.clientes = DatabaseService.escucharClientes((clientes) => {
                // Filtramos en memoria local los clientes con alertas activas
                const deRiesgo = clientes.filter(c => Boolean(c.critico));
                this.renderPanelClientesCriticos(deRiesgo);
            });
        }
    }

    /**
     * Renderiza las tarjetas de contingencia corporativa aplicando inmunidad XSS y clases del Design System.
     * @param {Array<Object>} clientes Colección de clientes críticos sincronizados.
     */
    renderPanelClientesCriticos(clientes) {
        if (!this.containerCriticos) return;

        if (!Array.isArray(clientes) || clientes.length === 0) {
            this.containerCriticos.innerHTML = `
                <div class="placeholder-vacio-jornada">
                    <p class="placeholder-vacio-jornada__text">
                        No se registran alertas de clientes preferenciales críticas hoy.
                    </p>
                </div>
            `;
            return;
        }

        // Esterilización profunda de estructuras complejas contra inyecciones de código HTML
        const safeClientes = Sanitizers.sanitizeStructure(clientes);

        // Renderizado semántico limpio libre de estilos inline duros (Pure BEM Architecture)
        this.containerCriticos.innerHTML = safeClientes.map(c => {
            const nomSeguro = c.nombre;
            const dniSeguro = c.dni;
            const dirSegura = c.direccion;
            const motSeguro = c.motivoCritico || "Alerta Logística Activa";

            return `
                <div class="card-panel card-panel--critical-alert">
                    <div class="card-panel__meta-info">
                        <h4 class="card-panel__title-head">${nomSeguro} <span class="card-panel__sub-token">(DNI: ${dniSeguro})</span></h4>
                        <p class="card-panel__location-text">📍 ${dirSegura}</p>
                    </div>
                    <span class="badge badge--danger badge--pulse">
                        ${motSeguro}
                    </span>
                </div>
            `;
        }).join('');
    }

    /**
     * Destruye de forma explícita todos los canales e hilos de red abiertos al desmontar el controlador.
     */
    destroy() {
        console.log("🔒 Desconectando streams operativos del IndexController.");
        if (this._unsubscribes.pedidos) this._unsubscribes.pedidos();
        if (this._unsubscribes.flota) this._unsubscribes.flota();
        if (this._unsubscribes.clientes) this._unsubscribes.clientes();
    }
}

// Inicialización acoplada de forma segura al árbol estructural del documento
document.addEventListener('DOMContentLoaded', () => {
    const indexCtrl = new IndexController();
    indexCtrl.init();
    
    // Registramos la instancia en el objeto de ventana para auditorías de consola central
    window.CurrentIndexController = indexCtrl;
});