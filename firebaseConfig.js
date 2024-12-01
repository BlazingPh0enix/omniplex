import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// Firebase Config
export const firebaseConfig = {
  apiKey: "AIzaSyCsOTWHV8zkhzFYZ1imCW_Urxza4xfC6Qg",
  authDomain: "omniplex-5483a.firebaseapp.com",
  projectId: "omniplex-5483a",
  storageBucket: "omniplex-5483a.firebasestorage.app",
  messagingSenderId: "428070744644",
  appId: "1:428070744644:web:6ee4428525603286fe0211",
  measurementId: "G-JEEHS4B6GW"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };

export const initializeFirebase = () => {
  return app;
};
