import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import { useMusicStore } from '../store/musicStore';
import { useUiStore } from '../store/uiStore';
import type { Track } from '../models';

const ROW_HEIGHT = 76;
const duration = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const cover = (track: Track) => track.thumbnail || track.thumbnails?.large || track.thumbnails?.medium || '';

function QueueRow({ track, index, first, last, onPlay, onMove, onNext, onRemove, onDrag, onGesture }: {
  track: Track; index: number; first: number; last: number;
  onPlay: () => void; onMove: (from: number, to: number) => void;
  onNext: () => void; onRemove: () => void; onDrag: (active: boolean, update?: (delta: number) => void) => void; onGesture: (y: number) => number;
}) {
  const colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const translation = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const gestureDy = useRef(0);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { gestureDy.current = 0; setDragging(true); onDrag(true, delta => translation.setValue(Math.max((first - index) * ROW_HEIGHT, Math.min((last - index) * ROW_HEIGHT, gestureDy.current + delta)))); },
    onPanResponderMove: (_, gesture) => { gestureDy.current = gesture.dy; translation.setValue(Math.max((first - index) * ROW_HEIGHT, Math.min((last - index) * ROW_HEIGHT, gesture.dy + onGesture(gesture.moveY)))); },
    onPanResponderRelease: (_, gesture) => {
      const delta = onGesture(gesture.moveY);
      translation.setValue(0); setDragging(false); onDrag(false);
      onMove(index, Math.max(first, Math.min(last, index + Math.round((gesture.dy + delta) / ROW_HEIGHT))));
    },
    onPanResponderTerminate: () => { translation.setValue(0); setDragging(false); onDrag(false); },
  }), [index, first, last, onMove, onDrag, onGesture, translation]);
  const actions = () => Alert.alert(track.title, 'Çalma sırasını düzenle', [
    { text: 'Sıradaki yap', onPress: onNext },
    ...(index > first ? [{ text: 'Yukarı taşı', onPress: () => onMove(index, index - 1) }] : []),
    ...(index < last ? [{ text: 'Aşağı taşı', onPress: () => onMove(index, index + 1) }] : []),
    { text: 'Sıradan kaldır', style: 'destructive' as const, onPress: onRemove },
    { text: 'Vazgeç', style: 'cancel' as const },
  ]);
  return <Animated.View style={[styles.row, dragging && styles.dragging, { transform: [{ translateY: translation }], zIndex: dragging ? 10 : 0 }]}>
    <TouchableOpacity style={styles.song} onPress={onPlay} onLongPress={actions} accessibilityLabel={`${track.title}, şimdi oynat`}>
      <Image source={{ uri: cover(track) }} style={styles.thumb} contentFit="cover" />
      <View style={styles.info}><Text style={styles.rowTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.artist} numberOfLines={1}>{track.artist || track.artistName}</Text></View>
      {track.duration ? <Text style={styles.time}>{duration(track.duration)}</Text> : null}
    </TouchableOpacity>
    <TouchableOpacity onPress={actions} style={styles.iconButton} accessibilityLabel={`${track.title} seçenekleri`}><Ionicons name="ellipsis-vertical" size={17} color={colors.textMuted} /></TouchableOpacity>
    <View {...responder.panHandlers} style={styles.dragHandle} accessible accessibilityRole="adjustable" accessibilityLabel={`${track.title}, sıralamak için sürükle`}
      accessibilityActions={[{ name: 'increment', label: 'Aşağı taşı' }, { name: 'decrement', label: 'Yukarı taşı' }]}
      onAccessibilityAction={event => onMove(index, Math.max(first, Math.min(last, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
      <Ionicons name="reorder-three" size={24} color={colors.textMuted} />
    </View>
  </Animated.View>;
}

export const QueueModal: React.FC = () => {
  const colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { activeModal, closeModal } = useUiStore();
  const open = activeModal === 'queue';
  const { currentTrack, queue, queueIndex, isPlaying, playTrack, togglePlayPause, removeFromQueue, moveQueueItem, playNext, clearQueue, shuffle, toggleShuffle, repeatMode, setRepeatMode, queueUndo, undoQueueRemoval } = useMusicStore();
  useEffect(() => {
    if (!queueUndo) return;
    const timer = setTimeout(() => {
      if (useMusicStore.getState().queueUndo === queueUndo) useMusicStore.setState({ queueUndo: null });
    }, Math.max(0, queueUndo.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [queueUndo]);
  const [expanded, setExpanded] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [dragging, setDragging] = useState(false);
  const listRef = useRef<FlatList<Track>>(null);
  const activeDragUpdate = useRef<((delta: number) => void) | undefined>(undefined);
  const scroll = useRef({ offset: 0, start: 0, top: 0, height: 0, content: 0, direction: 0, dragging: false });
  const dragState = useCallback((active: boolean, update?: (delta: number) => void) => {
    activeDragUpdate.current = active ? update : undefined;
    scroll.current.dragging = active; scroll.current.direction = 0;
    if (active) {
      scroll.current.start = scroll.current.offset;
      const view = listRef.current?.getNativeScrollRef?.() as any;
      view?.measureInWindow?.((_x: number, y: number) => { scroll.current.top = y; });
    }
    setDragging(active);
  }, []);
  const dragGesture = useCallback((y: number) => {
    const s = scroll.current;
    s.direction = Number.isFinite(y) ? (y < s.top + 64 ? -1 : y > s.top + s.height - 64 ? 1 : 0) : 0;
    return s.offset - s.start;
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      const s = scroll.current;
      if (!open || !s.dragging || !s.direction) return;
      const offset = Math.max(0, Math.min(Math.max(0, s.content - s.height), s.offset + s.direction * 12));
      if (offset !== s.offset) { s.offset = offset; listRef.current?.scrollToOffset({ offset, animated: false }); activeDragUpdate.current?.(offset - s.start); }
    }, 40);
    return () => { clearInterval(timer); scroll.current.dragging = false; };
  }, [open]);
  const expandedRef = useRef(expanded); expandedRef.current = expanded;
  const heights = useRef({ normal: height * .76, full: height - insets.top });
  heights.current = { normal: height * .76, full: height - insets.top };
  const sheetHeight = useRef(new Animated.Value(heights.current.normal)).current;
  const expand = (value: boolean) => { setExpanded(value); Animated.spring(sheetHeight, { toValue: value ? heights.current.full : heights.current.normal, useNativeDriver: false, friction: 9 }).start(); };
  useEffect(() => { if (open) { setExpanded(false); setShowPast(false); sheetHeight.setValue(heights.current.normal); } }, [open, height]);
  const headerDrag = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8,
    onPanResponderRelease: (_, gesture) => { if (gesture.dy < -30) expand(true); else if (gesture.dy > 60) expandedRef.current ? expand(false) : closeModal(); },
  })).current;
  const upcoming = queue.slice(currentTrack ? queueIndex + 1 : 0);
  const past = currentTrack ? queue.slice(0, queueIndex) : [];
  const remainingSeconds = upcoming.reduce((sum, track) => sum + (track.duration || 0), 0);
  const repeatLabel = repeatMode === 'one' ? 'Tek şarkı' : repeatMode === 'all' ? 'Sırayı tekrarla' : 'Tekrar kapalı';
  const clear = () => Alert.alert('Sıradakileri temizle', 'Çalan şarkı ve kaldığın süre korunacak.', [
    { text: 'Vazgeç', style: 'cancel' }, { text: 'Temizle', style: 'destructive', onPress: clearQueue },
  ]);
  const header = <View>
    <View {...headerDrag.panHandlers} style={styles.gripArea}><View style={styles.grip} /></View>
    <View style={styles.header}><View style={styles.info}><Text style={styles.heading}>Çalma sırası</Text><Text style={styles.artist}>{upcoming.length} şarkı sırada{remainingSeconds ? ` · ${Math.ceil(remainingSeconds / 60)} dk` : ''}</Text></View>
      <TouchableOpacity style={styles.iconButton} onPress={closeModal} accessibilityLabel="Çalma sırasını kapat"><Ionicons name="close" size={23} color={colors.text} /></TouchableOpacity>
    </View>
    {currentTrack && <View style={styles.current}>
      <Text style={styles.eyebrow}>{isPlaying ? 'ŞİMDİ ÇALIYOR' : 'DURAKLATILDI'}</Text>
      <View style={styles.currentBody}><Image source={{ uri: cover(currentTrack) }} style={styles.currentCover} contentFit="cover" /><View style={styles.info}><Text style={styles.currentTitle} numberOfLines={2}>{currentTrack.title}</Text><Text style={styles.artist} numberOfLines={1}>{currentTrack.artist || currentTrack.artistName}</Text></View>
        <TouchableOpacity style={styles.play} onPress={togglePlayPause} accessibilityLabel={isPlaying ? 'Duraklat' : 'Oynat'}><Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.text} /></TouchableOpacity>
      </View>
    </View>}
    <View style={styles.modes}>
      <TouchableOpacity style={[styles.pill, shuffle && styles.activePill]} onPress={toggleShuffle} accessibilityLabel="Karışık çalma"><Ionicons name="shuffle" size={17} color={shuffle ? colors.primary : colors.textMuted} /><Text style={[styles.pillText, shuffle && { color: colors.primary }]}>Karışık</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.pill, repeatMode !== 'off' && styles.activePill]} onPress={() => setRepeatMode(repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off')}><Ionicons name="repeat" size={17} color={repeatMode === 'off' ? colors.textMuted : colors.primary} /><Text style={styles.pillText}>{repeatLabel}</Text></TouchableOpacity>
    </View>
    {queueUndo && <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}><Text style={[styles.artist, { flex: 1 }]} numberOfLines={1}>{queueUndo.track.title} kaldırıldı</Text><TouchableOpacity accessibilityLabel="Kaldırılan şarkıyı geri al" onPress={undoQueueRemoval}><Text style={styles.clear}>Geri al</Text></TouchableOpacity></View>}
    <View style={styles.section}><Text style={styles.sectionTitle}>Sıradaki</Text>{upcoming.length > 0 && <TouchableOpacity onPress={clear}><Text style={styles.clear}>Temizle</Text></TouchableOpacity>}</View>
    {upcoming.length > 1 && <Text style={styles.hint}>Sağdaki tutamaçtan sürükleyerek sırala</Text>}
  </View>;
  return <Modal visible={open} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={closeModal}>
    <View style={styles.overlay}><TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeModal} />
      <Animated.View style={[styles.sheet, { height: sheetHeight, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <FlatList ref={listRef} onLayout={event => { scroll.current.height = event.nativeEvent.layout.height; }} onContentSizeChange={(_w, h) => { scroll.current.content = h; }} onScroll={event => { scroll.current.offset = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} data={upcoming} keyExtractor={track => track.id} ListHeaderComponent={header} scrollEnabled={!dragging} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}
          renderItem={({ item, index }) => { const actual = (currentTrack ? queueIndex + 1 : 0) + index; return <QueueRow track={item} index={actual} first={currentTrack ? queueIndex + 1 : 0} last={queue.length - 1} onPlay={() => { void playTrack(item, queue); }} onMove={moveQueueItem} onNext={() => playNext(item)} onRemove={() => removeFromQueue(item.id)} onDrag={dragState} onGesture={dragGesture} />; }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="list-outline" size={35} color={colors.textMuted} /><Text style={styles.emptyTitle}>Sıradaki şarkıyı sen seç</Text><Text style={styles.hint}>Şarkı menüsünden “Sıraya ekle” veya “Sıradaki çal” seçeneğini kullan.</Text></View>}
          ListFooterComponent={past.length ? <View><TouchableOpacity style={styles.historyHeader} onPress={() => setShowPast(!showPast)}><Text style={styles.artist}>Önce çalanlar · {past.length}</Text><Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} /></TouchableOpacity>{showPast && past.map(track => <TouchableOpacity key={track.id} style={styles.pastRow} onPress={() => { void playTrack(track, queue); }}><Text style={styles.artist} numberOfLines={1}>{track.title}</Text></TouchableOpacity>)}</View> : null} />
      </Animated.View>
    </View>
  </Modal>;
};

const createStyles = (c: Palette) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.4)' },
  sheet: { backgroundColor: c.background, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
  list: { paddingHorizontal: 18, paddingBottom: 20 },
  gripArea: { height: 28, justifyContent: 'center', alignItems: 'center' },
  grip: { width: 40, height: 4, borderRadius: 3, backgroundColor: c.borderLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 18 },
  heading: { fontSize: 25, fontWeight: '800', color: c.text, marginBottom: 4 },
  info: { flex: 1, minWidth: 0 },
  artist: { fontSize: 12, color: c.textMuted, marginTop: 4 },
  current: { backgroundColor: c.surfaceElevated, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.border },
  eyebrow: { fontSize: 10, letterSpacing: 1.8, fontWeight: '700', color: c.primary, marginBottom: 13 },
  currentBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  currentCover: { width: 64, height: 64, borderRadius: 14 },
  currentTitle: { fontSize: 16, fontWeight: '700', color: c.text },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center' },
  modes: { flexDirection: 'row', gap: 8, marginVertical: 18, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', gap: 7, alignItems: 'center', borderRadius: 20, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 10 },
  activePill: { backgroundColor: c.accentMuted },
  pillText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: c.text },
  clear: { fontSize: 12, color: c.textMuted, padding: 8 },
  hint: { fontSize: 11, lineHeight: 17, color: c.textMuted, marginBottom: 10 },
  row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', borderRadius: 16, backgroundColor: c.background },
  dragging: { backgroundColor: c.surfaceHighlight, elevation: 12, shadowColor: '#000', shadowRadius: 12, shadowOpacity: .3, shadowOffset: { width: 0, height: 4 } },
  song: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  thumb: { width: 48, height: 48, borderRadius: 12 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  time: { fontSize: 10, color: c.textMuted, marginLeft: 4 },
  iconButton: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  dragHandle: { width: 32, height: 52, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 15 },
  emptyTitle: { color: c.text, fontWeight: '600', fontSize: 15, marginVertical: 12 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, borderTopWidth: 1, borderColor: c.border, marginTop: 14 },
  pastRow: { paddingVertical: 12, opacity: .6 },
});
