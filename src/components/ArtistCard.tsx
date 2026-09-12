import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import type { SerializedArtist } from '../models';

interface ArtistCardProps {
  artist: SerializedArtist;
  size?: number;
  onPress: () => void;
}

export const ArtistCard: React.FC<ArtistCardProps> = ({
  artist,
  size = 110,
  onPress,
}) => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  return (
    <TouchableOpacity
      style={[styles.container, { width: size }]}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <View style={[styles.avatarWrapper, { width: size, height: size, borderRadius: size / 2 }]}>
        {artist.thumbnailUrl ? (
          <Image
            source={{ uri: artist.thumbnailUrl }}
            style={styles.avatar}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={styles.placeholderAvatar}>
            <Ionicons name="person" size={size * 0.4} color={Colors.textMuted} />
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {artist.name}
      </Text>
      <Text style={styles.subText}>Sanatçı</Text>
    </TouchableOpacity>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    alignItems: 'center',
    marginRight: 14,
  },
  avatarWrapper: {
    overflow: 'hidden',
    backgroundColor: Colors.card,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  placeholderAvatar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
  },
  subText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
});

