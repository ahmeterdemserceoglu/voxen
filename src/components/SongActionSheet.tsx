import { recommendationFeedback } from '../services/recommendations/recommendationFeedback';
import { useAlbumNavigation } from '../hooks/useAlbumNavigation';
import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Share,
  Dimensions,
  Animated,
  PanResponder,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMusicStore } from '../store/musicStore';
import { Colors } from '../constants/theme';
import { useUiStore } from '../store/uiStore';
import { YouTubeService } from '../services/youtubeService';
import { offlineDownloadService } from '../services/offlineDownloadService';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export const SongActionSheet: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { openArtist, openAlbum } = useUiStore();
  const {
    activeActionSong,
    isActionSheetOpen,
    closeActionSheet,
    openAddToPlaylist,
    favorites,
    toggleFavorite,
    addToQueue,
    playNext,
    playTrack,
    setSourceContext,
  } = useMusicStore();

  const albumNavigation = useAlbumNavigation(activeActionSong, () => { closeActionSheet(); useMusicStore.getState().closeFullPlayer(); });
  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = SCREEN_HEIGHT * 0.68;
  const fullHeight = SCREEN_HEIGHT * 0.94;
  const heightAnim = useRef(new Animated.Value(defaultHeight)).current;

  useEffect(() => {
    if (isActionSheetOpen) {
      setIsFullScreen(false);
      heightAnim.setValue(defaultHeight);
    }
  }, [isActionSheetOpen]);

  const toggleFullScreen = (toFull: boolean) => {
    setIsFullScreen(toFull);
    Animated.spring(heightAnim, {
      toValue: toFull ? fullHeight : defaultHeight,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 8,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -30) {
          toggleFullScreen(true);
        } else if (gestureState.dy > 60) {
          if (fullScreenRef.current) {
            toggleFullScreen(false);
          } else {
            closeActionSheet();
          }
        }
      },
    })
  ).current;

  const [isDownloaded, setIsDownloaded] = useState(false);

  useEffect(() => {
    if (activeActionSong) {
      offlineDownloadService.isDownloaded(activeActionSong.id).then(setIsDownloaded);
    } else {
      setIsDownloaded(false);
    }
  }, [activeActionSong]);

  const handleToggleDownload = async () => {
    if (!activeActionSong) return;
    if (isDownloaded) {
      await offlineDownloadService.deleteDownloadedTrack(activeActionSong.id);
      setIsDownloaded(false);
    } else {
      // Start download in background — progress tracked via DownloadProgressRow
      offlineDownloadService.downloadTrack(activeActionSong).then((result) => {
        if (result) setIsDownloaded(true);
      });
    }
  };

  if (!activeActionSong) return null;

  const isFav = favorites.some((f) => f.id === activeActionSong.id);

  const handleShare = async () => {
    closeActionSheet();
    try {
      await Share.share({
        message: `${activeActionSong.title} - ${activeActionSong.artist}\nhttps://music.youtube.com/watch?v=${activeActionSong.id}`,
        title: activeActionSong.title,
      });
    } catch {}
  };

  const handleAddToQueue = () => {
    closeActionSheet();
    addToQueue(activeActionSong);
  };

  const handlePlayNext = () => {
    closeActionSheet();
    playNext(activeActionSong);
  };

  const handleViewArtist = () => {
    closeActionSheet();
    const artist = activeActionSong.artist || activeActionSong.artistName;
    if (artist) openArtist(artist);
  };

  const handleStartRadio = async () => {
    closeActionSheet();
    const artist = activeActionSong.artist || activeActionSong.artistName;
    const tracks = await YouTubeService.search(`${activeActionSong.title} ${artist} radyo mix`);
    if (tracks.length > 0) {
      setSourceContext({ type: 'radio', id: activeActionSong.id });
      playTrack(activeActionSong, [activeActionSong, ...tracks.filter((t) => t.id !== activeActionSong.id)]);
    }
  };

  return (
    <Modal
      visible={isActionSheetOpen}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={closeActionSheet}
    >
      <TouchableWithoutFeedback onPress={closeActionSheet}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.sheetContainer,
                {
                  height: heightAnim,
                  paddingBottom: (insets.bottom || 16) + 12,
                },
              ]}
            >
              {/* Top Bar with PanResponder */}
              <View {...panResponder.panHandlers} style={styles.topBar}>
                {/* Handle */}
                <View style={styles.handle} />

                {/* Song Header */}
                <View style={styles.songHeader}>
                  <Image
                    source={{ uri: activeActionSong.thumbnail }}
                    style={styles.songThumb}
                    contentFit="cover"
                  />
                  <View style={styles.songMeta}>
                    <Text style={styles.songTitle} numberOfLines={1}>
                      {activeActionSong.title}
                    </Text>
                    <Text style={styles.songArtist} numberOfLines={1}>
                      {activeActionSong.artist}
                    </Text>
                  </View>
                </View>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                {/* Action 1: Add to Playlist */}
                <TouchableOpacity
                  style={styles.actionRow}
                  activeOpacity={0.7}
                  onPress={() => openAddToPlaylist(activeActionSong)}
                >
                  <View style={styles.actionIconWrapper}>
                    <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
                  </View>
                  <Text style={styles.actionText}>Çalma Listesine Ekle</Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>

              {/* Action 2: Toggle Favorite */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={() => {
                  toggleFavorite(activeActionSong);
                  closeActionSheet();
                }}
              >
                <View
                  style={[
                    styles.actionIconWrapper,
                    isFav && styles.actionIconFavActive,
                  ]}
                >
                  <Ionicons
                    name={isFav ? 'heart' : 'heart-outline'}
                    size={22}
                    color={isFav ? '#FFFFFF' : '#FFFFFF'}
                  />
                </View>
                <Text
                  style={[styles.actionText, isFav && styles.actionTextFavActive]}
                >
                  {isFav ? 'Beğenilenlerden Kaldır' : 'Beğen'}
                </Text>
              </TouchableOpacity>

              {/* Action: Download / Delete Offline */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handleToggleDownload}
              >
                <View
                  style={[
                    styles.actionIconWrapper,
                    isDownloaded && styles.actionIconFavActive,
                  ]}
                >
                  <Ionicons
                    name={
                      isDownloaded
                        ? 'cloud-done'
                        : 'cloud-download-outline'
                    }
                    size={22}
                    color="#FFFFFF"
                  />
                </View>
                <Text
                  style={[
                    styles.actionText,
                    isDownloaded && styles.actionTextFavActive,
                  ]}
                >
                  {isDownloaded ? 'İndirilenlerden Kaldır' : 'Çevrimdışı İndir'}
                </Text>
              </TouchableOpacity>

              {[false, true].map(artist => <TouchableOpacity key={artist ? 'block-artist' : 'block-track'} style={styles.actionRow} onPress={() => {
                if (activeActionSong) void recommendationFeedback.block(activeActionSong, artist).then(closeActionSheet);
              }}><View style={styles.actionIconWrapper}><Ionicons name="ban-outline" size={22} color={Colors.text} /></View><Text style={styles.actionText}>{artist ? 'Bu sanatçıyı önerme' : 'Bu şarkıyı önerme'}</Text></TouchableOpacity>)}
              {/* Action 3: Play Next */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handlePlayNext}
              >
                <View style={styles.actionIconWrapper}>
                  <Ionicons name="play-forward-outline" size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.actionText}>Sonraki Çal</Text>
              </TouchableOpacity>

              {/* Action 4: Add to Queue */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handleAddToQueue}
              >
                <View style={styles.actionIconWrapper}>
                  <Ionicons name="list-outline" size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.actionText}>Sıraya Ekle</Text>
              </TouchableOpacity>

              {/* Action 5: View Artist */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handleViewArtist}
              >
                <View style={styles.actionIconWrapper}>
                  <Ionicons name="person-outline" size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.actionText}>Sanatçıyı Görüntüle</Text>
              </TouchableOpacity>

              {/* Action 6: View Album */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                disabled={albumNavigation.loading}
                onPress={() => { void albumNavigation.open(); }}
              >
                <View style={styles.actionIconWrapper}>
                  <Ionicons name="disc-outline" size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.actionText}>{albumNavigation.loading ? "Albüm bulunuyor…" : "Albümü Görüntüle"}</Text>
              </TouchableOpacity>

              {/* Action 7: Song Radio */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handleStartRadio}
              >
                <View style={styles.actionIconWrapper}>
                  <Ionicons name="radio-outline" size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.actionText}>Şarkı Radyosunu Başlat</Text>
              </TouchableOpacity>

              {/* Action 8: Share */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handleShare}
              >
                <View style={styles.actionIconWrapper}>
                  <Ionicons name="share-social-outline" size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.actionText}>Paylaş</Text>
              </TouchableOpacity>

              {/* Action 5: Cancel */}
              <TouchableOpacity
                style={styles.cancelBtn}
                activeOpacity={0.8}
                onPress={closeActionSheet}
              >
                <Text style={styles.cancelText}>Kapat</Text>
              </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#161618',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  topBar: {
    paddingTop: 12,
    width: '100%',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  songHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  songThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: Colors.card,
  },
  songMeta: {
    flex: 1,
    marginLeft: 14,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  songArtist: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
  },
  actionIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionIconFavActive: {
    backgroundColor: Colors.primary,
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionTextFavActive: {
    color: Colors.primary,
  },
  cancelBtn: {
    marginTop: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});

