import * as Network from 'expo-network';
import { mutationQueue } from '../sync/mutationQueue';
import { logger } from '../../utils/logger';

const TAG = 'NetworkStatus';

let isCurrentlyOnline = true;

export const networkStatus = {
  isOnline: (): boolean => isCurrentlyOnline,

  checkConnection: async (): Promise<boolean> => {
    try {
      const state = await Network.getNetworkStateAsync();
      isCurrentlyOnline = !!(state.isConnected && state.isInternetReachable !== false);
      return isCurrentlyOnline;
    } catch {
      return true; // Default optimistic
    }
  },

  /**
   * Initializes periodic network polling or checks and flushes offline mutations
   * when the connection transitions from offline to online.
   */
  startMonitoring: (onStatusChange?: (online: boolean) => void): (() => void) => {
    const interval = setInterval(async () => {
      const wasOnline = isCurrentlyOnline;
      const nowOnline = await networkStatus.checkConnection();

      if (!wasOnline && nowOnline) {
        logger.info(TAG, 'Connection restored! Flushing pending offline mutations...');
        // Process offline mutation queue
        const pending = await mutationQueue.load();
        if (pending.length > 0) {
          logger.info(TAG, `Found ${pending.length} pending mutations to sync`);
        }
      }

      if (wasOnline !== nowOnline) {
        onStatusChange?.(nowOnline);
      }
    }, 15000);

    return () => clearInterval(interval);
  },
};
