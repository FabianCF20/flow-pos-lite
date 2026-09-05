import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// La apiKey web de Firebase es pública por diseño (se restringe por dominio en la consola).
const firebaseConfig = {
  apiKey: "AIzaSyAqv_nq2IGEhG3FuJqubAuCPwPFUN7GtIA",
  authDomain: "spost-5f898.firebaseapp.com",
  projectId: "spost-5f898",
  storageBucket: "spost-5f898.firebasestorage.app",
  messagingSenderId: "715555406508",
  appId: "1:715555406508:web:b7b79ec46cb1fe17b0d509",
  measurementId: "G-7BR2T9LJC3",
};

/** Correo del primer administrador del ERP. */
export const ADMIN_EMAIL = "sneyder.c.f@gmail.com";

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function getApp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

/** Auth de Firebase (solo en el navegador). */
export function fbAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getApp());
    setPersistence(authInstance, browserLocalPersistence).catch(() => {});
  }
  return authInstance;
}

/** Firestore (base de datos en la nube). */
export function fbDb(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(getApp());
  return dbInstance;
}

/** Mensajes de error de Firebase en español. */
export function authErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "El correo no es válido";
    case "auth/missing-password":
      return "Escribe tu contraseña";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Correo o contraseña incorrectos";
    case "auth/user-not-found":
      return "No existe una cuenta con ese correo";
    case "auth/user-disabled":
      return "Esta cuenta está desactivada";
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera unos minutos";
    case "auth/network-request-failed":
      return "Sin conexión a internet";
    case "auth/operation-not-allowed":
      return "Activa el método de acceso en la consola de Firebase";
    case "auth/email-already-in-use":
      return "Ya existe una cuenta con ese correo";
    case "auth/invalid-action-code":
      return "El enlace de verificación expiró o ya fue usado";
    default:
      return "No se pudo completar la operación";
  }
}
