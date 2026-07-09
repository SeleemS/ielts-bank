import { initializeApp, getApps, getApp } from 'firebase/app';

const firebaseConfig = {
    apiKey: "AIzaSyCxAGciWo48j3A2P1okoK-3midsNm14cDk",
    authDomain: "ieltsbank-a2bc1.firebaseapp.com",
    databaseURL: "https://ieltsbank-a2bc1-default-rtdb.firebaseio.com",
    projectId: "ieltsbank-a2bc1",
    storageBucket: "ieltsbank-a2bc1.appspot.com",
    messagingSenderId: "612897473864",
    appId: "1:612897473864:web:60200b92143c0c1faf9f7d",
    measurementId: "G-1KRYZZY68X"
  };

// Guard initialization so repeated init at build time (SSG/getStaticProps)
// does not throw "Firebase App named '[DEFAULT]' already exists".
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export { app };
