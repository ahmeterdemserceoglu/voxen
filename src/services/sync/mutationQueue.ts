import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { logger } from '../../utils/logger';
import type { PendingMutation, MutationType } from '../../models';

const TAG = 'MutationQueue';

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const mutationQueue = {
  load: async (): Promise<PendingMutation[]> => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_MUTATIONS);
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  },

  save: async (mutations: PendingMutation[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PENDING_MUTATIONS, JSON.stringify(mutations));
    } catch (err) {
      logger.warn(TAG, 'Failed to persist mutation queue', err);
    }
  },

  enqueue: async (type: MutationType, payload: unknown): Promise<void> => {
    const mutations = await mutationQueue.load();
    mutations.push({
      id: uuid(),
      type,
      payload,
      createdAt: Date.now(),
      retryCount: 0,
    });
    await mutationQueue.save(mutations);
  },

  remove: async (id: string): Promise<void> => {
    const mutations = await mutationQueue.load();
    await mutationQueue.save(mutations.filter((m) => m.id !== id));
  },

  clear: async (): Promise<void> => {
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_MUTATIONS);
  },
};
