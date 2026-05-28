/**
 * @fileoverview Servicio unificado de control de sesiones e integridad de identidad operativa.
 * Abstrae y securiza los canales de validación del SDK perimetral de Firebase Auth.
 * @version 3.1.0
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
                    // Carga modular asíncrona de las dependencias nativas de Firestore
                    const { doc, getDoc, collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                    const { db } = await import('./firebaseConfig.js');

                    let profileData = null;

                    // Estrategia 1: Búsqueda indexada directa por ID de documento (= UID)
                    const directDocRef = doc(db, "usuarios", user.uid);
                    const directDocSnap = await getDoc(directDocRef);

                    if (directDocSnap.exists()) {
                        profileData = directDocSnap.data();
                    } else {
                        // Estrategia 2: Búsqueda fallback por atributo interno en caso de ID automático
                        const usuariosRef = collection(db, "usuarios");
                        const q = query(usuariosRef, where("uid", "==", user.uid));
                        const querySnapshot = await getDocs(q);
                        
                        if (!querySnapshot.empty) {
                            profileData = querySnapshot.docs[0].data();
                        }
                    }

                    // Validación del ciclo de vida y políticas operativas del perfil obtenido
                    if (profileData && profileData.activo !== false) {
                        callback({
                            uid: user.uid,
                            email: user.email,
                            nombre: profileData.nombre || 'Operador Despacho',
                            rol: profileData.rol || 'operator',
                            isMaster: profileData.rol === 'admin'
                        });
                    } else {
                        console.warn("[AuthService] Acceso denegado: Operador inexistente o suspendido.");
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
     * Destruye de forma de red la firma de sesión y limpia los búferes locales.
     * @returns {Promise<void>}
     */
    static async cerrarSesionTerminal() {
        try {
            console.log("🔒 Solicitando erradicación de credenciales perimetrales en servidor...");
            await signOut(auth);
            
            const isInsidePages = window.location.pathname.includes('/pages/');
            window.location.href = isInsidePages ? 'login.html' : 'pages/login.html';
        } catch (error) {
            console.error("[AuthService] Fallo crítico al procesar el logout operativo:", error);
            throw error;
        }
    }
}