import { Platform } from 'react-native';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, type Persistence, Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const firebaseConfig = {
  apiKey: "AIzaSyBb_o6dLZ8190BI3SvyW8Ndwv3bazPjSyo",
  authDomain: "ritim-2d05e.firebaseapp.com",
  databaseURL: "https://ritim-2d05e-default-rtdb.firebaseio.com",
  projectId: "ritim-2d05e",
  storageBucket: "ritim-2d05e.firebasestorage.app",
  messagingSenderId: "197542568253",
  appId: "1:197542568253:web:c36ded701cc49893446554",
  measurementId: "G-KK6JSPG9WC"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function initAuth(): Auth {
  try {
    if (Platform.OS === 'web') {
      return getAuth(app);
    }

    const { getReactNativePersistence } = require('firebase/auth') as {
      getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
    };

    try {
      return initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch (error: any) {
      if (error?.code === 'auth/already-initialized') {
        return getAuth(app);
      }
      return getAuth(app);
    }
  } catch {
    return getAuth(app);
  }
}

export const auth = initAuth();
export const db = getFirestore(app);
export default app;
