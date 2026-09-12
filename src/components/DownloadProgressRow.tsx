import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineDownloadService, type DownloadEntry, type DownloadState } from '../services/offlineDownloadService';
import { Colors } from '../constants/theme';
import type { Track } from '../models';

interface DownloadProgressRowProps {
  track: Track;
  onDownloadComplete?: () => void;
}

export const DownloadProgressRow: React.FC<DownloadProgressRowProps> = ({
  track,
  onDownloadComplete,
}) => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const [entry, setEntry] = useState<DownloadEntry>(() =>
    offlineDownloadService.getDownloadEntry(track.id),
  );

  useEffect(() => {
    // Sync entry whenever it might have changed externally
    setEntry(offlineDownloadService.getDownloadEntry(track.id));

    const unsub = offlineDownloadService.addProgressListener((id, progress) => {
      if (id !== track.id) return;
      const updated = offlineDownloadService.getDownloadEntry(id);
      setEntry({ ...updated, progress });
      if (updated.state === 'done') {
        onDownloadComplete?.();
      }
    });

    return unsub;
  }, [track.id]);

  const handlePress = async () => {
    const current = offlineDownloadService.getDownloadEntry(track.id);

    if (current.state === 'downloading') {
      offlineDownloadService.cancelDownload(track.id);
      return;
    }

    if (current.state === 'done') {
      // Already downloaded — offer delete on next tap handled by parent
      return;
    }

    // Start download
    setEntry({ trackId: track.id, state: 'downloading', progress: 0 });
    await offlineDownloadService.downloadTrack(track, (p) => {
      setEntry({ ...offlineDownloadService.getDownloadEntry(track.id), progress: p });
    });
    setEntry({ ...offlineDownloadService.getDownloadEntry(track.id) });
  };

  return (
    <View style={styles.row}>
      {/* Progress indicator */}
      {entry.state === 'downloading' && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressFill, { width: `${entry.progress}%` }]} />
        </View>
      )}

      {/* Action button */}
      <TouchableOpacity
        style={[styles.btn, entry.state === 'done' && styles.btnDone]}
        onPress={handlePress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        {renderIcon(entry.state)}
      </TouchableOpacity>

      {/* Progress percentage text */}
      {entry.state === 'downloading' && (
        <Text style={styles.pctText}>{entry.progress}%</Text>
      )}

      {/* Error text */}
      {entry.state === 'error' && (
        <Text style={styles.errorText} numberOfLines={1}>
          {entry.error ?? 'Hata'}
        </Text>
      )}
    </View>
  );
};

function renderIcon(state: DownloadState) {
  switch (state) {
    case 'downloading':
      return <ActivityIndicator size="small" color={Colors.primary} />;
    case 'done':
      return <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />;
    case 'error':
      return <Ionicons name="refresh-circle" size={22} color="#FF6B6B" />;
    case 'cancelled':
      return <Ionicons name="arrow-down-circle-outline" size={22} color={Colors.textMuted} />;
    default:
      return <Ionicons name="arrow-down-circle-outline" size={22} color={Colors.textMuted} />;
  }
}

const createStyles = (Colors: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 1,
  },
  btn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDone: {
    opacity: 0.85,
  },
  pctText: {
    fontSize: 11,
    color: Colors.textMuted,
    minWidth: 32,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    fontSize: 11,
    color: '#FF6B6B',
    maxWidth: 80,
  },
});

