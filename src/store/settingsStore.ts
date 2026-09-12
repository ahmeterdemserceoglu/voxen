import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { accountSession } from '../services/auth/accountStorage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { logger } from '../utils/logger';

const TAG = 'SettingsStore';

export type Theme = 'dark' | 'amoled' | 'light' | 'system';

export interface Settings {
  theme: Theme;
  autoplay: boolean;
  normalizeVolume: boolean;
  crossfade: boolean;
  crossfadeDuration: number; // seconds, 0 = off, 2-8 = active
  discoveryVariety: 'familiar' | 'balanced' | 'adventurous';
  gapless: boolean;
  equalizerEnabled: boolean;
  equalizerBands: number[];
  sleepTimerDeadline: number;
  sleepTimerTrackEnd: boolean;
  explicitContent: boolean;
  profileVisibility: 'public' | 'private';
  showListeningActivity: boolean;
  showPublicPlaylists: boolean;
  historyEnabled: boolean;
  preferredGenres: string[];
  onboardingCompleted: boolean;
  language: string;
  updatedAt: number;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  autoplay: true,
  normalizeVolume: false,
  crossfade: false,
  crossfadeDuration: 3,
  discoveryVariety: 'balanced',
  gapless: false,
  equalizerEnabled: false,
  equalizerBands: [0, 0, 0, 0, 0],
  sleepTimerDeadline: 0,
  sleepTimerTrackEnd: false,
  explicitContent: true,
  profileVisibility: 'public',
  showListeningActivity: true,
  showPublicPlaylists: true,
  historyEnabled: true,
  preferredGenres: [],
  onboardingCompleted: false,
  language: 'tr',
  updatedAt: Date.now(),
};

interface SettingsState extends Settings {
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

const persist = async (settings: Settings) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    logger.warn(TAG, 'Persist error', err);
  }
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoading: false,

  loadSettings: async () => {
    const epoch = accountSession.generation;
    set({ isLoading: true });
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!accountSession.isCurrent(epoch)) return;
      if (json) {
        const stored: Partial<Settings> = JSON.parse(json);
        set({ ...DEFAULT_SETTINGS, ...stored, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (err) {
      if (!accountSession.isCurrent(epoch)) return;
      logger.warn(TAG, 'loadSettings error', err);
      set({ isLoading: false });
    }
  },

  updateSettings: async (partial) => {
    const current = get();
    const updated: Settings = {
      theme: current.theme,
      autoplay: current.autoplay,
      normalizeVolume: current.normalizeVolume,
      crossfade: current.crossfade,
      crossfadeDuration: current.crossfadeDuration,
      discoveryVariety: current.discoveryVariety,
      gapless: current.gapless,
      equalizerEnabled: current.equalizerEnabled,
      equalizerBands: current.equalizerBands,
      sleepTimerDeadline: current.sleepTimerDeadline,
      sleepTimerTrackEnd: current.sleepTimerTrackEnd,
      explicitContent: current.explicitContent,
      profileVisibility: current.profileVisibility,
      showListeningActivity: current.showListeningActivity,
      showPublicPlaylists: current.showPublicPlaylists,
      historyEnabled: current.historyEnabled,
      preferredGenres: current.preferredGenres,
      onboardingCompleted: current.onboardingCompleted,
      language: current.language,
      updatedAt: Date.now(),
      ...partial,
    };
    updated.equalizerBands = Array.from({ length: 5 }, (_, i) => Math.max(-12, Math.min(12, Number(updated.equalizerBands?.[i]) || 0)));
    updated.crossfadeDuration = Math.max(2, Math.min(8, Number(updated.crossfadeDuration) || 3));
    updated.sleepTimerDeadline = Math.max(0, Number(updated.sleepTimerDeadline) || 0);
    set(updated);
    await persist(updated);
  },

  resetSettings: async () => {
    const fresh = { ...DEFAULT_SETTINGS, updatedAt: Date.now() };
    set(fresh);
    await persist(fresh);
  },
}));
