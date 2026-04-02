import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: String(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  ).trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
};

const requiredFirebaseKeys = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
];

const hasSomeFirebaseConfig = requiredFirebaseKeys.some(Boolean);
const hasFullFirebaseConfig = requiredFirebaseKeys.every(Boolean);

export const firebaseConfigurationHint =
  hasSomeFirebaseConfig && !hasFullFirebaseConfig
    ? 'Preencha VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID e VITE_FIREBASE_APP_ID.'
    : '';

export const firebaseProviderMode = hasFullFirebaseConfig
  ? 'firebase'
  : hasSomeFirebaseConfig
    ? 'invalid'
    : 'missing';

const createFirebaseApp = (): FirebaseApp | null => {
  if (!hasFullFirebaseConfig) {
    return null;
  }

  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
};

export const firebaseApp = createFirebaseApp();
export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const firestoreDb: Firestore | null = firebaseApp
  ? getFirestore(firebaseApp)
  : null;
export const isFirebaseConfigured = Boolean(firebaseApp && firebaseAuth && firestoreDb);

if (firebaseAuth && typeof window !== 'undefined') {
  void setPersistence(firebaseAuth, browserLocalPersistence).catch(() => undefined);
}
