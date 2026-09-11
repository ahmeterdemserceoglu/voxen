import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { logger } from './logger';

const TAG = 'StorageVersion';
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Ensures data backward-compatibility and executes migration routines
 * when upgrading app versions.
 */
export async function runStorageMigrations(): Promise<void> {
  try {
    const rawVersion = await AsyncStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
    const storedVersion = rawVersion ? parseInt(rawVersion, 10) : 1;

    if (storedVersion >= CURRENT_SCHEMA_VERSION) {
      logger.debug(TAG, `Storage schema is up to date (v${storedVersion})`);
      return;
    }

    logger.info(TAG, `Migrating storage schema from v${storedVersion} to v${CURRENT_SCHEMA_VERSION}`);

    // Migration v1 -> v2: Ensure playlists and favorites have normalized Track structures
    if (storedVersion < 2) {
      const favsRaw = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (favsRaw) {
        try {
          const favs = JSON.parse(favsRaw);
          if (Array.isArray(favs)) {
            const migrated = favs.map((item: any) => ({
              ...item,
              artist: item.artist || item.artistName || 'Bilinmeyen Sanatçı',
              artistName: item.artistName || item.artist || 'Bilinmeyen Sanatçı',
              thumbnail: item.thumbnail || item.thumbnails?.medium || '',
            }));
            await AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(migrated));
          }
        } catch {}
      }
    }

    // Save updated version
    await AsyncStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, String(CURRENT_SCHEMA_VERSION));
    logger.info(TAG, `Migration to v${CURRENT_SCHEMA_VERSION} completed successfully`);
  } catch (err) {
    logger.warn(TAG, 'Storage migration failed', err);
  }
}
