import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMusicStore } from '../store/musicStore';
import { useUiStore } from '../store/uiStore';
import { useAlbumNavigation } from '../hooks/useAlbumNavigation';
import { Colors } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = Math.min(SCREEN_WIDTH - 64, 340);

function formatTime(ms: number): string {
  if (!ms || isNaN(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const FullPlayerModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { openModal } = useUiStore();
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    isFullPlayerOpen,
    closeFullPlayer,
    togglePlayPause,
    skipNext,
    skipPrevious,
    seekTo,
    favorites,
    toggleFavorite,
    isLoadingStream,
    streamError,
    queue,
    openActionSheet,
    openAddToPlaylist,
    shuffle,
    toggleShuffle,
    repeatMode,
    setRepeatMode,
    playTrack,
    retryPlayback,
    setPlaybackStatus,
  } = useMusicStore();

  const albumNavigation = useAlbumNavigation(currentTrack, closeFullPlayer);
  const sliderWidth = useRef(1);
  const scrubTarget = useRef(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);

  if (!currentTrack) return null;

  const isFav = favorites.some((f) => f.id === currentTrack.id);
  const currentPos = isScrubbing ? scrubPosition : position;
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentPos / duration)) : 0;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${currentTrack.title} - ${currentTrack.artist}\nhttps://music.youtube.com/watch?v=${currentTrack.id}`,
        title: currentTrack.title,
      });
    } catch {
      // ignore
    }
  };

  const handleProgressTouch = (evt: any) => {
    const { locationX } = evt.nativeEvent;
    const barWidth = sliderWidth.current;
    const ratio = Math.max(0, Math.min(1, locationX / barWidth));
    const targetMs = ratio * duration;
    scrubTarget.current = targetMs;
    setScrubPosition(targetMs);
  };

  const handleProgressRelease = (evt: any) => {
    handleProgressTouch(evt);
    seekTo(scrubTarget.current);
    setIsScrubbing(false);
  };

  return (
    <Modal
      visible={isFullPlayerOpen}
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={closeFullPlayer}
    >
      <View style={[styles.container, { paddingTop: insets.top || 20, paddingBottom: insets.bottom || 24 }]}>
        {/* Subtle Ambient Vignette Background */}
        <LinearGradient
          colors={['rgba(229, 9, 20, 0.18)', 'rgba(22, 22, 24, 0.95)', '#0B0B0B']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.65 }}
        />

        {/* Top Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerGlassBtn}
            onPress={closeFullPlayer}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-down" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerSub}>ŞİMDİ OYNATILIYOR</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {queue.length > 1 ? `Çalma Listesi` : 'Voxen Music'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.headerGlassBtn}
            onPress={handleShare}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="share-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Main Album Artwork */}
        <View style={styles.artworkContainer}>
          <View style={styles.artworkShadow}>
            <Image
              source={{ uri: currentTrack.thumbnail }}
              style={[styles.artwork, !!streamError && styles.artworkDimmed]}
              contentFit="cover"
              transition={300}
            />
            {/* Stream Error Overlay */}
            {streamError && (
              <View style={styles.errorOverlay}>
                <Ionicons name="alert-circle" size={36} color="#FF6B6B" />
                <Text style={styles.errorText}>{streamError}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (currentTrack) {
                      // Clear error and re-trigger load by re-playing the current track
                      setPlaybackStatus({ streamError: null });
                      retryPlayback();
                    }
                  }}
                >
                  <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.retryBtnText}>Yeniden Dene</Text>
                </TouchableOpacity>
                {queue.length > 1 && (
                  <TouchableOpacity
                    style={[styles.retryBtn, styles.skipErrorBtn]}
                    activeOpacity={0.8}
                    onPress={() => skipNext()}
                  >
                    <Ionicons name="play-skip-forward" size={16} color="rgba(255,255,255,0.7)" style={{ marginRight: 6 }} />
                    <Text style={[styles.retryBtnText, { color: 'rgba(255,255,255,0.7)' }]}>Sonraki Şarkıya Geç</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Title, Artist and Heart Favorite Button */}
        <View style={styles.metaRow}>
          <View style={styles.titleCol}>
            <Text style={styles.trackTitle} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <Text style={styles.trackArtist} numberOfLines={1}>
              {currentTrack.artist}
            </Text>
            <TouchableOpacity accessibilityLabel="Şarkının albümünü aç" disabled={albumNavigation.loading} onPress={() => { void albumNavigation.open(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 }}>
              {albumNavigation.loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="disc-outline" size={15} color={Colors.primary} />}
              <Text numberOfLines={1} style={{ flexShrink: 1, color: Colors.primary, fontSize: 12 }}>{typeof currentTrack.album === 'object' ? currentTrack.album.title : currentTrack.album || 'Albümü görüntüle'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              style={styles.glassCircleBtn}
              activeOpacity={0.7}
              onPress={() => openAddToPlaylist(currentTrack)}
            >
              <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.glassCircleBtn, isFav && styles.heartActiveBtn]}
              activeOpacity={0.7}
              onPress={() => toggleFavorite(currentTrack)}
            >
              <Ionicons
                name={isFav ? 'heart' : 'heart-outline'}
                size={22}
                color={isFav ? '#FFFFFF' : Colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Custom Sleek Slider */}
        <View style={styles.sliderContainer}>
          <View
            style={styles.sliderTouchArea}
            onLayout={(evt) => { sliderWidth.current = Math.max(1, evt.nativeEvent.layout.width); }}
            onResponderTerminationRequest={() => false}
            onResponderTerminate={() => setIsScrubbing(false)}
            onStartShouldSetResponder={() => true}
            onResponderGrant={(evt) => {
              setIsScrubbing(true);
              handleProgressTouch(evt);
            }}
            onResponderMove={handleProgressTouch}
            onResponderRelease={handleProgressRelease}
          >
            <View style={styles.sliderTrack} pointerEvents="none">
              <View style={[styles.sliderFill, { width: `${progressRatio * 100}%` }]} />
              <View
                style={[
                  styles.sliderThumb,
                  { left: `${Math.max(0, Math.min(97, progressRatio * 100))}%` },
                ]}
              />
            </View>
          </View>

          {/* Time stamps */}
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(currentPos)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Playback Controls */}
        <View style={styles.controlsRow}>
          {/* Shuffle */}
          <TouchableOpacity
            style={styles.controlSubBtn}
            onPress={toggleShuffle}
            activeOpacity={0.7}
          >
            <Ionicons
              name="shuffle"
              size={22}
              color={shuffle ? Colors.primary : 'rgba(255,255,255,0.45)'}
            />
          </TouchableOpacity>

          {/* Previous Track */}
          <TouchableOpacity
            style={styles.controlSkipBtn}
            onPress={skipPrevious}
            activeOpacity={0.7}
          >
            <Ionicons name="play-skip-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Center 72dp Maxen Red Play/Pause Button */}
          <TouchableOpacity
            style={styles.playPauseBtn}
            onPress={togglePlayPause}
            activeOpacity={0.85}
          >
            {isLoadingStream ? (
              <ActivityIndicator size="large" color="#FFFFFF" />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={34}
                color="#FFFFFF"
                style={{ marginLeft: isPlaying ? 0 : 3 }}
              />
            )}
          </TouchableOpacity>

          {/* Next Track */}
          <TouchableOpacity
            style={styles.controlSkipBtn}
            onPress={() => skipNext()}
            activeOpacity={0.7}
          >
            <Ionicons name="play-skip-forward" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Repeat */}
          <TouchableOpacity
            style={styles.controlSubBtn}
            onPress={() => {
              if (repeatMode === 'off') setRepeatMode('all');
              else if (repeatMode === 'all') setRepeatMode('one');
              else setRepeatMode('off');
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={repeatMode === 'one' ? 'repeat-outline' : 'repeat'}
              size={22}
              color={repeatMode !== 'off' ? Colors.primary : 'rgba(255,255,255,0.45)'}
            />
          </TouchableOpacity>
        </View>

        {/* Bottom Actions: Lyrics, Related & Queue */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.lyricsPill}
            onPress={() => openModal('lyrics')}
            activeOpacity={0.7}
          >
            <Ionicons name="mic-outline" size={16} color={Colors.text} />
            <Text style={styles.lyricsText}>Sözler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.lyricsPill}
            onPress={() => { closeFullPlayer(); openModal('related'); }}
            activeOpacity={0.7}
          >
            <Ionicons name="sparkles-outline" size={16} color={Colors.primary} />
            <Text style={styles.lyricsText}>Benzerler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.queuePill}
            onPress={() => openModal('queue')}
            activeOpacity={0.7}
          >
            <Ionicons name="list" size={16} color={Colors.primary} />
            <Text style={styles.queueText}>
              Kuyruk
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0B',
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  headerGlassBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerSub: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  artworkContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 18,
  },
  artworkShadow: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20,
  },
  artwork: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  titleCol: {
    flex: 1,
    paddingRight: 16,
  },
  trackTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  trackArtist: {
    fontSize: 15,
    color: Colors.textMuted,
    marginTop: 4,
    fontWeight: '500',
  },
  glassCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartActiveBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  sliderContainer: {
    width: '100%',
    marginTop: 18,
  },
  sliderTouchArea: {
    height: 30,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 2,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 14,
  },
  controlSubBtn: {
    padding: 10,
  },
  controlSkipBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  lyricsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  lyricsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  queuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  queueText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  artworkDimmed: {
    opacity: 0.35,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.9,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: 4,
  },
  skipErrorBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

