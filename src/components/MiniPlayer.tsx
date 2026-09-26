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
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useMusicStore } from '../store/musicStore';
import { useUiStore } from '../store/uiStore';
import { formatTime } from '../utils/formatters';
import { Colors } from '../constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const IS_DESKTOP = Platform.OS === 'web' && process.env.EXPO_PUBLIC_VOXEN_DESKTOP === '1';

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
    skipPrevious,
    openFullPlayer,
    isLoadingStream,
    streamError,
    stopPlayback,
    favorites,
    toggleFavorite,
  } = useMusicStore();
  const { openModal } = useUiStore();

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

  if (IS_DESKTOP) {
    const isFavorite = favorites.some(item => item.id === currentTrack.id);
    return (
      <View style={styles.desktopContainer}>
        <View style={styles.desktopProgressTrack}>
          <View style={[styles.desktopProgressFill, { width: `${progressPercent}%` }]} />
        </View>
        <View style={styles.desktopContentRow}>
          <TouchableOpacity style={styles.desktopTrackArea} activeOpacity={0.82} onPress={openFullPlayer}>
            <Image source={{ uri: currentTrack.thumbnail }} style={styles.desktopArtwork} contentFit="cover" transition={180} />
            <View style={styles.desktopTrackInfo}>
              <Text style={styles.desktopTitle} numberOfLines={1}>{currentTrack.title}</Text>
              <Text style={styles.desktopArtist} numberOfLines={1}>{currentTrack.artist}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.desktopCenterControls}>
            <View style={styles.desktopControlButtons}>
              <TouchableOpacity style={styles.desktopSkipBtn} onPress={skipPrevious}>
                <Ionicons name="play-skip-back" size={19} color={Colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.desktopPlayBtn} onPress={togglePlayPause}>
                {streamError ? (
                  <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
                ) : isLoadingStream ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#FFFFFF" style={{ marginLeft: isPlaying ? 0 : 2 }} />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.desktopSkipBtn} onPress={() => skipNext()}>
                <Ionicons name="play-skip-forward" size={19} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.desktopTime}>{formatTime(position / 1000)}  /  {formatTime(duration / 1000)}</Text>
          </View>

          <View style={styles.desktopActions}>
            <TouchableOpacity style={styles.desktopActionBtn} onPress={() => toggleFavorite(currentTrack)}>
              <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={isFavorite ? Colors.primary : Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.desktopActionBtn} onPress={() => openModal('queue')}>
              <Ionicons name="list" size={21} color={Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.desktopOpenBtn} onPress={openFullPlayer}>
              <Ionicons name="expand-outline" size={19} color={Colors.text} />
              <Text style={styles.desktopOpenText}>Oynatıcı</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

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
  desktopContainer: {
    marginHorizontal: 22,
    marginBottom: 16,
    backgroundColor: 'rgba(20,20,23,0.985)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 25,
  },
  desktopProgressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  desktopProgressFill: { height: '100%', backgroundColor: Colors.primary },
  desktopContentRow: { height: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  desktopTrackArea: { width: '34%', minWidth: 230, maxWidth: 410, flexDirection: 'row', alignItems: 'center' },
  desktopArtwork: { width: 52, height: 52, borderRadius: 10, backgroundColor: Colors.card },
  desktopTrackInfo: { flex: 1, minWidth: 0, marginLeft: 12, marginRight: 18 },
  desktopTitle: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  desktopArtist: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
  desktopCenterControls: { flex: 1, minWidth: 250, alignItems: 'center', justifyContent: 'center' },
  desktopControlButtons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  desktopSkipBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  desktopPlayBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  desktopTime: { color: Colors.textDisabled, fontSize: 9, marginTop: 3, fontVariant: ['tabular-nums'] },
  desktopActions: { width: '34%', minWidth: 250, maxWidth: 410, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 5 },
  desktopActionBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  desktopOpenBtn: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, marginLeft: 3, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  desktopOpenText: { color: Colors.text, fontSize: 11, fontWeight: '700' },
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

