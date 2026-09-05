import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Totes aquestes claus són públiques per disseny (les de Firebase client SDK
// no són secretes: la seguretat real la donen les regles de Firestore/Auth).
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Firebase només s'inicialitza al navegador: durant el "build" de Next.js
// (prerenderitzat al servidor) no hi ha navegador i, si la clau encara no
// estigués disponible en aquell moment, Auth petaria tota la construcció.
export const auth = typeof window !== "undefined" ? getAuth(app) : (null as any);
export const db = typeof window !== "undefined" ? getFirestore(app) : (null as any);

// Exemple d'estructura de dades a Firestore (Firestore, no Realtime DB):
// users/{uid}
//   sessions/{sessionId}
//     lang: "it" | "en"
//     messages: [{ role, text, correction, createdAt }]
//     createdAt
