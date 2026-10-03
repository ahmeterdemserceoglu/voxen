import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import { appAlert } from '../utils/appAlert';
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Animated,
  useWindowDimensions,
  Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMusicStore, Playlist } from '../store/musicStore';
import { PlaylistCollageThumb } from './PlaylistCollageThumb';
import { Colors } from '../constants/theme';

const IS_DESKTOP = Platform.OS === 'web' && process.env.EXPO_PUBLIC_VOXEN_DESKTOP === '1';

export const AddToPlaylistModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const {
    isAddToPlaylistOpen,
    addToPlaylistSong,
    closeAddToPlaylist,
    playlists,
    createPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
  } = useMusicStore();

  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = IS_DESKTOP ? Math.min(620, windowHeight * 0.8) : windowHeight * 0.72;
  const fullHeight = IS_DESKTOP ? Math.min(740, windowHeight * 0.9) : windowHeight * 0.94;
  const heightAnim = useRef(new Animated.Value(defaultHeight)).current;
  const toggleFullScreenRef = useRef<(toFull: boolean) => void>(() => {});

  useEffect(() => {
    if (isAddToPlaylistOpen) {
      setIsFullScreen(false);
      setIsCreatingNew(false);
      setNewPlaylistName('');
      heightAnim.setValue(defaultHeight);
    }
  }, [isAddToPlaylistOpen]);

  useEffect(() => {
    if (isAddToPlaylistOpen) heightAnim.setValue(fullScreenRef.current ? fullHeight : defaultHeight);
  }, [windowHeight]);

  const toggleFullScreen = (toFull: boolean) => {
    setIsFullScreen(toFull);
    Animated.spring(heightAnim, {
      toValue: toFull ? fullHeight : defaultHeight,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    }).start();
  };
  toggleFullScreenRef.current = toggleFullScreen;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 8,
      onPanResponderRelease: (_, gestureState) => {
        // Explicit swipe UP -> expand to full screen
        if (gestureState.dy < -30) {
          toggleFullScreenRef.current(true);
        } else if (gestureState.dy > 60) {
          // Explicit swipe DOWN
          if (fullScreenRef.current) {
            toggleFullScreenRef.current(false);
          } else {
            closeAddToPlaylist();
          }
        }
      },
    })
  ).current;

  if (!addToPlaylistSong) return null;

  const handleCreateAndAdd = async () => {
    if (!newPlaylistName.trim()) {
      appAlert('Hata', 'Lütfen çalma listesi için bir ad girin.');
      return;
    }

    const playlistId = await createPlaylist(newPlaylistName.trim());
    await addTrackToPlaylist(playlistId, addToPlaylistSong);
    setNewPlaylistName('');
    setIsCreatingNew(false);
    closeAddToPlaylist();
  };

  const handleTogglePlaylist = async (playlist: Playlist) => {
    const isAlreadyIn = playlist.tracks.some((t) => t.id === addToPlaylistSong.id);
    if (isAlreadyIn) {
      await removeTrackFromPlaylist(playlist.id, addToPlaylistSong.id);
    } else {
      await addTrackToPlaylist(playlist.id, addToPlaylistSong);
    }
  };

  return (
    <Modal
      visible={isAddToPlaylistOpen}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={closeAddToPlaylist}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={closeAddToPlaylist}
        />
        <Animated.View
          style={[
            styles.modalCard,
            IS_DESKTOP && styles.desktopModalCard,
            {
              height: heightAnim,
              paddingBottom: (insets.bottom || 16) + 16,
            },
          ]}
        >
          {/* Top Drag & Header Area */}
          <View {...panResponder.panHandlers} style={styles.topBar}>
            {!IS_DESKTOP && <View style={styles.handle} />}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.title}>Çalma Listesine Ekle</Text>
                <Text style={styles.songSub} numberOfLines={1}>
                  {addToPlaylistSong.title} • {addToPlaylistSong.artist}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={closeAddToPlaylist}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* New Playlist Creator Form */}
          {isCreatingNew ? (
            <View style={styles.createBox}>
              <Text style={styles.createBoxTitle}>Yeni Çalma Listesi Adı</Text>
              <TextInput
                style={styles.input}
                placeholder="Örn: Yol Şarkıları, Favoriler..."
                placeholderTextColor={Colors.textMuted}
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                autoFocus
                maxLength={40}
              />
              <View style={styles.createActions}>
                <TouchableOpacity
                  style={styles.cancelCreateBtn}
                  onPress={() => {
                    setIsCreatingNew(false);
                    setNewPlaylistName('');
                  }}
                >
                  <Text style={styles.cancelCreateText}>İptal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.submitCreateBtn}
                  onPress={handleCreateAndAdd}
                >
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.submitCreateText}>Oluştur & Ekle</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.newPlaylistBtn}
              activeOpacity={0.8}
              onPress={() => setIsCreatingNew(true)}
            >
              <View style={styles.newPlaylistIconWrapper}>
                <Ionicons name="add" size={24} color={Colors.primary} />
              </View>
              <View style={styles.newPlaylistTextWrapper}>
                <Text style={styles.newPlaylistText}>Yeni Çalma Listesi Oluştur</Text>
                <Text style={styles.newPlaylistSub}>Özel liste ve kapak</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* List of Existing Playlists */}
          <Text style={styles.listSectionLabel}>ÇALMA LİSTELERİNİZ ({playlists.length})</Text>

          {playlists.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="musical-notes-outline" size={36} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>Henüz bir çalma listeniz yok.</Text>
            </View>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id}
              style={styles.playlistList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isInThisPlaylist = item.tracks.some(
                  (t) => t.id === addToPlaylistSong.id
                );
                return (
                  <TouchableOpacity
                    style={[
                      styles.playlistRow,
                      isInThisPlaylist && styles.playlistRowActive,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => handleTogglePlaylist(item)}
                  >
                    <PlaylistCollageThumb playlist={item} size={46} borderRadius={10} />

                    <View style={styles.playlistMeta}>
                      <Text style={styles.playlistName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.playlistCount}>
                        {item.tracks.length} parça
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.checkCircle,
                        isInThisPlaylist && styles.checkCircleActive,
                      ]}
                    >
                      {isInThisPlaylist && (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: IS_DESKTOP ? 'center' : 'flex-end',
    alignItems: IS_DESKTOP ? 'center' : 'stretch',
  },
  backdropTouch: {
    ...StyleSheet.absoluteFill,
  },
  modalCard: {
    backgroundColor: '#161618',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  desktopModalCard: {
    width: 560,
    borderRadius: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 20,
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
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  songSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPlaylistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 18,
  },
  newPlaylistIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  newPlaylistTextWrapper: {
    flex: 1,
  },
  newPlaylistText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  newPlaylistSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  createBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
    marginBottom: 18,
  },
  createBoxTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0B0B0B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 12,
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelCreateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cancelCreateText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  submitCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  submitCreateText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  listSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 8,
  },
  playlistList: {
    maxHeight: 280,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 6,
  },
  playlistRowActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.08)',
  },
  playlistCover: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.card,
  },
  placeholderCover: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistMeta: {
    flex: 1,
    marginLeft: 12,
  },
  playlistName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  playlistCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
});

