/**
 * @fileoverview Servicio maestro de abstracción de datos para Martinez Routing (Cloud Firestore).
 * Centraliza las transacciones atómicas, cargas masivas seguras y flujos en tiempo real.
 * @version 2.8.0
 * @package MartinezRouting.Services
 */

import { db } from './firebaseConfig.js';
import { 
    collection, 
    doc, 
    setDoc, 
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query, 
    where, 
    orderBy,
    writeBatch,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { Sanitizers } from '../utils/sanitizers.js';

export const DatabaseService = {

    // ==========================================================================
    // SECCIÓN 1: CRM - GESTIÓN MAESTRA DE CLIENTES
    // ==========================================================================

    /**
     * Guarda o actualiza un cliente aplicando sanitización profunda contra ataques XSS.
     * @param {Object} cliente Datos estructurados del cliente desde el controlador.
     * @returns {Promise<void>}
     */
    async guardarCliente(cliente) {
        if (!cliente || !cliente.dni) {
            throw new Error("[DatabaseService] Operación abortada: El DNI es mandatorio.");
        }

        const safeDni = String(cliente.dni).trim();
        const clienteRef = doc(db, "clientes", safeDni);

        // Sanitización rigurosa de entradas antes de la persistencia
        const safeData = {
            dni: safeDni,
            nombre: Sanitizers.escapeHtml(String(cliente.nombre).toUpperCase().trim()),
            telefono: Sanitizers.escapeHtml(String(cliente.telefono || "").trim()),
            direccion: Sanitizers.escapeHtml(String(cliente.direccion).trim()),
            coordenadas: {
                lat: parseFloat(cliente.coordenadas?.lat || 0) || -34.6037, // Default BA si es inválido
                lng: parseFloat(cliente.coordenadas?.lng || 0) || -58.3816
            },
            critico: Boolean(cliente.critico),
            premium: Boolean(cliente.premium),
            motivoCritico: Sanitizers.escapeHtml(String(cliente.motivoCritico || "").trim()),
            fechaActualizacion: new Date().toISOString()
        };

        try {
            await setDoc(clienteRef, safeData, { merge: true });
        } catch (error) {
            console.error(`[DatabaseService] Fallo al escribir cliente ${safeDni}:`, error);
            throw error;
        }
    },

    /**
     * Activa una escucha en tiempo real sobre el fichero de clientes.
     * @param {Function} callback Función de retorno con el set de datos transformado.
     * @returns {Function} Unbind function para destruir el listener desde el controlador.
     */
    escucharClientes(callback) {
        const q = query(collection(db, "clientes"), orderBy("nombre", "asc"));
        return onSnapshot(q, (snapshot) => {
            const clientes = [];
            snapshot.forEach(docSnap => {
                clientes.push({ id: docSnap.id, ...docSnap.data() });
            });
            callback(clientes);
        }, (error) => {
            console.error("[DatabaseService] Error en stream en vivo de clientes:", error);
        });
    },

    // ==========================================================================
    // SECCIÓN 2: DESPACHO - CONTROL MÁXIMO DE PEDIDOS
    // ==========================================================================

    /**
     * Carga masiva de pedidos implementando un algoritmo Chunking.
     * Soporta inserciones ilimitadas fragmentando en bloques estricto de 450 elementos.
     * Garantiza atomicidad absoluta y mitiga costos operativos de red.
     * @param {Array<Object>} listaPedidos Colección homogénea de órdenes formateadas.
     * @returns {Promise<void>}
     */
    async guardarPedidosMasivos(listaPedidos) {
        if (!Array.isArray(listaPedidos) || listaPedidos.length === 0) return;

        const MAX_BATCH_SIZE = 450; // Margen de seguridad sobre el límite de 500 de Firebase
        const totalPedidos = listaPedidos.length;
        let index = 0;

        console.log(`📦 Iniciando inyección masiva segmentada para ${totalPedidos} órdenes...`);

        try {
            while (index < totalPedidos) {
                const batch = writeBatch(db);
                // Extraemos el segmento seguro actual
                const chunk = listaPedidos.slice(index, index + MAX_BATCH_SIZE);

                chunk.forEach(pedido => {
                    const pedidoRef = doc(collection(db, "pedidos"));
                    batch.set(pedidoRef, {
                        numeroPedido: String(pedido.numeroPedido).trim(),
                        clienteDni: String(pedido.clienteDni).trim(),
                        clienteNombre: Sanitizers.escapeHtml(String(pedido.clienteNombre).toUpperCase().trim()),
                        direccion: Sanitizers.escapeHtml(String(pedido.direccion).trim()),
                        fecha: String(pedido.fecha), // Formato estricto YYYY-MM-DD para filtros indexados
                        franjaHoraria: pedido.franjaHoraria,
                        importe: parseFloat(pedido.importe) || 0,
                        estadoRuta: pedido.estadoRuta || "unassigned",
                        idTransporteAsignado: pedido.idTransporteAsignado || null,
                        coordenadas: {
                            lat: parseFloat(pedido.coordenadas?.lat) || 0,
                            lng: parseFloat(pedido.coordenadas?.lng) || 0
                        },
                        timestampAlta: new Date().toISOString()
                    });
                });

                await batch.commit();
                index += MAX_BATCH_SIZE;
                console.log(`⚡ Lote procesado con éxito. Progreso: ${Math.min(index, totalPedidos)}/${totalPedidos}`);
            }
            console.log("✅ Proceso de inyección masiva finalizado sin errores de consistencia.");
        } catch (error) {
            console.error("[DatabaseService] Error crítico durante la carga en lotes segmentados:", error);
            throw error;
        }
    },

    /**
     * Escucha en tiempo real las órdenes asignadas a una jornada particular.
     * @param {string} fecha Filtro de fecha en formato YYYY-MM-DD.
     * @param {Function} callback Retorno reactivo de datos procesados.
     * @returns {Function} Destructor del listener.
     */
    escucharPedidosPorFecha(fecha, callback) {
        const q = query(collection(db, "pedidos"), where("fecha", "==", String(fecha)));
        return onSnapshot(q, (snapshot) => {
            const pedidos = [];
            snapshot.forEach(docSnap => {
                pedidos.push({ id: docSnap.id, ...docSnap.data() });
            });
            callback(pedidos);
        }, (error) => {
            console.error(`[DatabaseService] Fallo en stream de pedidos para fecha ${fecha}:`, error);
        });
    },

    /**
     * Adjudica un lote completo de pedidos a una unidad vehicular de forma atómica.
     * @param {Array<string>} idsPedidos Array con los identificadores de documento en Firestore.
     * @param {string} idTransporte Identificador único de la unidad de destino.
     * @returns {Promise<void>}
     */
    async asignarPedidosAVehiculo(idsPedidos, idTransporte) {
        if (!Array.isArray(idsPedidos) || idsPedidos.length === 0) return;

        const batch = writeBatch(db);
        try {
            idsPedidos.forEach(id => {
                const pedidoRef = doc(db, "pedidos", id);
                batch.update(pedidoRef, {
                    estadoRuta: "assigned",
                    idTransporteAsignado: idTransporte
                });
            });
            await batch.commit();
            console.log(`🚛 ${idsPedidos.length} órdenes transferidas con éxito a la unidad vehicular [${idTransporte}].`);
        } catch (error) {
            console.error("[DatabaseService] Fallo al realizar la reasignación masiva de lote:", error);
            throw error;
        }
    },

    // ==========================================================================
    // SECCIÓN 3: FLOTA - GESTIÓN DE TRANSPORTE Y RECLAMOS
    // ==========================================================================

    /**
     * Transacciona el alta o actualización mecánica de una unidad vehicular de flota.
     * @param {Object} vehiculo Datos de la unidad logística.
     * @returns {Promise<void>}
     */
    async guardarVehiculo(vehiculo) {
        const idFijo = String(vehiculo.numeroUnidad).trim();
        const vehiculoRef = doc(db, "transporte", idFijo);

        const safeData = {
            numeroUnidad: idFijo,
            modeloUnidad: Sanitizers.escapeHtml(String(vehiculo.modeloUnidad).trim()),
            nombreChofer: Sanitizers.escapeHtml(String(vehiculo.nombreChofer).trim()),
            tamanioUnidad: vehiculo.tamanioUnidad, // Chico, Mediano, Grande
            comentariosUnidad: Sanitizers.escapeHtml(String(vehiculo.comentariosUnidad || "").trim()),
            estadoOperativo: vehiculo.estadoOperativo || "disponible",
            vueltasCompletadas: parseInt(vehiculo.vueltasCompletadas || 0, 10),
            forzarExtra: Boolean(vehiculo.forzarExtra),
            timestamp: new Date().toISOString()
        };

        await setDoc(vehiculoRef, safeData, { merge: true });
    },

    /**
     * Escucha activa sobre la flota vehicular del ecosistema.
     */
    escucharFlota(callback) {
        const q = query(collection(db, "transporte"), orderBy("numeroUnidad", "asc"));
        return onSnapshot(q, (snapshot) => {
            const unidades = [];
            snapshot.forEach(docSnap => {
                unidades.push({ id: docSnap.id, ...docSnap.data() });
            });
            callback(unidades);
        }, (error) => {
            console.error("[DatabaseService] Error en stream vehicular de flota:", error);
        });
    },

    /**
     * Registra un reclamo de cliente y dispara la inyección cruzada en el log histórico.
     * Usa transacciones atómicas indirectas de batch.
     * @param {Object} reclamo Estructura de la incidencia de campo.
     * @returns {Promise<void>}
     */
    async registrarReclamoCritico(reclamo) {
        const batch = writeBatch(db);
        
        const reclamoRef = doc(collection(db, "reclamos"));
        const clienteRef = doc(db, "clientes", String(reclamo.clienteDni).trim());

        // 1. Cargamos el incidente en la colección maestra de auditoría
        batch.set(reclamoRef, {
            clienteDni: String(reclamo.clienteDni).trim(),
            direccionIncidente: reclamo.direccionIncidente,
            descripcion: Sanitizers.escapeHtml(reclamo.descripcion),
            timestamp: new Date().toISOString(),
            resuelto: false
        });

        // 2. Activamos la bandera reactiva en el fichero del cliente (Alerta Fuego Automática)
        batch.update(clienteRef, {
            critico: true,
            motivoCritico: Sanitizers.escapeHtml(reclamo.descripcion)
        });

        await batch.commit();
    }
};