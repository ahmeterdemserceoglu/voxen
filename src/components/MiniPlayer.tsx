import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useMusicStore } from '../store/musicStore';
import { Colors } from '../constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

export const MiniPlayer: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    togglePlayPause,
    skipNext,
    openFullPlayer,
    isLoadingStream,
    streamError,
    stopPlayback,
  } = useMusicStore();

  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    translateX.setValue(0);
    opacity.setValue(1);
  }, [currentTrack?.id]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Detect horizontal swipe to the left
        return gestureState.dx < -12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.3;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
          const newOpacity = Math.max(0, 1 - Math.abs(gestureState.dx) / (SCREEN_WIDTH * 0.7));
          opacity.setValue(newOpacity);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -80 || gestureState.vx < -0.6) {
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: -SCREEN_WIDTH,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            stopPlayback();
          });
        } else {
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              friction: 8,
              tension: 60,
            }),
            Animated.spring(opacity, {
              toValue: 1,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  if (!currentTrack) return null;

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          transform: [{ translateX }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.touchArea}
        activeOpacity={0.92}
        onPress={openFullPlayer}
      >
        <View style={styles.contentRow}>
          {/* Album Art */}
          <Image
            source={{ uri: currentTrack.thumbnail }}
            style={styles.artwork}
            contentFit="cover"
            transition={200}
          />

          {/* Track Details */}
          <View style={styles.trackInfo}>
            <Text style={styles.title} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {currentTrack.artist}
            </Text>
          </View>

          {/* Playback Controls */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.playBtn}
              onPress={togglePlayPause}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {streamError ? (
                <Ionicons name="alert-circle" size={18} color="#FF6B6B" />
              ) : isLoadingStream ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={20}
                  color="#FFFFFF"
                  style={{ marginLeft: isPlaying ? 0 : 2 }}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => skipNext()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="play-skip-forward" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Sleek bottom progress bar */}
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(26, 26, 29, 0.97)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  touchArea: {
    width: '100%',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.card,
  },
  trackInfo: {
    flex: 1,
    marginHorizontal: 12,
    justifyContent: 'center',
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  artist: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  skipBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarTrack: {
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
});

