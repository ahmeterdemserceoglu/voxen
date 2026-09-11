import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from 'firebase/auth';
import { auth } from '../../config/firebase';
import { logger } from '../../utils/logger';

const TAG = 'AuthService';

export class AuthError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function mapFirebaseError(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-credential': 'E-posta veya sifre hatali.',
    'auth/wrong-password': 'E-posta veya sifre hatali.',
    'auth/user-not-found': 'Bu e-posta ile kayitli kullanici bulunamadi.',
    'auth/email-already-in-use': 'Bu e-posta zaten kullanimda.',
    'auth/weak-password': 'Sifre en az 6 karakter olmalidir.',
    'auth/invalid-email': 'Gecersiz e-posta adresi.',
    'auth/too-many-requests': 'Cok fazla istek. Lutfen bekleyin.',
    'auth/network-request-failed': 'Ag baglantisi hatasi.',
  };
  return map[code] || 'Bir hata olustu. Lutfen tekrar deneyin.';
}

export const authService = {
  signIn: async (email: string, password: string): Promise<User> => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      return cred.user;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || '';
      throw new AuthError(mapFirebaseError(code), code);
    }
  },

  signUp: async (email: string, password: string, displayName?: string): Promise<User> => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName?.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
      return cred.user;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || '';
      throw new AuthError(mapFirebaseError(code), code);
    }
  },

  signOut: async (): Promise<void> => {
    try {
      await signOut(auth);
    } catch (err) {
      logger.warn(TAG, 'Sign out error', err);
    }
  },

  sendPasswordReset: async (email: string): Promise<void> => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || '';
      throw new AuthError(mapFirebaseError(code), code);
    }
  },

  updateDisplayName: async (user: User, displayName: string): Promise<void> => {
    if (auth.currentUser?.uid !== user.uid) throw new AuthError('Oturum değişti.');
    await updateProfile(user, { displayName: displayName.trim() });
  },

  updatePhotoURL: async (user: User, photoURL: string): Promise<void> => {
    if (auth.currentUser?.uid !== user.uid) throw new AuthError('Oturum değişti.');
    await updateProfile(user, { photoURL });
  },

  reauthenticate: async (user: User, password: string): Promise<void> => {
    if (!user.email) throw new AuthError('E-posta bulunamadi.');
    const cred = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, cred);
  },

  deleteAccount: async (user: User): Promise<void> => {
    await deleteUser(user);
  },

  currentUser: (): User | null => auth.currentUser,
};
