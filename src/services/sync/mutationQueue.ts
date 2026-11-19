import { accountStorage } from '../auth/accountStorage';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { logger } from '../../utils/logger';
import type { PendingMutation, PendingLibrarySnapshot, MutationType } from '../../models';

const TAG = 'MutationQueue';
type QueueStorage = ReturnType<typeof accountStorage.capture>;

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const libraryMutationTypes = new Set<MutationType>([
  'LIKE',
  'UNLIKE',
  'PLAYLIST_ADD',
  'PLAYLIST_REMOVE',
  'PLAYLIST_CREATE',
  'PLAYLIST_DELETE',
  'PLAYLIST_RENAME',
  'PLAYLIST_REORDER',
  'PLAYLIST_UPDATE',
  'LIBRARY_SYNC',
]);

export const isLibraryMutationType = (type: MutationType): boolean => libraryMutationTypes.has(type);

let writeChain: Promise<void> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeChain.then(operation, operation);
  writeChain = result.then(() => undefined, () => undefined);
  return result;
}

async function loadFrom(storage: QueueStorage): Promise<PendingMutation[]> {
  const json = await storage.getItem(STORAGE_KEYS.PENDING_MUTATIONS);
  if (!json) return [];
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error('Stored mutation queue is not an array.');
  }
  for (const mutation of parsed) {
    if (
      !mutation ||
      typeof mutation.id !== 'string' ||
      typeof mutation.type !== 'string' ||
      typeof mutation.createdAt !== 'number' ||
      typeof mutation.retryCount !== 'number'
    ) {
      throw new Error('Stored mutation queue contains an invalid entry.');
    }
  }
  return parsed as PendingMutation[];
}

export const mutationQueue = {
  load: async (storage: QueueStorage = accountStorage.capture()): Promise<PendingMutation[]> => {
    try {
      return await loadFrom(storage);
    } catch (error) {
      logger.warn(TAG, 'Failed to read mutation queue', error);
      throw error;
    }
  },

  save: async (
    mutations: PendingMutation[],
    storage: QueueStorage = accountStorage.capture(),
  ): Promise<void> => {
    await serialize(() => storage.setItem(STORAGE_KEYS.PENDING_MUTATIONS, JSON.stringify(mutations)));
  },

  enqueue: async (
    type: MutationType,
    payload: unknown,
    storage: QueueStorage = accountStorage.capture(),
  ): Promise<PendingMutation> => {
    return serialize(async () => {
      const mutations = await loadFrom(storage);
      const retained = libraryMutationTypes.has(type)
        ? mutations.filter((mutation) => !libraryMutationTypes.has(mutation.type))
        : mutations;
      const mutation: PendingMutation = {
        id: uuid(),
        type,
        payload,
        createdAt: Date.now(),
        retryCount: 0,
      };
      await storage.setItem(
        STORAGE_KEYS.PENDING_MUTATIONS,
        JSON.stringify([...retained, mutation]),
      );
      return mutation;
    });
  },

  remove: async (
    ids: string[],
    storage: QueueStorage = accountStorage.capture(),
  ): Promise<PendingMutation[]> => {
    return serialize(async () => {
      const removed = new Set(ids);
      const remaining = (await loadFrom(storage)).filter((mutation) => !removed.has(mutation.id));
      await storage.setItem(STORAGE_KEYS.PENDING_MUTATIONS, JSON.stringify(remaining));
      return remaining;
    });
  },

  recordFailure: async (
    ids: string[],
    error: unknown,
    storage: QueueStorage = accountStorage.capture(),
  ): Promise<{ mutations: PendingMutation[]; retryAt: number | null }> => {
    return serialize(async () => {
      const failed = new Set(ids);
      const message = error instanceof Error ? error.message : String(error);
      const mutations = await loadFrom(storage);
      let retryAt: number | null = null;
      const updated = mutations.map((mutation) => {
        if (!failed.has(mutation.id)) return mutation;
        const retryCount = mutation.retryCount + 1;
        const delay = Math.min(5 * 60 * 1000, 1000 * (2 ** Math.min(retryCount, 8)));
        retryAt = Date.now() + delay;
        return {
          ...mutation,
          retryCount,
          lastError: message,
          nextAttemptAt: retryAt,
        };
      });
      await storage.setItem(STORAGE_KEYS.PENDING_MUTATIONS, JSON.stringify(updated));
      return { mutations: updated, retryAt };
    });
  },

  clear: async (storage: QueueStorage = accountStorage.capture()): Promise<void> => {
    await serialize(() => storage.removeItem(STORAGE_KEYS.PENDING_MUTATIONS));
  },
};
