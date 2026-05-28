/**
 * @fileoverview Servicio unificado de control de sesiones e integridad de identidad operativa.
 * Abstrae y securiza los canales de validación del SDK perimetral de Firebase Auth.
 * @version 3.0.0
 * @package MartinezRouting.Services
 */

import { auth } from './firebaseConfig.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

export class AuthService {
    /**
     * Suscribe un callback reactivo al ciclo de vida del token de autenticación del sistema.
     * @param {Function} callback Función receptora que procesará el estado del User Profile {User|null}.
     * @returns {Function} Puntero de cancelación (Unsubscribe Function) para evitar memory leaks.
     */
    static observarEstadoSesion(callback) {
        return onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    // Verificación secundaria cruzada de perfiles sobre Firestore corporativo
                    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                    const { db } = await import('./firebaseConfig.js');

                    const profileDoc = await getDoc(doc(db, "usuarios", user.uid));
                    
                    if (profileDoc.exists() && profileDoc.data().activo !== false) {
                        // Enriquecemos el payload del objeto nativo con las flags del CRM
                        const profileData = profileDoc.data();
                        callback({
                            uid: user.uid,
                            email: user.email,
                            nombre: profileData.nombre || 'Operador Despacho',
                            rol: profileData.rol || 'operator',
                            isMaster: profileData.rol === 'admin'
                        });
                    } else {
                        // Forzado inmediato de expulsión si la cuenta fue revocada administrativamente
                        console.warn("[AuthService] Intento de intrusión por cuenta deshabilitada.");
                        await this.cerrarSesionTerminal();
                        callback(null);
                    }
                } catch (err) {
                    console.error("[AuthService] Error crítico al resolver el perfil cruzado:", err);
                    callback(null);
                }
            } else {
                callback(null);
            }
        });
    }

    /**
     * Destruye de forma persistente la firma de sesión y limpia las cookies del navegador.
     * @returns {Promise<void>} Promesa síncrona de desconexión del servidor.
     */
    static async cerrarSesionTerminal() {
        try {
            console.log("🔒 Solicitando erradicación de credenciales perimetrales en servidor...");
            await signOut(auth);
            
            // Forzado de redirección adaptativa absoluta para evitar retención de trazas en memoria
            const isInsidePages = window.location.pathname.includes('/pages/');
            window.location.href = isInsidePages ? 'login.html' : 'pages/login.html';
        } catch (error) {
            console.error("[AuthService] Fallo crítico al procesar el logout operativo:", error);
            throw error;
        }
    }
}