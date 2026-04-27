// Firebase configuration (compat mode — works directly in browser)
const firebaseConfig = {
  apiKey: "AIzaSyDLtdkrrCUDNeA_UYpJiMjwFIHtIa7qjJc",
  authDomain: "lostfound-platform.firebaseapp.com",
  projectId: "lostfound-platform",
  storageBucket: "lostfound-platform.firebasestorage.app",
  messagingSenderId: "955830517611",
  appId: "1:955830517611:web:ef4d06fe96b49b5c4cd62e",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// imgBB API key for free image hosting
const IMGBB_API_KEY = "c5f2c0ac7132bc2708d37139315a03cc";
