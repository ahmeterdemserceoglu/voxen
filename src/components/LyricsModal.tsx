import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMusicStore } from '../store/musicStore';
import { useUiStore } from '../store/uiStore';
import { lyricsService, Lyrics, LyricsLine } from '../services/lyrics/lyricsService';
import { Colors } from '../constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export const LyricsModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeModal, closeModal } = useUiStore();
  const isOpen = activeModal === 'lyrics';

  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = SCREEN_HEIGHT * 0.78;
  const fullHeight = SCREEN_HEIGHT * 0.94;
  const heightAnim = useRef(new Animated.Value(defaultHeight)).current;

  const scrollRef = useRef<ScrollView>(null);
  const lineLayouts = useRef<{ [key: number]: number }>({});
  const [containerHeight, setContainerHeight] = useState(0);
  const isUserScrolling = useRef(false);
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsFullScreen(false);
      heightAnim.setValue(defaultHeight);
      isUserScrolling.current = false;
      lineLayouts.current = {};
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

  const { currentTrack, position, seekTo } = useMusicStore();
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentTrack) return;

    let isMounted = true;
    setIsLoading(true);
    setLyrics(null);
    lineLayouts.current = {};

    const artist = currentTrack.artist || currentTrack.artistName || '';
    lyricsService
      .getLyrics(currentTrack.id, currentTrack.title, artist)
      .then((data) => {
        if (isMounted) {
          setLyrics(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentTrack?.id]);

  const currentSeconds = position / 1000;

  // Compute active line index for synchronized lyrics
  const activeIndex = useMemo(() => {
    if (!lyrics?.synced || !lyrics.lines.length) return -1;
    for (let i = lyrics.lines.length - 1; i >= 0; i--) {
      const t = lyrics.lines[i].time;
      if (t !== undefined && currentSeconds >= t - 0.25) {
        return i;
      }
    }
    return -1;
  }, [lyrics, currentSeconds]);

  // Auto-scroll when active line changes and user isn't manually scrolling
  useEffect(() => {
    if (activeIndex < 0 || !lyrics?.synced || isUserScrolling.current) return;
    const targetY = lineLayouts.current[activeIndex];
    if (targetY !== undefined && scrollRef.current && containerHeight > 0) {
      const centeredY = Math.max(0, targetY - containerHeight / 2 + 40);
      scrollRef.current.scrollTo({ y: centeredY, animated: true });
    }
  }, [activeIndex, lyrics?.synced, containerHeight]);

  const handleLinePress = (line: LyricsLine, idx: number) => {
    if (line.time !== undefined) {
      isUserScrolling.current = false;
      seekTo(line.time * 1000);
      const targetY = lineLayouts.current[idx];
      if (targetY !== undefined && scrollRef.current && containerHeight > 0) {
        const centeredY = Math.max(0, targetY - containerHeight / 2 + 40);
        scrollRef.current.scrollTo({ y: centeredY, animated: true });
      }
    }
  };

  const handleScrollBeginDrag = () => {
    isUserScrolling.current = true;
    if (userScrollTimeout.current) {
      clearTimeout(userScrollTimeout.current);
    }
  };

  const handleScrollEndDrag = () => {
    if (userScrollTimeout.current) clearTimeout(userScrollTimeout.current);
    userScrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 3000);
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
          {/* Top Drag Handle */}
          <View {...panResponder.panHandlers} style={styles.topBar}>
            <View style={styles.handle} />
          </View>

          {/* Header Bar */}
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <View style={styles.titleRow}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {currentTrack?.title || 'Şarkı Sözleri'}
                </Text>
              </View>
              <View style={styles.subHeaderRow}>
                <Text style={styles.headerArtist} numberOfLines={1}>
                  {currentTrack?.artist || currentTrack?.artistName || ''}
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => toggleFullScreen(!isFullScreen)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={isFullScreen ? 'contract-outline' : 'expand-outline'}
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={closeModal}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Body */}
          <View
            style={styles.body}
            onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
          >
            {isLoading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Şarkı sözleri aranıyor...</Text>
              </View>
            ) : !lyrics || lyrics.lines.length === 0 ? (
              <View style={styles.centerContainer}>
                <Ionicons name="mic-off-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Bu şarkı için söz bulunamadı</Text>
                <Text style={styles.emptyDesc}>
                  Şarkı sözleri henüz veritabanında yer almıyor olabilir.
                </Text>
              </View>
            ) : (
              <ScrollView
                ref={scrollRef}
                style={styles.lyricsScroll}
                contentContainerStyle={styles.lyricsContent}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScrollEndDrag={handleScrollEndDrag}
                onMomentumScrollEnd={handleScrollEndDrag}
              >
                {!lyrics.synced && (
                  <Text style={styles.unsyncedNotice}>Bu şarkının sözleri senkronize değil</Text>
                )}
                {lyrics.lines.map((line, idx) => {
                  const isActive = lyrics.synced && idx === activeIndex;
                  const isPast = lyrics.synced && idx < activeIndex;

                  return (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={line.time !== undefined ? 0.7 : 1}
                      disabled={line.time === undefined}
                      onPress={() => handleLinePress(line, idx)}
                      onLayout={(e) => {
                        lineLayouts.current[idx] = e.nativeEvent.layout.y;
                      }}
                      style={[
                        styles.lineWrapper,
                        isActive && styles.activeLineWrapper,
                      ]}
                    >
                      {isActive && <View style={styles.activePillIndicator} />}
                      <Text
                        style={[
                          styles.lyricsLine,
                          lyrics.synced
                            ? isActive
                              ? styles.activeLine
                              : isPast
                              ? styles.pastLine
                              : styles.futureLine
                            : styles.plainLine,
                        ]}
                      >
                        {line.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                <View style={styles.sourceFooter}>
                  <Text style={styles.sourceTag}>
                    {lyrics.synced ? 'Senkronize Sözler' : 'Düz Metin Sözler'} • Kaynak:{' '}
                    {lyrics.source.toUpperCase()}
                  </Text>
                  {lyrics.synced && (
                    <Text style={styles.tipText}>
                      İpucu: İstediğin satıra dokunarak şarkıyı o kısma atlatabilirsin.
                    </Text>
                  )}
                </View>
              </ScrollView>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: '#0E0E12',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  topBar: {
    paddingTop: 10,
    paddingBottom: 4,
    width: '100%',
    alignItems: 'center',
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTextWrap: {
    flex: 1,
    marginRight: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  headerArtist: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
    flexShrink: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  lyricsScroll: {
    flex: 1,
    paddingHorizontal: 22,
  },
  lyricsContent: {
    paddingVertical: 36,
  },
  unsyncedNotice: {
    marginBottom: 14,
    color: 'rgba(255, 255, 255, 0.42)',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  lineWrapper: {
    position: 'relative',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginVertical: 2,
  },
  activeLineWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  activePillIndicator: {
    position: 'absolute',
    left: 0,
    top: '25%',
    bottom: '25%',
    width: 3.5,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  lyricsLine: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 34,
  },
  activeLine: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  pastLine: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 21,
    fontWeight: '600',
  },
  futureLine: {
    color: 'rgba(255, 255, 255, 0.28)',
    fontSize: 21,
    fontWeight: '600',
  },
  plainLine: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 32,
  },
  sourceFooter: {
    marginTop: 48,
    marginBottom: 20,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  sourceTag: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.35)',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  tipText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.25)',
    marginTop: 6,
    textAlign: 'center',
  },
});


