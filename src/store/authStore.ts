import { create } from 'zustand';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { useMusicStore } from './musicStore';
import { useLibraryStore } from './libraryStore';
import { usePlaylistStore } from './playlistStore';
import { useSettingsStore } from './settingsStore';
import { useSocialStore } from './socialStore';
import { useUiStore } from './uiStore';
import { accountSession } from '../services/auth/accountStorage';
import { socialService } from '../services/social/socialService';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  errorMessage: string | null;

  initAuthListener: () => () => void;
  signIn: (email: string, pass: string) => Promise<boolean>;
  signUp: (email: string, pass: string, name?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  clearError: () => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthModalOpen: false,
  errorMessage: null,

  initAuthListener: () => {
    return onAuthStateChanged(auth, async (user) => {
      const epoch = accountSession.switchTo(user?.uid ?? null);
      set({ user, isLoading: true });
      useMusicStore.setState(useMusicStore.getInitialState());
      useLibraryStore.setState(useLibraryStore.getInitialState());
      usePlaylistStore.setState(usePlaylistStore.getInitialState());
      useSettingsStore.setState(useSettingsStore.getInitialState());
      useSocialStore.setState(useSocialStore.getInitialState());
      useUiStore.setState(useUiStore.getInitialState());
      await Promise.all([
        useMusicStore.getState().loadStoredData(),
        useLibraryStore.getState().loadStoredData(),
        usePlaylistStore.getState().loadStoredData(),
        useSettingsStore.getState().loadSettings(),
      ]);
      if (!accountSession.isCurrent(epoch)) return;
      useMusicStore.setState({ accountReady: true });
      set({ isLoading: false });
      if (user) {
        await Promise.all([
          useMusicStore.getState().syncWithCloud(user.uid),
          Promise.all([socialService.getFollowing(user.uid), socialService.getFollowers(user.uid)]).then(([following, followers]) => {
            if (!accountSession.isCurrent(epoch)) return;
            useSocialStore.setState({ followingUsers: following, followers });
          }),
        ]);
      }
    });
  },

  signIn: async (email, pass) => {
    set({ isLoading: true, errorMessage: null });
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      set({ isAuthModalOpen: false });
      return true;
    } catch (err: any) {
      let msg = 'Giriş başarısız oldu. Lütfen bilgilerinizi kontrol edin.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = 'E-posta veya şifre hatalı.';
      } else if (err.code === 'auth/user-not-found') {
        msg = 'Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Geçersiz e-posta formatı.';
      }
      set({ errorMessage: msg, isLoading: false });
      return false;
    }
  },

  signUp: async (email, pass, name) => {
    set({ isLoading: true, errorMessage: null });
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      if (name && userCredential.user) {
        await updateProfile(userCredential.user, { displayName: name.trim() });
      }
      set({ isAuthModalOpen: false });
      return true;
    } catch (err: any) {
      let msg = 'Kayıt işlemi başarısız.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'Bu e-posta adresi zaten kullanımda.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Şifre en az 6 karakter olmalıdır.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Geçersiz e-posta adresi.';
      }
      set({ errorMessage: msg, isLoading: false });
      return false;
    }
  },

  signOut: async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.warn('Signout error:', err);
    }
  },

  resetPassword: async (email) => {
    set({ isLoading: true, errorMessage: null });
    try {
      await sendPasswordResetEmail(auth, email.trim());
      set({ isLoading: false });
      return true;
    } catch (err: any) {
      set({
        errorMessage: 'Şifre sıfırlama e-postası gönderilemedi. E-postanızı kontrol edin.',
        isLoading: false,
      });
      return false;
    }
  },

  openAuthModal: () => set({ isAuthModalOpen: true, errorMessage: null }),
  closeAuthModal: () => set({ isAuthModalOpen: false, errorMessage: null }),
  clearError: () => set({ errorMessage: null }),
  setUser: (user) => set({ user }),
}));
