import * as Network from 'expo-network';
import { syncService } from '../sync/syncService';
import { logger } from '../../utils/logger';

const TAG = 'NetworkStatus';

let isCurrentlyOnline: boolean | null = null;

export const networkStatus = {
  isOnline: (): boolean => isCurrentlyOnline === true,

  checkConnection: async (): Promise<boolean | null> => {
    try {
      const state = await Network.getNetworkStateAsync();
      isCurrentlyOnline = state.isConnected === true && state.isInternetReachable !== false;
      syncService.setOnline(isCurrentlyOnline);
      return isCurrentlyOnline;
    } catch (error) {
      logger.warn(TAG, 'Could not determine network status', error);
      return isCurrentlyOnline;
    }
  },

  startMonitoring: (onStatusChange?: (online: boolean) => void): (() => void) => {
    let active = true;
    let hasInitialStatus = false;
    let checking = false;
    const check = async () => {
      if (!active || checking) return;
      checking = true;
      try {
        const wasOnline = isCurrentlyOnline;
        const nowOnline = await networkStatus.checkConnection();
        if (!active || nowOnline === null) return;
        if (!hasInitialStatus || wasOnline !== nowOnline) {
          hasInitialStatus = true;
          if (wasOnline === false && nowOnline) {
            logger.info(TAG, 'Connection restored; syncing pending changes');
          }
          onStatusChange?.(nowOnline);
        }
      } finally {
        checking = false;
      }
    };
    void check();
    const interval = setInterval(() => void check(), 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  },
};
