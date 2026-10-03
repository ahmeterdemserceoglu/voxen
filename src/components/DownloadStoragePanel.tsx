import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '../utils/appAlert';
import { offlineDownloadService, type DownloadEntry } from '../services/offlineDownloadService';
import { useThemeColors } from '../utils/useTheme';
import type { Track } from '../models';
import { accountSession } from '../services/auth/accountStorage';

interface DownloadStoragePanelProps {
  onTracksChanged?: (tracks: Track[]) => void;
  storageBytes?: number;
  onRefresh?: () => void;
}

export function DownloadStoragePanel({ onTracksChanged }: DownloadStoragePanelProps) {
  const colors = useThemeColors();
  const callback = React.useRef(onTracksChanged);
  callback.current = onTracksChanged;

  const [bytes, setBytes] = React.useState(0);
  const [pending, setPending] = React.useState<Track[]>([]);
  const [entries, setEntries] = React.useState<DownloadEntry[]>([]);

  const loadData = React.useCallback(async () => {
    const epoch = accountSession.generation;
    try {
      const [items, size, remaining] = await Promise.all([
        offlineDownloadService.getDownloadedTracks(),
        offlineDownloadService.getStorageUsedBytes(),
        offlineDownloadService.getPendingTracks(),
      ]);
      if (accountSession.isCurrent(epoch)) {
        setBytes(size);
        setPending(remaining);
        callback.current?.(items.map((item) => item.track));
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    setEntries(offlineDownloadService.getAllEntries());
    void loadData();

    // Listen to download progress changes event-driven instead of polling
    const unsubProgress = offlineDownloadService.addProgressListener((_id, progress) => {
      setEntries(offlineDownloadService.getAllEntries());
      if (progress >= 100 || progress === 0) {
        void loadData();
      }
    });

    const unsubAccount = accountSession.subscribe(() => {
      setBytes(0);
      setPending([]);
      setEntries([]);
      callback.current?.([]);
      void loadData();
    });

    return () => {
      unsubProgress();
      unsubAccount();
    };
  }, [loadData]);

  const activeEntries = entries.filter(
    (e) => e.state === 'downloading' || e.state === 'error' || e.state === 'cancelled',
  );

  const handleManageStorage = () => {
    const actions: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }> = [];

    if (pending.length > 0) {
      actions.push({
        text: `${pending.length} Başarısız İndirmeyi Yeniden Dene`,
        onPress: () => {
          void offlineDownloadService.downloadMany(pending);
        },
      });
    }

    if (activeEntries.some((e) => e.state === 'downloading')) {
      actions.push({
        text: 'Aktif İndirmeleri Durdur',
        onPress: () => {
          offlineDownloadService.cancelAllDownloads();
        },
      });
    }

    if (bytes > 0 || pending.length > 0) {
      actions.push({
        text: 'Tüm İndirmeleri Temizle',
        style: 'destructive',
        onPress: () => {
          appAlert('İndirilenleri Temizle', 'Tüm indirilen müzikler ve geçici dosyalar cihazından silinecek. Emin misin?', [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Sil',
              style: 'destructive',
              onPress: () => {
                void offlineDownloadService
                  .clearDownloads()
                  .then(() => loadData())
                  .catch(() => appAlert('Hata', 'Bazı dosyalar silinemedi. Lütfen tekrar deneyin.'));
              },
            },
          ]);
        },
      });
    }

    actions.push({ text: 'Kapat', style: 'cancel' });

    appAlert('İndirme & Depolama Yönetimi', `${(bytes / 1048576).toFixed(1)} MB depolama alanı kullanılıyor.`, actions);
  };

  return (
    <View style={styles.container}>
      {/* Active downloads cards (Spotify style) */}
      {activeEntries.map((entry) => (
        <View key={entry.trackId} style={[styles.activeCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.activeHeader}>
            <View style={styles.activeIconWrap}>
              {entry.state === 'downloading' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name={entry.state === 'error' ? 'alert-circle' : 'pause-circle'}
                  size={18}
                  color={entry.state === 'error' ? '#EF4444' : '#F59E0B'}
                />
              )}
            </View>
            <View style={styles.activeTitleWrap}>
              <Text numberOfLines={1} style={[styles.activeTitle, { color: colors.text }]}>
                {entry.track?.title || 'Müzik indiriliyor'}
              </Text>
              <Text numberOfLines={1} style={[styles.activeSubtitle, { color: colors.textMuted }]}>
                {entry.track?.artist || entry.track?.artistName || 'Voxen'}
              </Text>
            </View>
            <Text style={[styles.activePercent, { color: entry.state === 'error' ? '#EF4444' : colors.primary }]}>
              {entry.state === 'downloading' ? `%${Math.floor(entry.progress)}` : entry.state === 'error' ? 'Hata' : 'Durduruldu'}
            </Text>
            {entry.state === 'downloading' ? (
              <TouchableOpacity
                accessibilityLabel="İndirmeyi durdur"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => offlineDownloadService.cancelDownload(entry.trackId)}
                style={styles.cancelBtn}
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                accessibilityLabel="Listeden kaldır"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => void offlineDownloadService.deleteDownloadedTrack(entry.trackId).then(loadData)}
                style={styles.cancelBtn}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>

          {/* Progress bar */}
          <View style={[styles.progressBarTrack, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.max(0, Math.min(100, entry.progress))}%`,
                  backgroundColor: entry.state === 'error' ? '#EF4444' : colors.primary,
                },
              ]}
            />
          </View>

          {/* Speed & remaining details */}
          <View style={styles.activeFooter}>
            <Text style={[styles.activeMeta, { color: colors.textMuted }]}>
              {entry.error
                ? entry.error
                : [
                    entry.bytesDownloaded != null
                      ? `${(entry.bytesDownloaded / 1048576).toFixed(1)} MB${
                          entry.totalBytes ? ` / ${(entry.totalBytes / 1048576).toFixed(1)} MB` : ''
                        }`
                      : 'Bağlanıyor...',
                    entry.bytesPerSecond ? `${(entry.bytesPerSecond / 1048576).toFixed(1)} MB/s` : '',
                    entry.remainingSeconds ? `${Math.ceil(entry.remainingSeconds)} sn kaldı` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </Text>
          </View>
        </View>
      ))}

      {/* Storage and status pill bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryLeft}>
          <View style={styles.offlineReadyPill}>
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
            <Text style={[styles.offlineReadyText, { color: colors.primary }]}>Çevrimdışı Kullanılabilir</Text>
          </View>
          <TouchableOpacity
            style={[styles.storagePill, { backgroundColor: colors.surface }]}
            activeOpacity={0.7}
            onPress={handleManageStorage}
          >
            <Ionicons name="folder-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.storagePillText, { color: colors.textMuted }]}>
              {(bytes / 1048576).toFixed(1)} MB
            </Text>
            <Ionicons name="ellipsis-horizontal" size={12} color={colors.textMuted} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>

        {pending.length > 0 && (
          <TouchableOpacity
            style={styles.retryPill}
            activeOpacity={0.7}
            onPress={() => void offlineDownloadService.downloadMany(pending)}
          >
            <Ionicons name="refresh" size={13} color="#F59E0B" />
            <Text style={styles.retryPillText}>{pending.length} Yeniden Dene</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  activeCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeIconWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTitleWrap: {
    flex: 1,
  },
  activeTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  activePercent: {
    fontSize: 12,
    fontWeight: '700',
  },
  cancelBtn: {
    padding: 2,
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  activeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  activeMeta: {
    fontSize: 11,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 6,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineReadyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  offlineReadyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E50914',
  },
  storagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  storagePillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  retryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  retryPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
  },
});
