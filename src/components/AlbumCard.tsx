import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import type { AlbumSummary } from '../models';

interface AlbumCardProps {
  album: AlbumSummary;
  size?: number;
  onPress: () => void;
  onPlayPress?: () => void;
}

export const AlbumCard: React.FC<AlbumCardProps> = ({
  album,
  size = 140,
  onPress,
  onPlayPress,
}) => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  return (
    <TouchableOpacity
      style={[styles.container, { width: size }]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={[styles.coverWrapper, { width: size, height: size }]}>
        {album.artworkUrl ? (
          <Image
            source={{ uri: album.artworkUrl }}
            style={styles.cover}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={styles.placeholderCover}>
            <Ionicons name="disc" size={size * 0.35} color={Colors.textMuted} />
          </View>
        )}

        {onPlayPress && (
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

      <Text style={styles.title} numberOfLines={1}>
        {album.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {album.artistName || 'Sanatçı'}
        {album.year ? ` • ${album.year}` : ''}
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
  placeholderCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 2,
  },
  artist: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});

