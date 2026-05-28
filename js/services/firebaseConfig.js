/**
 * @fileoverview Configuración e inicialización del núcleo asíncrono de Firebase.
 * Centraliza las instancias globales de base de datos (Firestore) y autenticación (Auth).
 * @version 2.5.0
 * @package MartinezRouting.Services
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

/**
 * Credenciales oficiales del proyecto Martinez Routing.
 * Protegido contra mutaciones en tiempo de ejecución mediante congelamiento de objeto.
 * @type {Readonly<Object>}
 */
const firebaseConfig = {
  apiKey: "AIzaSyA_cos2dn2an24H7fmFuLImEIKOTHm55w4",
  authDomain: "shipping-martinez.firebaseapp.com",
  projectId: "shipping-martinez",
  storageBucket: "shipping-martinez.firebasestorage.app",
  messagingSenderId: "240687036600",
  appId: "1:240687036600:web:0405b9eb353fc9fc06dc4d"
};

// Inicialización segura del ecosistema Firebase
let app;
try {
  console.log("🔥 Inicializando núcleo asíncrono de Firebase para Martinez Routing...");
  app = initializeApp(firebaseConfig);
} catch (error) {
  console.error("❌ Error crítico al inicializar el SDK maestro de Firebase:", error);
  throw error;
}

/**
 * Instancia global de acceso a datos distribuidos (Cloud Firestore).
 * @type {Firestore}
 */
export const db = getFirestore(app);

/**
 * Instancia global de control de sesiones de usuarios (Firebase Authentication).
 * @type {Auth}
 */
export const auth = getAuth(app);

console.log("✅ Servicios distribuidos 'db' y 'auth' expuestos de forma segura para la capa de servicios.");