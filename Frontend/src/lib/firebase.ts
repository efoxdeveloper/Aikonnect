import { initializeApp } from "firebase/app";

// Firebase web configuration is safe to ship to the browser. Firebase Security
// Rules and provider configuration are the controls that protect Firebase data.
export const firebaseConfig = {
  apiKey: "AIzaSyCh5PD1DAKYJY1zQ2eiVCyxeIKPBXkuYz8",
  authDomain: "whatsappweb-3aa65.firebaseapp.com",
  projectId: "whatsappweb-3aa65",
  storageBucket: "whatsappweb-3aa65.firebasestorage.app",
  messagingSenderId: "809999838510",
  appId: "1:809999838510:web:702df04109464c12f69ebf",
};

export const firebaseApp = initializeApp(firebaseConfig);
