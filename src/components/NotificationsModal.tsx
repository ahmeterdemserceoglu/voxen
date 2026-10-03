import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  PanResponder,
  Animated,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSocialStore } from '../store/socialStore';
import { useUiStore } from '../store/uiStore';
import { Colors } from '../constants/theme';
import type { AppNotification } from '../models';

const IS_DESKTOP = Platform.OS === 'web' && process.env.EXPO_PUBLIC_VOXEN_DESKTOP === '1';

export const NotificationsModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { activeModal, closeModal } = useUiStore();
  const isOpen = activeModal === 'notifications';

  const { notifications, markAllRead, markRead } = useSocialStore();

  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = IS_DESKTOP ? Math.min(640, windowHeight * 0.8) : windowHeight * 0.70;
  const fullHeight = IS_DESKTOP ? Math.min(760, windowHeight * 0.9) : windowHeight * 0.94;
  const heightAnim = useRef(new Animated.Value(defaultHeight)).current;
  const toggleFullScreenRef = useRef<(toFull: boolean) => void>(() => {});

  useEffect(() => {
    if (isOpen) {
      setIsFullScreen(false);
      heightAnim.setValue(defaultHeight);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) heightAnim.setValue(fullScreenRef.current ? fullHeight : defaultHeight);
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
            closeModal();
          }
        }
      },
    })
  ).current;

  const renderItem = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={[styles.item, !item.read && styles.itemUnread]}
      activeOpacity={0.7}
      onPress={() => markRead(item.id)}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={item.type === 'NEW_FOLLOWER' ? 'person-add' : 'musical-note'}
          size={20}
          color={Colors.primary}
        />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemBody}>{item.body}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

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
        <Animated.View style={[styles.sheet, IS_DESKTOP && styles.desktopSheet, { height: heightAnim }]}>
          {/* Top Drag & Header Area */}
          <View {...panResponder.panHandlers} style={styles.topBar}>
            {!IS_DESKTOP && <View style={styles.handle} />}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Bildirimler</Text>
                <Text style={styles.headerSub}>Müzik ve sosyal etkileşimler</Text>
              </View>

              <View style={styles.headerActions}>
                {notifications.length > 0 && (
                  <TouchableOpacity onPress={markAllRead}>
                    <Text style={styles.readAllText}>Tümünü Oku</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.closeBtn} onPress={closeModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={18} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* List */}
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="notifications-off-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Henüz bildiriminiz yok</Text>
                <Text style={styles.emptyDesc}>
                  Yeni müzik önerileri ve çalma listesi paylaşımları burada görünecektir.
                </Text>
              </View>
            }
          />
        </Animated.View>
      </View>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: IS_DESKTOP ? 'center' : 'flex-end',
    alignItems: IS_DESKTOP ? 'center' : 'stretch',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  desktopSheet: {
    width: 580,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  readAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 8,
  },
  itemUnread: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  itemBody: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginLeft: 8,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 14,
  },
  emptyDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
});

