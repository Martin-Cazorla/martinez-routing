/**
 * @fileoverview Single Source of Truth inmutable y reactivo para Martinez Routing.
 * Gobierna el estado de pedidos, flotas y filtros con aislamiento de memoria.
 * @version 2.4.0
 * @package MartinezRouting.State
 */

import { Sanitizers } from '../utils/sanitizers.js';

class LogisticaStore {
    /**
     * Inicializa los almacenes aislados y el stack de observadores operativos.
     */
    constructor() {
        /**
         * Estado maestro protegido de accesos directos.
         * @type {Object}
         * @private
         */
        this._state = {
            pedidos: [],
            unidades: [],
            reclamos: [], // Control unificado de Alertas Fuego
            filtros: {
                fecha: new Date().toISOString().split('T')[0],
                franjaHoraria: 'all'
            }
        };

        /**
         * Stack de callbacks suscritos a los cambios del store.
         * @type {Array<Function>}
         * @private
         */
        this._listeners = [];
    }

    /**
     * Retorna una copia exacta e inmutable del estado actual.
     * Previene la manipulación de propiedades en memoria fuera de la API del Store.
     * @returns {Object} Clon profundo del estado.
     */
    getState() {
        return structuredClone(this._state);
    }

    /**
     * Suscribe un componente a las actualizaciones del Store logístico.
     * @param {Function} listener Callback que recibirá el nuevo estado clonado.
     * @returns {Function} Función unbind para remover la suscripción de forma segura.
     */
    subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        
        this._listeners.push(listener);
        
        // Retornamos la desuscripción atómica para mitigar memory leaks
        return () => {
            this._listeners = this._listeners.filter(l => l !== listener);
        };
    }

    /**
     * Notifica a todos los observadores activos enviando una lectura estéril del estado.
     * @private
     */
    _notify() {
        const frozenState = Object.freeze(this.getState());
        this._listeners.forEach(listener => {
            try {
                listener(frozenState);
            } catch (error) {
                console.error("[LogisticaStore] Error en la ejecución de un listener suscrito:", error);
            }
        });
    }

    // ==========================================================================
    // API DE ACCIONES ATÓMICAS (MUTATIONS PARA LA CAPA CONTROLLER)
    // ==========================================================================

    /**
     * Sincroniza la colección de pedidos de la jornada sin alterar las unidades o filtros.
     * @param {Array<Object>} nuevosPedidos Set de órdenes distribuidas desde Firestore.
     */
    setPedidos(nuevosPedidos) {
        this._state.pedidos = Array.isArray(nuevosPedidos) ? structuredClone(nuevosPedidos) : [];
        this._notify();
    }

    /**
     * Actualiza el fichero vehicular en tiempo real conservando la integridad de los pedidos.
     * @param {Array<Object>} nuevasUnidades Estado de camiones y choferes de la flota.
     */
    setUnidades(nuevasUnidades) {
        this._state.unidades = Array.isArray(nuevasUnidades) ? structuredClone(nuevasUnidades) : [];
        this._notify();
    }

    /**
     * Sincroniza las alertas críticas y reclamos activos del centro de control.
     * @param {Array<Object>} nuevosReclamos
     */
    setReclamos(nuevosReclamos) {
        this._state.reclamos = Array.isArray(nuevosReclamos) ? structuredClone(nuevosReclamos) : [];
        this._notify();
    }

    /**
     * Actualiza de forma focalizada los parámetros del filtro global de control.
     * Aplica sanitización perimetral sobre los strings de criterio.
     * @param {Object} nuevosFiltros Objeto parcial conteniendo fecha o franjaHoraria.
     */
    updateFiltros(nuevosFiltros) {
        this._state.filtros = {
            fecha: nuevosFiltros.fecha 
                ? Sanitizers.sanitizeAlphanumericCode(nuevosFiltros.fecha) 
                : this._state.filtros.fecha,
            franjaHoraria: nuevosFiltros.franjaHoraria 
                ? Sanitizers.escapeHtml(nuevosFiltros.franjaHoraria) 
                : this._state.filtros.franjaHoraria
        };
        this._notify();
    }

    /**
     * Modifica el estado de una orden individual en la memoria local antes de impactar el render.
     * @param {string} pedidoId ID del documento del pedido.
     * @param {Object} dataToUpdate Objeto con los campos modificados (ej: { estadoRuta: 'assigned' }).
     */
    updatePedidoLocal(pedidoId, dataToUpdate) {
        const index = this._state.pedidos.findIndex(p => p.id === pedidoId);
        if (index !== -1) {
            this._state.pedidos[index] = {
                ...this._state.pedidos[index],
                ...structuredClone(dataToUpdate)
            };
            this._notify();
        }
    }
}

// Inicializamos la instancia única del almacén operativo (Patrón Singleton)
const store = new LogisticaStore();

// Exportación unificada para máxima compatibilidad con ESModules
export { store };
export default store;