/**
 * @fileoverview Módulo maestro cartográfico (Leaflet.js) para Martinez Routing.
 * Abstrae renderizado de alta densidad, clustering y selección múltiple geoespacial.
 * @version 3.0.0
 * @package MartinezRouting.Modules
 */

import { Sanitizers } from '../utils/sanitizers.js';

export class MapModule {
    /**
     * Inicializa el lienzo cartográfico, capas base de Esri y herramientas de lazo.
     * @param {string} mapElementId Identificador del nodo contenedor del DOM.
     * @param {Function} onSelectionCallback Callback transaccional: (arrayIdsPedidos) => void.
     */
    constructor(mapElementId, onSelectionCallback) {
        if (!mapElementId || !document.getElementById(mapElementId)) {
            throw new Error(`[MapModule] Error crítico: El contenedor ID #${mapElementId} no existe.`);
        }

        /** @type {L.Map} */
        this.map = L.map(mapElementId, {
            zoomControl: true,
            preferCanvas: true // Optimización de rendimiento para renderizado de miles de vectores
        }).setView([-34.4824, -58.5032], 12);

        /** @type {L.MarkerClusterGroup} */
        this.markerCluster = L.markerClusterGroup({
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        });

        /** @type {Function} */
        this.onSelection = typeof onSelectionCallback === 'function' ? onSelectionCallback : () => {};

        /** * Mapa indexador de marcadores activos en memoria.
         * @type {Map<string, L.Marker>} 
         */
        this.currentMarkers = new Map();

        // Propiedades de la caja de arrastre (Lazo de selección múltiple)
        this._selectionBox = null;
        this._isDrawingSelection = false;
        this._startLatLng = null;

        this._setupDefaultIcons();
        this._initTileLayer();
        this._registerMapInteractions();
    }

    /**
     * Normaliza los assets de los marcadores desde repositorios CDN estables.
     * @private
     */
    _setupDefaultIcons() {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
    }

