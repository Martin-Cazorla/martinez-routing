/**
 * @fileoverview Utilidades avanzadas de sanitización y blindaje perimetral XSS.
 * Provee mecanismos de escape para strings, estructuras complejas y registros logísticos.
 * @version 2.2.1
 * @package MartinezRouting.Utils
 */

const signatures = Object.freeze({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
});

export const Sanitizers = {
    /**
     * Sanitiza cadenas de texto para prevenir la ejecución de scripts maliciosos (XSS).
     * @param {*} rawValue Valor crudo a procesar.
     * @returns {string} Cadena sanitizada.
     */
    escapeHtml(rawValue) {
        if (rawValue === null || rawValue === undefined) return '';
        const strictString = String(rawValue);
        return strictString.replace(/[&<>"'`=\/]/g, (match) => signatures[match]);
    },

    /**
     * Sanitiza de forma recursiva objetos y colecciones complejas.
     * @param {*} data Objeto, array o primitivo a limpiar.
     * @returns {*} Estructura idéntica con todos sus nodos de texto sanitizados.
     */
    sanitizeStructure(data) {
        if (data === null || typeof data !== 'object') {
            return typeof data === 'string' ? this.escapeHtml(data) : data;
        }

        if (Array.isArray(data)) {
            return data.map(element => this.sanitizeStructure(element));
        }

        const cleanObject = {};
        for (const [key, value] of Object.entries(data)) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                cleanObject[key] = this.sanitizeStructure(value);
            }
        }
        return cleanObject;
    },

    /**
     * Limpia y normaliza cadenas destinadas a claves de índice en base de datos.
     * @param {string|number} identityCode Código identificador crudo.
     * @returns {string} Token alfanumérico limpio.
     */
    sanitizeAlphanumericCode(identityCode) {
        if (!identityCode) return '';
        return String(identityCode).replace(/[^a-zA-Z0-9\-]/gi, '').trim();
    }
};

export default Sanitizers;