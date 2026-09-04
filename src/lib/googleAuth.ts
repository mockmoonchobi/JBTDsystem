import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

// Initialize persistence safely
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((e) => {
    console.warn('Fallback to inMemoryPersistence for Firebase Auth:', e);
    setPersistence(auth, inMemoryPersistence).catch(() => {});
  });
}

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

interface AuthSubscriber {
  onSuccess?: (user: User, token: string) => void;
  onFailure?: () => void;
}

const subscribers = new Set<AuthSubscriber>();

const notifySubscribers = (user: User | null, token: string | null) => {
  subscribers.forEach((sub) => {
    try {
      if (user && token) {
        if (sub.onSuccess) sub.onSuccess(user, token);
      } else {
        if (sub.onFailure) sub.onFailure();
      }
    } catch (err) {
      console.warn('Error in auth subscriber callback:', err);
    }
  });
};

export const isAuthError = (err: any): boolean => {
  if (!err) return false;
  if (err.isAuthError === true || err.status === 401 || err.code === 401) return true;
  const msg = typeof err === 'string' ? err : (err.message || '');
  return (
    msg.includes('invalid authentication credentials') ||
    msg.includes('Invalid Credentials') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('invalid_grant') ||
    msg.includes('401') ||
    msg.includes('認証の有効期限') ||
    msg.includes('OAuth 2 access token')
  );
};

export const clearCachedAccessToken = () => {
  cachedAccessToken = null;
  notifySubscribers(null, null);
};

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (token && auth.currentUser) {
    notifySubscribers(auth.currentUser, token);
  } else if (!token) {
    notifySubscribers(null, null);
  }
};

// Global Firebase Auth state monitor
onAuthStateChanged(auth, async (user: User | null) => {
  if (user) {
    if (cachedAccessToken) {
      notifySubscribers(user, cachedAccessToken);
    } else if (!isSigningIn) {
      // User exists in auth but no token in memory (e.g. initial reload)
      notifySubscribers(null, null);
    }
  } else {
    cachedAccessToken = null;
    notifySubscribers(null, null);
  }
});

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  const sub: AuthSubscriber = { onSuccess: onAuthSuccess, onFailure: onAuthFailure };
  subscribers.add(sub);

  // Immediately dispatch current state to the new subscriber
  if (auth.currentUser && cachedAccessToken) {
    if (onAuthSuccess) onAuthSuccess(auth.currentUser, cachedAccessToken);
  } else if (!isSigningIn && !auth.currentUser) {
    if (onAuthFailure) onAuthFailure();
  }

  return () => {
    subscribers.delete(sub);
  };
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    let result;
    try {
      result = await signInWithPopup(auth, provider);
    } catch (popupErr: any) {
      const errMsg = popupErr?.message || '';
      if (
        errMsg.includes('Database is closing') ||
        errMsg.includes('closing/hidden') ||
        popupErr?.code === 'auth/internal-error'
      ) {
        console.warn('IndexedDB closing/hidden error detected during popup sign-in, retrying with inMemoryPersistence...');
        await setPersistence(auth, inMemoryPersistence).catch(() => {});
        result = await signInWithPopup(auth, provider);
      } else {
        throw popupErr;
      }
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google OAuthアクセストークンの取得に失敗しました。');
    }

    cachedAccessToken = credential.accessToken;
    notifySubscribers(result.user, cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request' ||
      error?.message?.includes('popup-closed-by-user') ||
      error?.message?.includes('cancelled-popup-request')
    ) {
      // ユーザーによるポップアップキャンセル時はエラーログを出さずに静かにnullを返却
      return null;
    }
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  cachedAccessToken = null;
  try {
    await auth.signOut();
  } catch (e) {
    console.warn('Sign out error:', e);
  }
  notifySubscribers(null, null);
};
