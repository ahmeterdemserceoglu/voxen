import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface PlayerControlsProps {
  isPlaying: boolean;
  isLoading?: boolean;
  shuffle?: boolean;
  repeatMode?: 'off' | 'all' | 'one';
  onPlayPause: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  onToggleShuffle?: () => void;
  onToggleRepeat?: () => void;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  isPlaying,
  isLoading = false,
  shuffle = false,
  repeatMode = 'off',
  onPlayPause,
  onSkipNext,
  onSkipPrevious,
  onToggleShuffle,
  onToggleRepeat,
}) => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.container}>
      {/* Shuffle Button */}
      {onToggleShuffle && (
        <TouchableOpacity
          style={styles.subBtn}
          onPress={onToggleShuffle}
          activeOpacity={0.7}
        >
          <Ionicons
            name="shuffle"
            size={22}
            color={shuffle ? Colors.primary : 'rgba(255, 255, 255, 0.45)'}
          />
        </TouchableOpacity>
      )}

      {/* Skip Previous Button */}
      <TouchableOpacity
        style={styles.skipBtn}
        onPress={onSkipPrevious}
        activeOpacity={0.7}
      >
        <Ionicons name="play-skip-back" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Center Play/Pause Button */}
      <TouchableOpacity
        style={styles.playPauseBtn}
        onPress={onPlayPause}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={34}
            color="#FFFFFF"
            style={{ marginLeft: isPlaying ? 0 : 3 }}
          />
        )}
      </TouchableOpacity>

      {/* Skip Next Button */}
      <TouchableOpacity
        style={styles.skipBtn}
        onPress={onSkipNext}
        activeOpacity={0.7}
      >
        <Ionicons name="play-skip-forward" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Repeat Button */}
      {onToggleRepeat && (
        <TouchableOpacity
          style={styles.subBtn}
          onPress={onToggleRepeat}
          activeOpacity={0.7}
        >
          <Ionicons
            name={repeatMode === 'one' ? 'repeat-outline' : 'repeat'}
            size={22}
            color={repeatMode !== 'off' ? Colors.primary : 'rgba(255, 255, 255, 0.45)'}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    width: '100%',
  },
  subBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
});

