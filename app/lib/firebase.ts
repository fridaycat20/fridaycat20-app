import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD7ikv7hEuCuUIwi2xznq0giyPbE4rCXWE",
  authDomain: "fridaycat20.firebaseapp.com",
  projectId: "fridaycat20",
  storageBucket: "fridaycat20.firebasestorage.app",
  messagingSenderId: "410247841244",
  appId: "1:410247841244:web:3a715aa043603ec50c3b19",
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
