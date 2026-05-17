import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAzcimWNRXxp2FlOdGEcFze4HiodiIX0vU",
  authDomain: "rcbrowsing-5964d.firebaseapp.com",
  projectId: "rcbrowsing-5964d",
  storageBucket: "rcbrowsing-5964d.firebasestorage.app",
  messagingSenderId: "133969609040",
  appId: "1:133969609040:web:4a5c209ae3cbe6a5f0ac55",
  measurementId: "G-9XCDB4ZQXM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics and get a reference to the service
export const analytics = getAnalytics(app);