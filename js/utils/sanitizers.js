/**
 * @fileoverview Utilidades avanzadas de sanitización y blindaje perimetral XSS.
 * Provee mecanismos de escape para strings, estructuras complejas y registros logísticos.
 * @version 2.2.0
 * @package MartinezRouting.Utils
 */

export const Sanitizers = {
    /**
     * Mapa estricto de conversión para caracteres especiales HTML (Entidades seguras).
     * @type {Readonly<Object>}
     * @private
     */
    _htmlSignatures: Object.freeze({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    }),

    /**
     * Sanitiza cadenas de texto para prevenir la ejecución de scripts maliciosos (XSS).
     * Soporta cualquier tipo de dato entrante forzando su conversión segura.
     * @param {*} rawValue Valor crudo a procesar.
     * @returns {string} Cadena sanitizada y estéril para el navegador.
     */
    escapeHtml(rawValue) {
        if (rawValue === null || rawValue === undefined) return '';
        
        // Convertimos de forma segura a string primitivo
        const strictString = String(rawValue);
        
        return strictString.replace(/[&<>"'`=\/]/g, (match) => this._htmlSignatures[match]);
    },

    /**
     * Sanitiza de forma recursiva (Deep Sanitize) objetos y colecciones complejas.
     * Ideal para procesar arrays de reclamos o manifiestos de planillas Excel antes del commit.
     * @param {*} data Objeto, array o primitivo a limpiar.
     * @returns {*} Estructura idéntica con todos sus nodos de texto sanitizados.
     */
    sanitizeStructure(data) {
        // Caso 1: Si es un valor nulo o no es un objeto/array, procesamos como primitivo
        if (data === null || typeof data !== 'object') {
            return typeof data === 'string' ? this.escapeHtml(data) : data;
        }

        // Caso 2: Si es un Array, iteramos recursivamente cada elemento de la lista
        if (Array.isArray(data)) {
            return data.map(element => this.sanitizeStructure(element));
        }

        // Caso 3: Es un objeto plano, sanitizamos sus claves de forma iterativa
        const cleanObject = {};
        for (const [key, value] of Object.entries(data)) {
            // Salvaguarda: Evitamos procesar prototipos heredados inseguros
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                cleanObject[key] = this.sanitizeStructure(value);
            }
        }

        return cleanObject;
    },

    /**
     * Limpia y normaliza cadenas destinadas a claves de índice en base de datos.
     * Remueve caracteres de control que puedan corromper búsquedas exactas (DNI, Patentes, IDs).
     * @param {string|number} identityCode Código identificador crudo.
     * @returns {string} Token alfanumérico limpio y sin espacios parásitos.
     */
    sanitizeAlphanumericCode(identityCode) {
        if (!identityCode) return '';
        return String(identityCode)
            .replace(/[^a-zA-LOGISTICA0-9\-]/gi, '') // Solo permite caracteres seguros de control
            .trim();
    }
};

// Exportación por defecto añadida para garantizar retrocompatibilidad total con la SPA
export default Sanitizers;