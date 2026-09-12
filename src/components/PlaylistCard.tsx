import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { PlaylistCollageThumb } from './PlaylistCollageThumb';
import { Colors } from '../constants/theme';
import type { Playlist } from '../models';

interface PlaylistCardProps {
  playlist: Playlist;
  size?: number;
  onPress: () => void;
  onPlayPress?: () => void;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  size = 140,
  onPress,
  onPlayPress,
}) => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const tracks = playlist.tracks || [];

  const renderCover = () => {
    return <PlaylistCollageThumb playlist={playlist} size={size} borderRadius={14} />;
  };

  return (
    <TouchableOpacity
      style={[styles.container, { width: size }]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={[styles.coverWrapper, { width: size, height: size }]}>
        {renderCover()}

        {onPlayPress && tracks.length > 0 && (
          <TouchableOpacity
            style={styles.playBtn}
            activeOpacity={0.85}
            onPress={onPlayPress}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="play" size={16} color="#FFFFFF" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {playlist.name}
      </Text>
      <Text style={styles.trackCount}>
        {tracks.length} parça
      </Text>
    </TouchableOpacity>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    marginRight: 14,
  },
  coverWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    position: 'relative',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  collage: {
    width: '100%',
    height: '100%',
  },
  collageRow: {
    flexDirection: 'row',
  },
  placeholderCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.08)',
  },
  playBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 2,
  },
  trackCount: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});

