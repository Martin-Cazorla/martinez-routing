/**
 * @fileoverview Parseador y validador de planillas logísticas externas (SheetJS / XLSX).
 * Extrae, normaliza y sanitiza manifiestos masivos de distribución para Martinez Routing.
 * @version 2.5.0
 * @package MartinezRouting.Modules
 */

import { Sanitizers } from '../utils/sanitizers.js';

export const ExcelParser = {
    /**
     * Mapa estricto de normalización Regex para capturar ventanas horarias en textos libres.
     * @type {Readonly<Array<Object>>}
     * @private
     */
    _franjaPatterns: Object.freeze([
        { pattern: /(10:?00|mañana|manana|turn-1)/i, value: "10:00-14:00" },
        { pattern: /(13:?00|mediodia|medio dia|turn-2)/i, value: "13:00-16:00" },
        { pattern: /(16:?00|tarde|afternoon|turn-3)/i, value: "16:00-19:00" },
        { pattern: /(19:?00|noche|nocturno|night|turn-4)/i, value: "19:00-21:30" }
    ]),

    /**
     * Procesa de forma asíncrona el archivo binario Excel de Jumbo y extrae los datos limpios.
     * Filtra automáticamente registros corruptos y sanitiza inputs contra XSS.
     * @param {File} file Archivo binario obtenido del input HTML5 de carga.
     * @returns {Promise<Array<Object>>} Promesa con la colección de órdenes homologadas listas para Firestore.
     */
    importarPedidoJumbo(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                return reject(new Error("[ExcelParser] Error físico: Ningún archivo binario detectado."));
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    
                    // Lectura del libro de trabajo consumiendo la instancia global XLSX
                    if (typeof XLSX === 'undefined') {
                        throw new Error("Librería global SheetJS (XLSX) no disponible en el contexto de ejecución.");
                    }

                    const workbook = XLSX.read(data, { 
                        type: 'array',
                        cellDates: true, // Optimiza el procesamiento de fechas nativas de Excel
                        cellText: false 
                    });
                    
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Convertimos la matriz en formato JSON estructurado plano por filas
                    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    const pedidosFormateados = [];

                    console.log(`📊 Analizando ${rows.length} filas de datos crudos en la planilla...`);

                    // Procesamiento secuencial preventivo tolerante a fallos
                    for (const row of rows) {
                        // 1. Validaciones perimetrales de campos Core mandatorios de negocio
                        const rawId = row.id || row.orderId || row.Id;
                        const rawOrderNum = row.commerceOrder || row.commerceId || row.numero;
                        const rawDni = row.customerIdentification || row.dni || row.doc;

                        if (!rawId || !rawOrderNum || !rawDni) {
                            console.warn("⚠️ Fila omitida: Ausencia de identificadores críticos (ID/Orden/DNI).", row);
                            continue; // Descarte controlado de la fila corrupta sin colapsar el hilo
                        }

                        // 2. Normalización y sanitización de importes monetarios
                        const rawAmount = row.originalAmount || row.totalAmount || row.importe || "0";
                        const importeLimpio = String(rawAmount).replace(/[^0-9.-]+/g, "");
                        const finalAmount = parseFloat(importeLimpio) || 0;

                        // 3. Algoritmo dinámico de inferencia de ventanas horarias por heurística Regex
                        const textToEvaluate = `${row.franja || ''} ${row.ventana || ''} ${row.comments || ''} ${row.notes || ''}`;
                        const franjaCalculada = this._deducirFranjaHoraria(textToEvaluate);

                        // 4. Mapeo y blindaje contra ataques de inyección mediante utilidades corporativas
                        pedidosFormateados.push({
                            numeroPedido: Sanitizers.sanitizeAlphanumericCode(rawOrderNum),
                            clienteDni: Sanitizers.sanitizeAlphanumericCode(rawDni),
                            clienteNombre: Sanitizers.escapeHtml(String(row.customerName || "CLIENTE GENÉRICO").toUpperCase().trim()),
                            direccion: Sanitizers.escapeHtml(String(row.shippingStreet || row.direccion || "DIRECCIÓN NO ESPECIFICADA").trim()),
                            fecha: new Date().toISOString().split('T')[0], // Forzamos fecha del día de control
                            franjaHoraria: franjaCalculada,
                            importe: finalAmount,
                            estadoRuta: "unassigned", // Estado base atómico mandatorio para el ruteador
                            idTransporteAsignado: null,
                            coordenadas: { 
                                lat: parseFloat(row.lat || row.latitud) || -34.6037, // Default nodo BA
                                lng: parseFloat(row.lng || row.longitud) || -58.3816 
                            }
                        });
                    }

                    console.log(`✅ Ingesta finalizada. ${pedidosFormateados.length} pedidos homologados de forma estricta.`);
                    resolve(pedidosFormateados);

                } catch (error) {
                    reject(new Error(`[ExcelParser] Falla estructural del manifiesto: ${error.message}`));
                }
            };

            reader.onerror = () => reject(new Error("[ExcelParser] Error de hardware en la lectura física del binario."));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Evalúa trazas de texto libre de la planilla para inferir la ventana operativa ideal.
     * @param {string} text Cadena de comentarios o notas del Excel.
     * @returns {string} Franja horaria normalizada del Design System.
     * @private
     */
    _deducirFranjaHoraria(text) {
        if (!text || text.trim() === "") return "10:00-14:00"; // Ventana por defecto del centro logístico

        for (const target of this._franjaPatterns) {
            if (target.pattern.test(text)) {
                return target.value;
            }
        }
        return "10:00-14:00"; // Fallback de resguardo
    }
};

export default ExcelParser;