    /**
     * Inicializa los mapas de bits topográficos corporativos (Esri Map Server).
     * @private
     */
    _initTileLayer() {
        const tiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Esri, GIS User Community'
        }).addTo(this.map);
        
        this.map.addLayer(this.markerCluster);

        // Ajuste reactivo del tamaño del viewport para mitigar renderizados grises rotos
        tiles.once('tileload', () => {
            setTimeout(() => {
                if (this.map) this.map.invalidateSize();
            }, 150);
        });
    }

    /**
     * Registra gestores de eventos para activar el lazo de selección múltiple estilo despacho central.
     * @private
     */
    _registerMapInteractions() {
        // Al presionar Shift + Click izquierdo, activamos la captura de lazo rectangular
        this.map.on('mousedown', (e) => {
            if (e.originalEvent.shiftKey) {
                this.map.dragging.disable(); // Congelamos el paneo nativo del mapa
                this._isDrawingSelection = true;
                this._startLatLng = e.latlng;

                this._selectionBox = L.rectangle([this._startLatLng, this._startLatLng], {
                    color: "#06b6d4",
                    weight: 2,
                    fillColor: "#06b6d4",
                    fillOpacity: 0.15,
                    dashArray: "5, 5"
                }).addTo(this.map);
            }
        });

        this.map.on('mousemove', (e) => {
            if (this._isDrawingSelection && this._selectionBox) {
                this._selectionBox.setBounds([this._startLatLng, e.latlng]);
            }
        });

        this.map.on('mouseup', () => {
            if (this._isDrawingSelection) {
                this._isDrawingSelection = false;
                this.map.dragging.enable(); // Devolvemos el control de paneo al usuario

                if (this._selectionBox) {
                    this._processBoxSelection(this._selectionBox.getBounds());
                    this.map.removeLayer(this._selectionBox);
                    this._selectionBox = null;
                }
            }
        });
    }

    /**
     * Evalúa qué marcadores en memoria se encuentran dentro de los límites del polígono.
     * Ejecuta el callback del controlador enviando los identificadores logísticos.
     * @param {L.LatLngBounds} bounds Límites geográficos de la caja de selección.
     * @private
     */
    _processBoxSelection(bounds) {
        const selectedIds = [];

        this.currentMarkers.forEach((marker, pedidoId) => {
            if (bounds.contains(marker.getLatLng())) {
                selectedIds.push(pedidoId);
            }
        });

        if (selectedIds.length > 0) {
            console.log(`🎯 Selección múltiple capturada: ${selectedIds.length} pedidos dentro del lazo.`);
            this.onSelection(selectedIds);
        }
    }

    /**
     * Renderiza o actualiza marcadores mapeando de forma flexible y segura las mutaciones de Firestore.
     * Implementa auto-encuadre adaptativo inteligente (fitBounds).
     * @param {Array<Object>} pedidos Matriz de órdenes operativas sincronizadas desde el Store.
     */
    updateMarkers(pedidos) {
        // Desvinculamos listeners explícitos antes de purgar capas para optimizar Garbage Collector
        this.currentMarkers.forEach(marker => marker.off());
        this.markerCluster.clearLayers();
        this.currentMarkers.clear();

        if (!Array.isArray(pedidos) || pedidos.length === 0) return;

        const boundsArray = [];

        pedidos.forEach(pedido => {
            if (!pedido) return;

            // Adaptador de normalización polimórfica geoespacial seguro
            const lat = pedido.coordenadas?.lat ?? pedido.coordenada?.lat ?? pedido.latitud;
            const lng = pedido.coordenadas?.lng ?? pedido.coordenada?.lng ?? pedido.longitud;

            const parsedLat = parseFloat(lat);
            const parsedLng = parseFloat(lng);

            if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat === 0 || parsedLng === 0) {
                return; // Omitimos de forma silenciosa registros geoespaciales corruptos
            }

            const franjaColorClass = this._getColorByFranja(pedido.franjaHoraria);
            let markerOptions = {};

            // Renderizado de Alertas de Fuego Tácticas (Diseño adaptado a tokens corporativos)
            if (pedido.esCritico || pedido.critico) {
                const fireIcon = L.divIcon({
                    className: `marker-critical-fire ${franjaColorClass}`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });
                markerOptions = { icon: fireIcon };
            }

            const marker = L.marker([parsedLat, parsedLng], markerOptions);
            
            // Sanitización profunda del payload textual de la burbuja informativa
            const safePedidoNum = Sanitizers.escapeHtml(pedido.numeroPedido || 'S/N');
            const safeFranja = Sanitizers.escapeHtml(pedido.franjaHoraria || 'No asignada');
            const safeDireccion = Sanitizers.escapeHtml(pedido.direccion || 'No especificada');
            const safeMotivo = Sanitizers.escapeHtml(pedido.motivoCritico || 'Sin reclamos pendientes');

            marker.bindPopup(`
                <div class="map-popup">
                    <h3 class="map-popup__title">Pedido: #${safePedidoNum}</h3>
                    <p class="map-popup__text"><b>Ventana:</b> ${safeFranja}</p>
                    <p class="map-popup__text"><b>Dirección:</b> ${safeDireccion}</p>
                    <p class="map-popup__text map-popup__text--alert"><b>Alerta:</b> ${safeMotivo}</p>
                </div>
            `);

            this.markerCluster.addLayer(marker);
            
            // Indexamos usando el ID de documento único de Firestore
            this.currentMarkers.set(pedido.id, marker);
            boundsArray.push([parsedLat, parsedLng]);
        });

        // Encuadre dinámico óptimo sin desorientar al despachador logístico
        if (boundsArray.length > 0 && this.map) {
            this.map.fitBounds(boundsArray, { 
                padding: [50, 50], 
                maxZoom: 15,
                animate: true,
                duration: 0.5 
            });
        }
    }

    /**
     * Mapea el identificador horario hacia la firma de clase css del Design System.
     * @param {string} franja Criterio horario de entrega.
     * @returns {string} Clase utilitaria SCSS.
     * @private
     */
    _getColorByFranja(franja) {
        switch (franja) {
            case '10:00-14:00': return 'time-red';
            case '13:00-16:00': return 'time-green';
            case '16:00-19:00': return 'time-blue';
            case '19:00-21:30': return 'time-black';
            default: return 'time-default';
        }
    }

    /**
     * Fuerza de forma imperativa la re-evaluación geométrica de las dimensiones físicas del contenedor.
     */
    resize() {
        if (this.map) {
            this.map.invalidateSize();
        }
    }
}