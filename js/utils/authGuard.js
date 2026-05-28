/**
 * @fileoverview Perímetro defensivo y control de acceso basado en roles para Martinez Routing.
 * Previene el renderizado de datos sensibles en el cliente y valida privilegios operativos.
 * @version 2.1.0
 * @package MartinezRouting.Utils
 */

import { auth, db } from '../services/firebaseConfig.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/**
 * Intercepta de forma síncrona el DOM y valida la sesión activa y el rol corporativo.
 * Previene el parpadeo de interfaces y fugas de memoria de observadores.
 * * @param {string} [requiredRole=null] Rol requerido para acceder a la vista (ej: 'Administrador').
 * @returns {Promise<void>}
 */
export async function checkAuthGuard(requiredRole = null) {
  // 1. Inyección de salvaguarda visual inmediata para mitigar XSS/Flickering estructural
  const overlay = document.createElement('div');
  overlay.id = 'auth-perimeter-overlay';
  overlay.setAttribute('style', 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#090d16;z-index:999999;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-family:sans-serif;font-size:14px;letter-spacing:0.5px;');
  overlay.innerHTML = '<span>Verificando credenciales perimetrales...</span>';
  document.body.appendChild(overlay);

  // 2. Normalización de rutas relativas absolutas para evitar roturas por subcarpetas
  const currentPath = window.location.pathname;
  const isAtPagesFolder = currentPath.includes('/pages/');
  const loginRedirectPath = isAtPagesFolder ? 'login.html' : 'pages/login.html';
  const indexRedirectPath = isAtPagesFolder ? '../index.html' : 'index.html';

  return new Promise((resolve) => {
    /**
     * El método onAuthStateChanged devuelve una función de desuscripción unbind.
     * La almacenamos para invocarla inmediatamente al resolver el flujo.
     */
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Forzamos la limpieza del listener de Firebase para mitigar fugas de memoria
      unsubscribe();

      if (!user) {
        console.warn("🔒 Acceso no autorizado detectado. Redirigiendo a pasarela de autenticación.");
        window.location.href = loginRedirectPath;
        return;
      }

      try {
        // 3. Validación de integridad de cuenta en Cloud Firestore (Colección /usuarios)
        const userDocRef = doc(db, "usuarios", user.uid);
        const userSnapshot = await getDoc(userDocRef);

        if (!userSnapshot.exists()) {
          console.error("❌ El usuario autenticado no posee perfil en el fichero maestro de personal.");
          window.location.href = loginRedirectPath;
          return;
        }

        const userData = userSnapshot.data();

        // 4. Verificación perimetral de estado operativo
        if (userData.activo === false) {
          console.warn("🚫 Cuenta suspendida por políticas internas del centro de despacho.");
          window.location.href = loginRedirectPath;
          return;
        }

        // 5. Control estricto de autorización por Roles corporativos
        if (requiredRole && userData.rol !== requiredRole) {
          console.warn(`⛔ Privilegios insuficientes. Se requiere rol [${requiredRole}] para esta terminal.`);
          window.location.href = indexRedirectPath;
          return;
        }

        console.log(`✅ Sesión operativa válida [${userData.rol}]: ${user.email}`);
        
        // Removemos el bloqueo visual una vez garantizada la seguridad del hilo
        if (document.getElementById('auth-perimeter-overlay')) {
          overlay.remove();
        }
        resolve();

      } catch (error) {
        console.error("❌ Error crítico en pasarela de control perimetral AuthGuard:", error);
        window.location.href = loginRedirectPath;
      }
    });
  });
}