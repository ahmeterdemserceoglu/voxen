import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import type { Playlist } from '../models';

interface PlaylistCollageThumbProps {
  playlist: Playlist;
  size?: number;
  borderRadius?: number;
}

export const PlaylistCollageThumb: React.FC<PlaylistCollageThumbProps> = ({
  playlist,
  size = 60,
  borderRadius = 12,
}) => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const tracks = playlist.tracks || [];
  const validThumbs = tracks
    .map((t) => t.thumbnail || t.thumbnails?.medium || t.thumbnails?.small)
    .filter(Boolean) as string[];

  // 1. 2x2 Collage if 2 or more tracks exist (uses first 4, or fills up to 4)
  if (validThumbs.length >= 2) {
    const collageThumbs = [...validThumbs];
    while (collageThumbs.length < 4) {
      collageThumbs.push(validThumbs[collageThumbs.length % validThumbs.length]);
    }
    const half = size / 2;
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius }]}>
        <View style={{ flexDirection: 'row', width: size, height: half }}>
          <Image source={{ uri: collageThumbs[0] }} style={{ width: half, height: half }} contentFit="cover" />
          <Image source={{ uri: collageThumbs[1] }} style={{ width: half, height: half }} contentFit="cover" />
        </View>
        <View style={{ flexDirection: 'row', width: size, height: half }}>
          <Image source={{ uri: collageThumbs[2] }} style={{ width: half, height: half }} contentFit="cover" />
          <Image source={{ uri: collageThumbs[3] }} style={{ width: half, height: half }} contentFit="cover" />
        </View>
      </View>
    );
  }

  // 2. Single track artwork if 1 track exists
  if (validThumbs.length === 1) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius }]}>
        <Image source={{ uri: validThumbs[0] }} style={styles.fullImage} contentFit="cover" />
      </View>
    );
  }

  // 3. Custom cover image if set and no valid track thumbs
  if (playlist.coverUrl) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius }]}>
        <Image source={{ uri: playlist.coverUrl }} style={styles.fullImage} contentFit="cover" />
      </View>
    );
  }

  // 4. Empty playlist fallback
  return (
    <View
      style={[
        styles.container,
        styles.emptyFallback,
        { width: size, height: size, borderRadius },
      ]}
    >
      <Ionicons name="musical-notes" size={size * 0.42} color={Colors.primary} />
    </View>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#1E1E22',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  emptyFallback: {
    backgroundColor: 'rgba(229, 9, 20, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

