import { listeningRoomService } from '../services/social/listeningRoomService';
import { accountSession } from '../services/auth/accountStorage';
import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUiStore } from '../store/uiStore';
import { useMusicStore } from '../store/musicStore';
import { useAuthStore } from '../store/authStore';
import { useSocialStore } from '../store/socialStore';
import { Colors } from '../constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export const ListeningRoomModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeModal, closeModal } = useUiStore();
  const isOpen = activeModal === 'listeningRoom';

  const { currentTrack, isPlaying } = useMusicStore();
  const { user } = useAuthStore();
  const { activeRoom, roomHostUid, roomError, setActiveRoom } = useSocialStore();

  const [roomCode, setRoomCode] = useState('');
  const [busy, setBusy] = useState(false);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = SCREEN_HEIGHT * 0.70;
  const fullHeight = SCREEN_HEIGHT * 0.94;
  const heightAnim = useRef(new Animated.Value(defaultHeight)).current;

  useEffect(() => {
    if (isOpen) {
      setIsFullScreen(false);
      heightAnim.setValue(defaultHeight);
    }
  }, [isOpen]);

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
            closeModal();
          }
        }
      },
    })
  ).current;

  const changeRoom = async (create: boolean) => {
    if (!user) { Alert.alert('Giriş gerekli', 'Birlikte dinlemek için hesabınıza giriş yapın.'); return; }
    if (busy) return;
    const epoch = accountSession.generation;
    setBusy(true);
    try {
      const code = create ? await listeningRoomService.create(user.uid) : roomCode.trim().toUpperCase();
      const room = await listeningRoomService.join(code);
      if (!accountSession.isCurrent(epoch)) return;
      useSocialStore.setState({ activeRoom: code, roomHostUid: room.hostUid, roomError: null });
    } catch (error) {
      if (accountSession.isCurrent(epoch)) Alert.alert('Odaya bağlanılamadı', error instanceof Error ? error.message : 'Yeniden deneyin.');
    } finally { setBusy(false); }
  };
  const handleCreateRoom = () => changeRoom(true);
  const handleJoinRoom = () => changeRoom(false);
  const handleLeaveRoom = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (activeRoom && roomHostUid === user?.uid) await listeningRoomService.close(activeRoom);
      setActiveRoom(null);
      setRoomCode('');
    } catch { Alert.alert('Oda kapatılamadı', 'Bağlantınızı kontrol edip yeniden deneyin.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={closeModal}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={closeModal}
        />
        <Animated.View style={[styles.sheet, { height: heightAnim }]}>
          {/* Top Drag & Header Area */}
          <View {...panResponder.panHandlers} style={styles.topBar}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Birlikte Dinleme</Text>
                <Text style={styles.headerSub}>Müziği arkadaşlarınızla gerçek zamanlı paylaşın</Text>
              </View>
            </View>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {busy && <Text style={{ color: Colors.text }}>Bağlanıyor…</Text>}
            {roomError && <Text style={{ color: Colors.error }}>{roomError}</Text>}
            {activeRoom ? (
              <View style={styles.activeRoomCard}>
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>ODA BAĞLANTISI</Text>
                </View>

                <Text style={styles.roomCodeLabel}>Oda Kodu</Text>
                <Text style={styles.roomCodeText}>{activeRoom}</Text>

                <View style={styles.nowSyncingCard}>
                  <Ionicons name="musical-note" size={20} color={Colors.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.syncTrackTitle} numberOfLines={1}>
                      {currentTrack?.title || 'Şarkı seçilmedi'}
                    </Text>
                    <Text style={styles.syncTrackArtist} numberOfLines={1}>
                      {currentTrack?.artist || currentTrack?.artistName || 'Ev sahibi bekliyor'}
                    </Text>
                  </View>
                  <Ionicons
                    name={isPlaying ? 'volume-high' : 'pause'}
                    size={18}
                    color={Colors.textMuted}
                  />
                </View>

                <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveRoom}>
                  <Text style={styles.leaveBtnText}>Odadan Ayrıl</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {/* Create Room Card */}
                <View style={styles.actionCard}>
                  <Ionicons name="radio-outline" size={32} color={Colors.primary} />
                  <Text style={styles.cardTitle}>Yeni Oda Başlat</Text>
                  <Text style={styles.cardDesc}>
                    Ev sahibi olarak şarkı seçimini siz yönetin, arkadaşlarınız anında dinlesin.
                  </Text>
                  <TouchableOpacity style={styles.createBtn} onPress={handleCreateRoom}>
                    <Text style={styles.createBtnText}>Oda Oluştur</Text>
                  </TouchableOpacity>
                </View>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>VEYA</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Join Room */}
                <View style={styles.joinContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="6 Haneli Oda Kodu Girin"
                    placeholderTextColor={Colors.textMuted}
                    value={roomCode}
                    onChangeText={setRoomCode}
                    autoCapitalize="characters"
                    maxLength={6}
                  />
                  <TouchableOpacity style={styles.joinBtn} onPress={handleJoinRoom}>
                    <Text style={styles.joinBtnText}>Katıl</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
  },
  actionCard: {
    backgroundColor: Colors.surfaceElevated,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    textAlign: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 10,
  },
  cardDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  createBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    marginHorizontal: 12,
  },
  joinContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  joinBtn: {
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: 12,
  },
  joinBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  activeRoomCard: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.success,
    letterSpacing: 0.5,
  },
  roomCodeLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  roomCodeText: {
    fontSize: 36,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 4,
    marginVertical: 4,
  },
  nowSyncingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    padding: 12,
    borderRadius: 12,
    width: '100%',
    marginTop: 16,
    marginBottom: 20,
  },
  syncTrackTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  syncTrackArtist: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  leaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  leaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
});

