import { accountStorage as AsyncStorage, accountSession } from '../auth/accountStorage';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { logger } from '../../utils/logger';
import {
  type TasteProfile,
  type TasteInteraction,
  applyInteraction,
  createEmptyTasteProfile,
} from '../../models';

const TAG = 'TasteProfileService';

let memProfile: TasteProfile | null = null;
let profileGeneration = -1;
let pendingRecord: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

export const tasteProfileService = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  load: async (): Promise<TasteProfile> => {
    const epoch = accountSession.generation;
    if (profileGeneration !== epoch) { memProfile = null; profileGeneration = epoch; }
    if (memProfile) return memProfile;
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEYS.TASTE_PROFILE);
      if (!accountSession.isCurrent(epoch)) return createEmptyTasteProfile();
      memProfile = json ? JSON.parse(json) : createEmptyTasteProfile();
    } catch {
      memProfile = createEmptyTasteProfile();
    }
    return memProfile!;
  },

  save: async (profile: TasteProfile): Promise<void> => {
    profileGeneration = accountSession.generation;
    memProfile = profile;
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.TASTE_PROFILE, JSON.stringify(profile));
    } catch (err) {
      logger.warn(TAG, 'Failed to save taste profile', err);
    }
  },

  record: async (
    interaction: TasteInteraction,
    artistName?: string,
    genre?: string,
    trackId?: string,
  ): Promise<void> => {
    const epoch = accountSession.generation;
    const operation = pendingRecord.then(async () => {
      if (!accountSession.isCurrent(epoch)) return;
      const profile = await tasteProfileService.load();
      if (!accountSession.isCurrent(epoch)) return;
      await tasteProfileService.save(applyInteraction(profile, interaction, artistName, genre, trackId));
      if (interaction !== 'PLAY' && accountSession.isCurrent(epoch)) listeners.forEach(listener => listener());
    });
    pendingRecord = operation.catch(err => logger.warn(TAG, 'Failed to record interaction', err));
    await pendingRecord;
  },

  get: async (): Promise<TasteProfile> => tasteProfileService.load(),

  reset: async (): Promise<void> => {
    memProfile = createEmptyTasteProfile();
    await AsyncStorage.removeItem(STORAGE_KEYS.TASTE_PROFILE);
    listeners.forEach(listener => listener());
  },
};
