/**
 * @fileoverview Orquestador maestro e inicializador del ciclo de vida de Martinez Routing (Bootstrapper).
 * Coordina la inyección de controladores, flujos del AuthGuard y eventos globales del layout.
 * @version 3.0.0
 * @package MartinezRouting.Main
 */

import { AuthService } from './services/authService.js';
import { Sanitizers } from './utils/sanitizers.js';

class ApplicationBootstrapper {
    constructor() {
        /** @type {Object|null} Registro del operador logístico logueado en la terminal */
        this.currentUser = null;
        /** @type {Function|null} Puntero de limpieza de flujos de red */
        this._unsubscribeAuth = null;
    }

    /**
     * Punto de entrada principal síncrono acoplado al arranque del DOM.
     */
    init() {
        console.log("🛠️ Inicializando Motores del Núcleo Corporativo de Martinez Routing...");
        this.bloquearAccesoNoAutenticado();
        this.configurarGlobalLayoutEvents();
    }

    /**
     * Intercepta el canal de firmas de AuthService y valida la política de navegación de la SPA.
     */
    bloquearAccesoNoAutenticado() {
        const pathActual = window.location.pathname;
        const esPaginaLogin = pathActual.includes('login.html');

        this._unsubscribeAuth = AuthService.observarEstadoSesion((userProfile) => {
            this.currentUser = userProfile;

            if (!this.currentUser) {
                // Si no hay sesión activa y no estamos en Login, forzamos redirección perimetral
                if (!esPaginaLogin) {
                    console.warn("[Core App] Acceso denegado. Redirigiendo a Terminal de Acceso.");
                    const insidePages = pathActual.includes('/pages/');
                    window.location.href = insidePages ? 'login.html' : 'pages/login.html';
                }
            } else {
                // Operador validado correctamente
                if (esPaginaLogin) {
                    // Si ya está logueado e intenta entrar a login, lo devolvemos al Home Dashboard
                    window.location.href = '../index.html';
                } else {
                    this.inyectarMetadatosUsuarioNavegacion();
                    this.inicializarControladorPorContextoDePantalla(pathActual);
                }
            }
        });
    }

    /**
     * Enruta dinámicamente la carga modular de controladores basados en la ruta física del archivo.
     * Evita inicializar selectores inexistentes mitigando excepciones Null Pointer en consola.
     * @param {string} path Ruta de navegación del navegador.
     */
    async inicializarControladorPorContextoDePantalla(path) {
        try {
            if (path.endsWith('index.html') || path === '/' || path.endsWith('/')) {
                const { IndexController } = await import('./controllers/indexController.js');
                const indexCtrl = new IndexController();
                indexCtrl.init();
            } 
            else if (path.includes('clientes.html')) {
                const { ClientesController } = await import('./controllers/clientesController.js');
                const clientesCtrl = new ClientesController();
                clientesCtrl.init();
            } 
            else if (path.includes('shipping.html')) {
                const { ShippingController } = await import('./controllers/shippingController.js');
                const shippingCtrl = new ShippingController();
                shippingCtrl.init();
            } 
            else if (path.includes('transporte.html')) {
                const { TransporteController } = await import('./controllers/transporteController.js');
                const transporteCtrl = new TransporteController();
                transporteCtrl.init();
            }
            else if (path.includes('dashboard.html')) {
                const { DashboardController } = await import('./controllers/dashboardController.js');
                const dashboardCtrl = new DashboardController();
                dashboardCtrl.init();
            }
        } catch (moduleError) {
            console.error("[Core App] Error crítico al orquestar el submódulo visual:", moduleError);
        }
    }

    /**
     * Inyecta de forma segura los nombres y roles sanitizados del despachador sobre la barra superior de UI.
     */
    inyectarMetadatosUsuarioNavegacion() {
        const displayNombreNodo = document.getElementById('nav-user-name');
        const displayRolNodo = document.getElementById('nav-user-role');

        if (displayNombreNodo && this.currentUser) {
            displayNombreNodo.textContent = Sanitizers.escapeHtml(this.currentUser.nombre);
        }
        if (displayRolNodo && this.currentUser) {
            displayRolNodo.textContent = `[${Sanitizers.escapeHtml(this.currentUser.rol.toUpperCase())}]`;
        }
    }

    /**
     * Registra los comportamientos comunes del Layout de la aplicación (Botones de Desconexión, etc).
     */
    configurarGlobalLayoutEvents() {
        const btnLogout = document.getElementById('btn-global-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', async (e) => {
                e.preventDefault();
                if (confirm("🚨 ¿Desea desconectar la terminal de despacho actual de los servidores centrales?")) {
                    if (this._unsubscribeAuth) this._unsubscribeAuth(); // Limpieza del canal de red
                    await AuthService.cerrarSesionTerminal();
                }
            });
        }
    }
}

// Inicialización asíncrona aislada en el hilo global del despachador corporativo
document.addEventListener('DOMContentLoaded', () => {
    window.MartinezRoutingCoreApp = new ApplicationBootstrapper();
    window.MartinezRoutingCoreApp.init();
});