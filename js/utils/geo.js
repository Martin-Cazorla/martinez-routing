/**
 * @fileoverview Utilitario matemático de cálculos geoespaciales y algoritmos cartográficos.
 * Provee herramientas analíticas de cálculo perimetral aplicadas al ruteador logístico.
 * @version 3.0.0
 * @package MartinezRouting.Utils
 */

export class GeoUtils {
    /** @private @readonly @type {number} Radio medio de la Tierra en kilómetros */
    static #RADIO_TIERRA_KM = 6371.0;

    /**
     * Calcula la distancia real en línea recta entre dos puntos geográficos (Fórmula de Haversine).
     * @param {number} lat1 Latitud del punto origen.
     * @param {number} lng1 Longitud del punto origen.
     * @param {number} lat2 Latitud del punto destino.
     * @param {number} lng2 Longitud del punto destino.
     * @returns {number} Distancia calculada expresada estrictamente en Kilómetros (km).
     */
    static calcularDistanciaHaversine(lat1, lng1, lat2, lng2) {
        if (!this.esCoordenadaValida(lat1, lng1) || !this.esCoordenadaValida(lat2, lng2)) {
            console.warn("[GeoUtils] Parámetros fuera de rango geométrico. Retornando distancia infinita.");
            return Infinity;
        }

        // Conversión angular obligatoria a Radianes
        const dLat = this.#toRadianes(lat2 - lat1);
        const dLng = this.#toRadianes(lng2 - lng1);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.#toRadianes(lat1)) * Math.cos(this.#toRadianes(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
                  
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return parseFloat((this.#RADIO_TIERRA_KM * c).toFixed(3));
    }

    /**
     * Evalúa si una coordenada cumple con los rangos normativos internacionales de la cartografía.
     * @param {number} lat Latitud decimal.
     * @param {number} lng Longitud decimal.
     * @returns {boolean} True si el punto es geométricamente real y procesable.
     */
    static esCoordenadaValida(lat, lng) {
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (isNaN(latitude) || isNaN(longitude)) return false;
        
        // Rangos físicos planetarios absolutos
        return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    }

    /**
     * Ordena una colección de pedidos de forma predictiva basándose en su cercanía a un centro de despacho.
     * @param {Object} centro Coordenadas base del nodo de origen {lat, lng}.
     * @param {Array<Object>} pedidos Matriz de órdenes a procesar y secuenciar.
     * @returns {Array<Object>} Nueva colección optimizada por proximidad de entrega.
     */
    static optimizarSecuenciaPorCercania(centro, pedidos) {
        if (!centro || !Array.isArray(pedidos)) return [];
        
        return [...pedidos].sort((a, b) => {
            const distA = this.calcularDistanciaHaversine(
                centro.lat, centro.lng, 
                a.coordenadas?.lat, a.coordenadas?.lng
            );
            const distB = this.calcularDistanciaHaversine(
                centro.lat, centro.lng, 
                b.coordenadas?.lat, b.coordenadas?.lng
            );
            return distA - distB;
        });
    }

    /**
     * Convierte valores angulares centesimales a Radianes.
     * @param {number} valorGrados Grados decimales.
     * @returns {number} Valor transformado.
     * @private
     */
    static #toRadianes(valorGrados) {
        return (valorGrados * Math.PI) / 180;
    }
}