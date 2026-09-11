import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import type { Track } from '../models';

interface TrackRowProps {
  track: Track;
  index?: number;
  isCurrent?: boolean;
  isPlaying?: boolean;
  onPress: () => void;
  onMorePress?: () => void;
}

export const TrackRow: React.FC<TrackRowProps> = ({
  track,
  index,
  isCurrent,
  isPlaying,
  onPress,
  onMorePress,
}) => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const thumbUrl = track.thumbnail || track.thumbnails?.small || track.thumbnails?.medium || '';
  const artist = track.artist || track.artistName || 'Bilinmeyen Sanatçı';

  return (
    <TouchableOpacity
      style={[styles.container, isCurrent && styles.containerActive]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      {index !== undefined && (
        <Text style={[styles.indexText, isCurrent && styles.indexTextActive]}>
          {index + 1}
        </Text>
      )}

      <Image source={{ uri: thumbUrl }} style={styles.thumbnail} contentFit="cover" />

      <View style={styles.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {track.explicit && (
            <View style={styles.explicitBadge}>
              <Text style={styles.explicitText}>E</Text>
            </View>
          )}
          <Text style={[styles.title, isCurrent && styles.titleActive]} numberOfLines={1}>
            {track.title}
          </Text>
        </View>
        <Text style={styles.artist} numberOfLines={1}>
          {artist}
        </Text>
      </View>

      {track.durationFormatted && (
        <Text style={styles.duration}>{track.durationFormatted}</Text>
      )}

      {isCurrent && (
        <View style={styles.indicator}>
          <Ionicons
            name={isPlaying ? 'volume-high' : 'pause'}
            size={18}
            color={Colors.primary}
          />
        </View>
      )}

      {onMorePress && (
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={onMorePress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  containerActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  indexText: {
    width: 24,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
    marginRight: 10,
  },
  indexTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: Colors.surface,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  titleActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  artist: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  duration: {
    fontSize: 12,
    color: Colors.textMuted,
    marginRight: 8,
  },
  indicator: {
    paddingHorizontal: 4,
  },
  moreBtn: {
    padding: 6,
  },
  explicitBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  explicitText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});

