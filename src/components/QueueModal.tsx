import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  Alert,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useMusicStore } from '../store/musicStore';
import { useUiStore } from '../store/uiStore';
import { Colors } from '../constants/theme';
import type { Track } from '../models';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export const QueueModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeModal, closeModal } = useUiStore();
  const isOpen = activeModal === 'queue';

  const {
    currentTrack,
    queue,
    queueIndex,
    playTrack,
    removeFromQueue,
    clearQueue,
    isPlaying,
  } = useMusicStore();

  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = SCREEN_HEIGHT * 0.72;
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
        // dy < -30: explicitly swiped UP -> ALWAYS expand to fullscreen, NEVER close!
        if (gestureState.dy < -30) {
          toggleFullScreen(true);
        } else if (gestureState.dy > 60) {
          // dy > 60: explicitly swiped DOWN
          if (fullScreenRef.current) {
            toggleFullScreen(false);
          } else {
            closeModal();
          }
        }
      },
    })
  ).current;

  const handleClearQueue = () => {
    Alert.alert(
      'Sırayı Temizle',
      'Şu an çalan şarkı hariç sıradaki tüm parçalar kaldırılsın mı?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: () => clearQueue(),
        },
      ]
    );
  };

  const renderQueueItem = ({ item, index }: { item: Track; index: number }) => {
    const isCurrent = index === queueIndex;
    const isPast = index < queueIndex;
    const thumbUrl = item.thumbnail || item.thumbnails?.medium || '';

    return (
      <TouchableOpacity
        style={[
          styles.trackRow,
          isCurrent && styles.trackRowActive,
          isPast && styles.trackRowPast,
        ]}
        activeOpacity={0.7}
        onPress={() => playTrack(item, queue)}
      >
        <Text style={[styles.indexNum, isCurrent && styles.indexNumActive]}>
          {index + 1}
        </Text>

        <Image source={{ uri: thumbUrl }} style={styles.thumbnail} contentFit="cover" />

        <View style={styles.info}>
          <Text style={[styles.title, isCurrent && styles.titleActive]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {item.artist || item.artistName}
          </Text>
        </View>

        {isCurrent ? (
          <View style={styles.playingIndicator}>
            <Ionicons
              name={isPlaying ? 'volume-high' : 'pause'}
              size={18}
              color={Colors.primary}
            />
          </View>
        ) : (
          <TouchableOpacity
            style={styles.removeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => removeFromQueue(item.id)}
          >
            <Ionicons name="close" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
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
          {/* Top Drag & Header Area (Touch anywhere here to drag/swipe) */}
          <View {...panResponder.panHandlers} style={styles.topBar}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Çalma Sırası</Text>
                <Text style={styles.headerSub}>
                  Toplam {queue.length} parça • {queueIndex + 1}. sırada
                </Text>
              </View>

              <View style={styles.headerActions}>
                {queue.length > 1 && (
                  <TouchableOpacity style={styles.clearBtn} onPress={handleClearQueue}>
                    <Text style={styles.clearBtnText}>Temizle</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Queue List */}
          <FlatList
            data={queue}
            keyExtractor={(item, idx) => `${item.id}_${idx}`}
            renderItem={renderQueueItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="musical-notes-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Çalma sırası boş</Text>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
    fontWeight: '700',
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
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  clearBtnText: {
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
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  trackRowActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
  },
  trackRowPast: {
    opacity: 0.5,
  },
  indexNum: {
    width: 24,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
    marginRight: 10,
  },
  indexNumActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  titleActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  artist: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  playingIndicator: {
    paddingHorizontal: 8,
  },
  removeBtn: {
    padding: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 10,
  },
});

