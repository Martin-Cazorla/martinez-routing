/**
 * @fileoverview Controlador visual y validador perimetral de la pasarela de acceso (Login Terminal).
 * Gestiona negociaciones de identidad delegando de forma estricta en la capa de servicios.
 * @version 3.1.0
 * @package MartinezRouting.Controllers
 */

import { auth } from '../services/firebaseConfig.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { DatabaseService } from '../services/databaseService.js';

export class LoginController {
    /**
     * Instancia las referencias de los inputs y botones de la pasarela de autenticación.
     */
    constructor() {
        this.form = document.getElementById('form-login');
        this.emailInput = document.getElementById('login-email');
        this.passwordInput = document.getElementById('login-password');
        this.errorContainer = document.getElementById('login-error-msg');
        this.submitBtn = document.getElementById('btn-login-submit');

        /** @type {Readonly<Object>} Mapeo oficial de errores nativos de Firebase */
        this._authErrorDictionary = Object.freeze({
            'auth/invalid-email': "El formato del correo electrónico corporativo no es válido.",
            'auth/user-disabled': "Este operador técnico se encuentra suspendido del ecosistema.",
            'auth/user-not-found': "Credenciales incorrectas. Verifique usuario y contraseña.",
            'auth/wrong-password': "Credenciales incorrectas. Verifique usuario y contraseña.",
            'auth/invalid-credential': "Credenciales incorrectas. Verifique usuario y contraseña.",
            'auth/too-many-requests': "Acceso bloqueado temporalmente por demasiados intentos fallidos."
        });
    }

    /**
     * Registra el interceptor submit de la pasarela si el formulario está montado en el DOM.
     */
    init() {
        if (!this.form) {
            console.warn("[LoginController] Formulario 'form-login' no detectado en este lienzo.");
            return;
        }
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    /**
     * Procesa la solicitud e inicia la negociación asíncrona perimetral.
     * @param {SubmitEvent} event Evento nativo de envío del formulario.
     */
    async handleSubmit(event) {
        event.preventDefault();
        
        this.hideError();
        this.setLoading(true);

        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;

        if (!email || !password) {
            this.showError("Todos los campos perimetrales son obligatorios.");
            this.setLoading(false);
            return;
        }

        try {
            // 1. Solicitud de autenticación de firmas contra Firebase Authentication
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. SOLUCIÓN AL ERROR: Consumo directo desde la abstracción unificada de servicios
            const profile = await DatabaseService.obtenerPerfilUsuarioEstatico(user.uid);

            if (!profile) {
                throw new Error("auth/user-profile-missing");
            }

            // 3. Verificación de políticas internas de suspensión antes de abrir el Shell
            if (profile.activo === false) {
                throw new Error("auth/user-disabled");
            }

            console.log(`🔐 Acceso concedido al terminal logístico para el operador: ${user.email}`);
            
            // 4. Redirección adaptativa absoluta basada en el contexto del path de la SPA
            const originPath = window.location.pathname;
            const isInsidePages = originPath.includes('/pages/');
            window.location.href = isInsidePages ? '../index.html' : 'index.html';

        } catch (error) {
            console.error("[LoginController] Falla crítica durante la pasarela de acceso:", error);
            
            let targetErrorCode = error.code || error.message;
            if (targetErrorCode === "auth/user-profile-missing") {
                this.showError("Su perfil no está indexado en el registro maestro de personal.");
            } else {
                this.handleAuthErrors(targetErrorCode);
            }
            
            this.setLoading(false);
        }
    }

    /**
     * Evalúa el código de error y despacha un mensaje unificado en español.
     * @param {string} errorCode Identificador normativo del SDK.
     */
    handleAuthErrors(errorCode) {
        const customMessage = this._authErrorDictionary[errorCode] 
            || "Ocurrió un error inesperado al negociar las firmas de red. Intente nuevamente.";
        this.showError(customMessage);
    }

    /**
     * Inyecta el texto del incidente y desplaza las clases de estado semánticas del CSS.
     * @param {string} text Mensaje de error formateado para el usuario.
     */
    showError(text) {
        if (!this.errorContainer) return;
        this.errorContainer.textContent = text;
        this.errorContainer.classList.add('error-message-panel--visible');
        this.errorContainer.classList.remove('error-message-panel--hidden');
    }

    /**
     * Limpia de forma segura los búferes de texto de error e invoca el estado de ocultamiento.
     */
    hideError() {
        if (!this.errorContainer) return;
        this.errorContainer.textContent = '';
        this.errorContainer.classList.add('error-message-panel--hidden');
        this.errorContainer.classList.remove('error-message-panel--visible');
    }

    /**
     * Bloquea la entrada operativa de datos y muta síncronamente los rótulos del botón.
     * @param {boolean} isLoading Flag de estado de procesamiento asíncrono.
     */
    setLoading(isLoading) {
        if (!this.submitBtn) return;
        
        this.submitBtn.disabled = isLoading;
        this.submitBtn.textContent = isLoading 
            ? "Verificando firmas perimetrales..." 
            : "Validar Credenciales";
    }
}

// Inicialización automatizada segura acoplada al ciclo de vida del árbol del DOM
document.addEventListener('DOMContentLoaded', () => {
    const loginCtrl = new LoginController();
    loginCtrl.init();
});