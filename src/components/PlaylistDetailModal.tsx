import { BulkDownloadButton } from './BulkDownloadButton';
import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMusicStore } from '../store/musicStore';
import { PlaylistCollageThumb } from './PlaylistCollageThumb';
import { KeyboardAvoidModal } from './KeyboardAvoidModal';
import { TrackItem } from '../services/youtubeService';
import { Colors } from '../constants/theme';

const MAX_CONTENT_WIDTH = 760;
const MAX_HERO_WIDTH = 680;

interface TrackRowProps {
  item: TrackItem;
  index: number;
  isThisPlaying: boolean;
  isPlaying: boolean;
  onPlay: (item: TrackItem) => void;
  onMore: (item: TrackItem) => void;
}

const TrackRow = React.memo<TrackRowProps>(
  ({ item, index, isThisPlaying, isPlaying, onPlay, onMore }) => {
    const Colors = useThemeColors();
    const styles = useThemeStyles(createStyles);
    return (
      <View style={styles.trackOuter}>
        <TouchableOpacity
          style={[styles.trackRow, isThisPlaying && styles.trackRowActive]}
          activeOpacity={0.72}
          onPress={() => onPlay(item)}
        >
          <View style={styles.trackLeadingBox}>
            {isThisPlaying ? (
              <View style={styles.playingIndicator}>
                <Ionicons
                  name={isPlaying ? 'volume-high' : 'pause'}
                  size={15}
                  color={Colors.primary}
                />
              </View>
            ) : (
              <Text style={styles.trackIndex}>{index + 1}</Text>
            )}
          </View>

          <View style={styles.trackThumbWrapper}>
            <Image
              source={{ uri: item.thumbnail }}
              style={styles.trackThumb}
              contentFit="cover"
              transition={120}
            />

            {isThisPlaying && (
              <View style={styles.trackThumbOverlay}>
                <View style={styles.equalizerRow}>
                  <View style={[styles.equalizerBar, styles.equalizerBarSmall]} />
                  <View style={[styles.equalizerBar, styles.equalizerBarTall]} />
                  <View style={[styles.equalizerBar, styles.equalizerBarMid]} />
                </View>
              </View>
            )}
          </View>

          <View style={styles.trackMeta}>
            <Text
              style={[styles.trackTitle, isThisPlaying && styles.trackTitleActive]}
              numberOfLines={1}
            >
              {item.title}
            </Text>

            <View style={styles.trackSubtitleRow}>
              <Text style={styles.trackArtist} numberOfLines={1}>
                {item.artist || item.artistName || 'Bilinmeyen Sanatçı'}
              </Text>

              {!!item.durationFormatted && (
                <>
                  <View style={styles.metaDot} />
                  <Text style={styles.trackDurationText}>{item.durationFormatted}</Text>
                </>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.moreBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.65}
            onPress={() => onMore(item)}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={18}
              color={isThisPlaying ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.42)'}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  }
);

export const PlaylistDetailModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [filterQuery, setFilterQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [confirmNameInput, setConfirmNameInput] = useState('');
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');

  const {
    activePlaylistDetail,
    closePlaylistDetail,
    playTrack,
    currentTrack,
    isPlaying,
    deletePlaylist,
    renamePlaylist,
    openActionSheet,
  } = useMusicStore();

  const tracks = activePlaylistDetail?.tracks || [];
  const isLandscape = width > height;
  const isCompact = width < 380;
  const isWide = width >= 720;

  const pageSidePadding = useMemo(() => {
    if (width >= 1000) return 36;
    if (width >= 720) return 28;
    return 16;
  }, [width]);

  const coverSize = useMemo(() => {
    if (isLandscape) return Math.min(height * 0.46, width * 0.28, 270);
    if (width >= 720) return Math.min(width * 0.34, 300);
    return Math.min(width * 0.62, 262);
  }, [height, isLandscape, width]);

  const totalDurationSec = useMemo(
    () => tracks.reduce((acc, track) => acc + (track.duration || 0), 0),
    [tracks]
  );

  const formattedDuration = useMemo(() => {
    if (totalDurationSec <= 0) return null;
    const hours = Math.floor(totalDurationSec / 3600);
    const minutes = Math.floor((totalDurationSec % 3600) / 60);
    if (hours > 0) return `${hours} sa ${minutes} dk`;
    return `${minutes} dk`;
  }, [totalDurationSec]);

  const normalizedFilter = filterQuery.trim().toLocaleLowerCase('tr-TR');

  const displayedTracks = useMemo(() => {
    if (!normalizedFilter) return tracks;

    return tracks.filter((track) => {
      const title = (track.title || '').toLocaleLowerCase('tr-TR');
      const artist = (track.artist || track.artistName || '').toLocaleLowerCase('tr-TR');
      return title.includes(normalizedFilter) || artist.includes(normalizedFilter);
    });
  }, [normalizedFilter, tracks]);

  const defaultRowWidth = useMemo(
    () => Math.max(280, Math.min(width - (pageSidePadding * 2), MAX_HERO_WIDTH)),
    [width, pageSidePadding]
  );
  const [rowWidth, setRowWidth] = useState(defaultRowWidth);

  useEffect(() => {
    setRowWidth(defaultRowWidth);
  }, [defaultRowWidth]);

  const searchAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setShowSearch(false);
    setFilterQuery('');
    searchAnim.setValue(0);
  }, [activePlaylistDetail?.id]);

  const handlePlayTrack = useCallback(
    (item: TrackItem) => {
      playTrack(item, tracks);
    },
    [playTrack, tracks]
  );

  const handleMoreTrack = useCallback(
    (item: TrackItem) => {
      openActionSheet(item);
    },
    [openActionSheet]
  );

  const renderTrackItem = useCallback(
    ({ item, index }: { item: TrackItem; index: number }) => (
      <TrackRow
        item={item}
        index={index}
        isThisPlaying={currentTrack?.id === item.id}
        isPlaying={isPlaying}
        onPlay={handlePlayTrack}
        onMore={handleMoreTrack}
      />
    ),
    [currentTrack?.id, isPlaying, handlePlayTrack, handleMoreTrack]
  );

  if (!activePlaylistDetail) return null;

  const openSearch = () => {
    setShowSearch(true);
    Animated.timing(searchAnim, {
      toValue: 1,
      duration: 580,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start();
  };

  const closeSearch = () => {
    Keyboard.dismiss();
    Animated.timing(searchAnim, {
      toValue: 0,
      duration: 440,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start(() => {
      setShowSearch(false);
      setFilterQuery('');
    });
  };

  const handlePlayAll = () => {
    if (displayedTracks.length === 0) return;
    playTrack(displayedTracks[0], displayedTracks);
  };

  const handleShuffle = () => {
    if (displayedTracks.length === 0) return;

    const shuffled = [...displayedTracks];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    playTrack(shuffled[0], shuffled);
  };

  const handleShare = async () => {
    try {
      setIsMenuOpen(false);

      const trackNames = tracks
        .slice(0, 5)
        .map(
          (track, index) =>
            `${index + 1}. ${track.title} - ${track.artist || track.artistName || 'Bilinmeyen Sanatçı'}`
        )
        .join('\n');

      const message = `🎵 ${activePlaylistDetail.name} (${tracks.length} parça)\n\n${trackNames}${
        tracks.length > 5 ? '\n...' : ''
      }\n\nVoxen Müzik ile dinle!`;

      await Share.share({
        title: activePlaylistDetail.name,
        message,
      });
    } catch (error) {
      console.warn('Share error:', error);
    }
  };

  const handleStartRename = () => {
    setRenameInput(activePlaylistDetail.name);
    setIsMenuOpen(false);
    setIsRenameOpen(true);
  };

  const handleSaveRename = async () => {
    const trimmed = renameInput.trim();

    if (!trimmed) {
      Alert.alert('Uyarı', 'Çalma listesi adı boş bırakılamaz.');
      return;
    }

    await renamePlaylist(activePlaylistDetail.id, trimmed);
    setIsRenameOpen(false);
  };

  const handleOpenDeleteConfirm = () => {
    setIsMenuOpen(false);
    setConfirmNameInput('');
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    const confirmation = confirmNameInput.trim().toLocaleLowerCase('tr-TR');
    const playlistName = activePlaylistDetail.name.trim().toLocaleLowerCase('tr-TR');

    if (confirmation !== playlistName) {
      Alert.alert('Hata', 'Girdiğiniz isim çalma listesi adıyla eşleşmiyor.');
      return;
    }

    await deletePlaylist(activePlaylistDetail.id);
    setIsDeleteConfirmOpen(false);
    setConfirmNameInput('');
    closePlaylistDetail();
  };



  const renderHeroHeader = () => (
    <View
      style={[
        styles.heroSection,
        {
          paddingTop: insets.top + 70,
        },
      ]}
    >
      <View style={[styles.heroContent, isLandscape && styles.heroContentLandscape]}>
        <View
          style={[
            styles.coverStage,
            isLandscape && styles.coverStageLandscape,
            { width: coverSize, height: coverSize },
          ]}
        >
          <View
            style={[
              styles.coverGlow,
              {
                width: coverSize * 0.94,
                height: coverSize * 0.94,
                borderRadius: Math.max(24, coverSize * 0.16),
              },
            ]}
          />

          <View
            style={[
              styles.coverFrame,
              {
                width: coverSize,
                height: coverSize,
                borderRadius: Math.max(18, coverSize * 0.075),
              },
            ]}
          >
            <PlaylistCollageThumb
              playlist={activePlaylistDetail}
              size={coverSize}
              borderRadius={Math.max(18, coverSize * 0.075)}
            />

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0.34)']}
              locations={[0, 0.66, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>
        </View>

            
     


          <TouchableOpacity
            style={[styles.titleTouchZone, isLandscape && styles.titleTouchZoneLandscape]}
            activeOpacity={0.72}
            onPress={handleStartRename}
          >
            <Text
              style={[
                styles.playlistHeroTitle,
                isCompact && styles.playlistHeroTitleCompact,
                isWide && styles.playlistHeroTitleWide,
                isLandscape && styles.playlistHeroTitleLandscape,
              ]}
              numberOfLines={3}
            >
              {activePlaylistDetail.name}
            </Text>

       
          </TouchableOpacity>

          {!!activePlaylistDetail.description && (
            <Text
              style={[styles.descriptionText, isLandscape && styles.descriptionTextLandscape]}
              numberOfLines={isLandscape ? 3 : 2}
            >
              {activePlaylistDetail.description}
            </Text>
          )}

          <View style={[styles.playlistMetaRow, isLandscape && styles.playlistMetaRowLandscape]}>
            <View style={styles.brandAvatar}>
              <Text style={styles.brandAvatarText}>V</Text>
            </View>
         
            <Text style={styles.metaText}>{tracks.length} şarkı</Text>
            {!!formattedDuration && (
              <>
                <View style={styles.metaDotLarge} />
                <Text style={styles.metaText}>{formattedDuration}</Text>
              </>
            )}
          </View>

          <View
            style={styles.actionRowContainer}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - rowWidth) > 2) {
                setRowWidth(w);
              }
            }}
          >
            {/* Right Action Buttons (Shuffle & Play) */}
            <Animated.View
              pointerEvents={showSearch ? 'none' : 'auto'}
              style={[
                styles.actionDockRight,
                {
                  opacity: searchAnim.interpolate({
                    inputRange: [0, 0.3],
                    outputRange: [1, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      translateX: searchAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 16],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.shuffleButton,
                  displayedTracks.length === 0 && styles.buttonDisabled,
                ]}
                disabled={displayedTracks.length === 0}
                onPress={handleShuffle}
                activeOpacity={0.72}
              >
                <Ionicons name="shuffle" size={24} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.playButton,
                  displayedTracks.length === 0 && styles.buttonDisabled,
                ]}
                disabled={displayedTracks.length === 0}
                onPress={handlePlayAll}
                activeOpacity={0.84}
              >
                <Ionicons name="play" size={26} color="#FFFFFF" style={styles.playIcon} />
              </TouchableOpacity>
            </Animated.View>


            {/* Expanding Search Pill from Search Button */}
            <Animated.View
              style={[
                styles.searchPill,
                {
                  width: searchAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [46, Math.max(46, rowWidth - 8)],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            >
              <View style={styles.searchPillExpandedInner}>
                <View style={styles.searchPillIconBox}>
                  <Ionicons name="search" size={19} color="rgba(255,255,255,0.85)" />
                </View>

                <Animated.View
                  pointerEvents={showSearch ? 'auto' : 'none'}
                  style={[
                    styles.searchPillInputWrap,
                    {
                      opacity: searchAnim.interpolate({
                        inputRange: [0.42, 0.92],
                        outputRange: [0, 1],
                        extrapolate: 'clamp',
                      }),
                      transform: [
                        {
                          translateX: searchAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [18, 0],
                            extrapolate: 'clamp',
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <TextInput
                    style={styles.searchDockInput}
                    placeholder="Bu listede şarkı veya sanatçı ara..."
                    placeholderTextColor="rgba(255,255,255,0.38)"
                    value={filterQuery}
                    onChangeText={setFilterQuery}
                    autoFocus={false}
                    returnKeyType="search"
                    selectionColor={Colors.primary}
                  />

                  {filterQuery.length > 0 && (
                    <TouchableOpacity
                      style={styles.searchDockClear}
                      onPress={() => setFilterQuery('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.45)" />
                    </TouchableOpacity>
                  )}
                </Animated.View>

                <Animated.View
                  pointerEvents={showSearch ? 'auto' : 'none'}
                  style={{
                    opacity: searchAnim.interpolate({
                      inputRange: [0.65, 1],
                      outputRange: [0, 1],
                      extrapolate: 'clamp',
                    }),
                    transform: [
                      {
                        scale: searchAnim.interpolate({
                          inputRange: [0.65, 1],
                          outputRange: [0.65, 1],
                          extrapolate: 'clamp',
                        }),
                      },
                    ],
                  }}
                >
                  <TouchableOpacity
                    style={styles.searchPillCloseBtn}
                    onPress={closeSearch}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.72}
                  >
                    <Ionicons name="close" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                </Animated.View>
              </View>

              {!showSearch && (
                <TouchableOpacity
                  style={StyleSheet.absoluteFill}
                  onPress={openSearch}
                  activeOpacity={0.72}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                />
              )}
            </Animated.View>
          </View>
        </View>

      <View style={styles.trackSectionHeader}>
        <View>
          <Text style={styles.trackSectionTitle}>Şarkılar</Text>
          <Text style={styles.trackSectionSubtitle}>
            {normalizedFilter
              ? `${displayedTracks.length} eşleşme`
              : tracks.length > 0
                ? `${tracks.length} parça`
                : 'Henüz parça yok'}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={!!activePlaylistDetail}
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={closePlaylistDetail}
    >
      <View style={styles.container}>
        <LinearGradient
          colors={['#261015', '#111014', '#08080A', '#050506']}
          locations={[0, 0.25, 0.62, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.ambientOrbPrimary} pointerEvents="none" />
        <View style={styles.ambientOrbSecondary} pointerEvents="none" />

        <LinearGradient
          colors={[
            'rgba(0,0,0,0.80)',
            'rgba(0,0,0,0.40)',
            'rgba(0,0,0,0.04)',
            'transparent',
          ]}
          locations={[0, 0.38, 0.82, 1]}
          style={[styles.topScrim, { height: insets.top + 150 }]}
          pointerEvents="none"
        />

        <View
          style={[
            styles.topNav,
            {
              paddingTop: insets.top + 8,
              paddingHorizontal: pageSidePadding,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.navGlassButton}
            onPress={closePlaylistDetail}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.72}
          >
            <Ionicons name="chevron-down" size={23} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.navCenter}>
            <Text style={styles.navEyebrow}>ÇALMA LİSTESİ</Text>
            <Text style={styles.navTitle} numberOfLines={1}>
              {activePlaylistDetail.name}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.navGlassButton}
            accessibilityLabel="Çalma listesi seçenekleri"
            onPress={() => setIsMenuOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.72}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>


        <FlatList
          data={displayedTracks}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderTrackItem}
          ListHeaderComponent={renderHeroHeader}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom: Math.max(insets.bottom, 12) + 96,
              paddingHorizontal: pageSidePadding,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <View style={styles.emptyStateOuter}>
              <View style={styles.emptyStateCard}>
                <LinearGradient
                  colors={['rgba(229,9,20,0.18)', 'rgba(255,255,255,0.035)']}
                  style={styles.emptyStateIcon}
                >
                  <Ionicons
                    name={filterQuery ? 'search-outline' : 'musical-notes-outline'}
                    size={30}
                    color={Colors.primary}
                  />
                </LinearGradient>

                <Text style={styles.emptyStateHeading}>
                  {filterQuery ? 'Aradığın parça burada değil' : 'Bu liste henüz boş'}
                </Text>

                <Text style={styles.emptyStateMessage}>
                  {filterQuery
                    ? 'Başka bir şarkı adı veya sanatçı deneyebilirsin.'
                    : 'Şarkıların yanındaki üç nokta menüsünden bu çalma listesine parça ekleyebilirsin.'}
                </Text>

                {!!filterQuery && (
                  <TouchableOpacity
                    style={styles.emptyStateResetButton}
                    activeOpacity={0.78}
                    onPress={() => setFilterQuery('')}
                  >
                    <Text style={styles.emptyStateResetText}>Aramayı Temizle</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          }
        />

        {isMenuOpen && (
          <View style={styles.overlayLayer} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.menuBackdrop}
              activeOpacity={1}
              onPress={() => setIsMenuOpen(false)}
            />

            <View
              style={[
                styles.menuSheet,
                {
                  paddingBottom: Math.max(insets.bottom, 16) + 14,
                  paddingHorizontal: pageSidePadding,
                },
              ]}
            >
              <View style={styles.menuHandle} />

              <View style={styles.sheetInner}>
                <View style={styles.menuHeaderBox}>
                  <View style={styles.menuCoverFrame}>
                    <PlaylistCollageThumb
                      playlist={activePlaylistDetail}
                      size={58}
                      borderRadius={13}
                    />
                  </View>

                  <View style={styles.menuHeaderTextWrap}>
                    <Text style={styles.menuEyebrow}>ÇALMA LİSTESİ</Text>
                    <Text style={styles.menuPlaylistTitle} numberOfLines={1}>
                      {activePlaylistDetail.name}
                    </Text>
                    <Text style={styles.menuSubText}>
                      {tracks.length} parça{formattedDuration ? ` • ${formattedDuration}` : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.menuDivider} />
                <BulkDownloadButton tracks={tracks} menu onStarted={() => setIsMenuOpen(false)} />

                <TouchableOpacity
                  style={styles.menuRowItem}
                  activeOpacity={0.72}
                  onPress={handleStartRename}
                >
                  <View style={styles.menuIconCircle}>
                    <Ionicons name="pencil-outline" size={21} color="#FFFFFF" />
                  </View>
                  <View style={styles.menuRowText}>
                    <Text style={styles.menuRowTitle}>Yeniden adlandır</Text>
          
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.28)" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuRowItem}
                  activeOpacity={0.72}
                  onPress={handleShare}
                >
                  <View style={styles.menuIconCircle}>
                    <Ionicons name="share-social-outline" size={21} color="#FFFFFF" />
                  </View>
                  <View style={styles.menuRowText}>
                    <Text style={styles.menuRowTitle}>Çalma listesini paylaş</Text>
              
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.28)" />
                </TouchableOpacity>

                <View style={styles.menuDividerSoft} />

                <TouchableOpacity
                  style={[styles.menuRowItem, styles.menuRowDanger]}
                  activeOpacity={0.72}
                  onPress={handleOpenDeleteConfirm}
                >
                  <View style={[styles.menuIconCircle, styles.menuIconCircleDanger]}>
                    <Ionicons name="trash-outline" size={21} color="#FF5964" />
                  </View>
                  <View style={styles.menuRowText}>
                    <Text style={styles.menuRowTitleDanger}>Çalma listesini sil</Text>
                    <Text style={styles.menuRowSub}>Bu işlem geri alınamaz</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,89,100,0.72)" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuDismissBtn}
                  activeOpacity={0.8}
                  onPress={() => setIsMenuOpen(false)}
                >
                  <Text style={styles.menuDismissText}>Vazgeç</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <KeyboardAvoidModal
          visible={isRenameOpen}
          onRequestClose={() => setIsRenameOpen(false)}
          onBackdropPress={() => setIsRenameOpen(false)}
        >
          <View style={styles.dialogBadgeBlue}>
            <Ionicons name="pencil" size={23} color="#70A7FF" />
          </View>

          <Text style={styles.dialogHeading}>Listeyi yeniden adlandır</Text>
          <Text style={styles.dialogSubheading}>
            Çalma listen için yeni bir isim belirle.
          </Text>

          <TextInput
            style={styles.dialogTextInput}
            placeholder="Çalma listesi adı"
            placeholderTextColor="rgba(255,255,255,0.34)"
            value={renameInput}
            onChangeText={setRenameInput}
            autoFocus
            maxLength={50}
            selectTextOnFocus
            selectionColor={Colors.primary}
          />

          <View style={styles.dialogActionsRow}>
            <TouchableOpacity
              style={styles.dialogSecondaryButton}
              activeOpacity={0.78}
              onPress={() => setIsRenameOpen(false)}
            >
              <Text style={styles.dialogSecondaryText}>Vazgeç</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.dialogPrimaryButton,
                !renameInput.trim() && styles.buttonDisabled,
              ]}
              disabled={!renameInput.trim()}
              activeOpacity={0.84}
              onPress={handleSaveRename}
            >
              <Text style={styles.dialogPrimaryText}>Kaydet</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidModal>

        <KeyboardAvoidModal
          visible={isDeleteConfirmOpen}
          onRequestClose={() => setIsDeleteConfirmOpen(false)}
          onBackdropPress={() => setIsDeleteConfirmOpen(false)}
        >
          <View style={styles.dialogBadgeDanger}>
            <Ionicons name="trash-outline" size={23} color="#FF5964" />
          </View>

          <Text style={styles.dialogHeading}>Çalma listesini sil</Text>
          <Text style={styles.dialogSubheading}>
            Bu işlem geri alınamaz. Onaylamak için aşağıya liste adını yaz:{'\n'}
            <Text style={styles.dialogStrongText}>{activePlaylistDetail.name}</Text>
          </Text>

          <TextInput
            style={styles.dialogTextInput}
            placeholder={activePlaylistDetail.name}
            placeholderTextColor="rgba(255,255,255,0.34)"
            value={confirmNameInput}
            onChangeText={setConfirmNameInput}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor="#FF5964"
          />

          <View style={styles.dialogActionsRow}>
            <TouchableOpacity
              style={styles.dialogSecondaryButton}
              activeOpacity={0.78}
              onPress={() => setIsDeleteConfirmOpen(false)}
            >
              <Text style={styles.dialogSecondaryText}>Vazgeç</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.dialogDangerButton,
                confirmNameInput.trim().toLocaleLowerCase('tr-TR') !==
                  activePlaylistDetail.name.trim().toLocaleLowerCase('tr-TR') &&
                  styles.buttonDisabled,
              ]}
              disabled={
                confirmNameInput.trim().toLocaleLowerCase('tr-TR') !==
                activePlaylistDetail.name.trim().toLocaleLowerCase('tr-TR')
              }
              activeOpacity={0.84}
              onPress={handleConfirmDelete}
            >
              <Text style={styles.dialogPrimaryText}>Sil</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidModal>
      </View>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050506',
  },

  ambientOrbPrimary: {
    position: 'absolute',
    top: -130,
    left: -90,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: 'rgba(229, 9, 20, 0.18)',
    transform: [{ scaleX: 1.18 }],
  },
  ambientOrbSecondary: {
    position: 'absolute',
    top: 150,
    right: -130,
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: 'rgba(126, 34, 206, 0.10)',
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 11,
  },

  topNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navGlassButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 12, 14, 0.60)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  navEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.35,
    color: 'rgba(255,255,255,0.42)',
    marginBottom: 2,
  },
  navTitle: {
    maxWidth: 280,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },

  searchFloatingWrap: {
    position: 'absolute',
    zIndex: 29,
    alignItems: 'center',
  },
  searchBar: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    minHeight: 46,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: 'rgba(20,20,23,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  searchClearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  listContent: {
    flexGrow: 1,
  },

  heroSection: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingBottom: 10,
  },
  heroContent: {
    width: '100%',
    maxWidth: MAX_HERO_WIDTH,
    alignSelf: 'center',
    alignItems: 'center',
  },
  heroContentLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverStage: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  coverStageLandscape: {
    marginBottom: 0,
    marginRight: 34,
    flexShrink: 0,
  },
  coverGlow: {
    position: 'absolute',
    bottom: -18,
    backgroundColor: 'rgba(229,9,20,0.22)',
    transform: [{ scaleX: 1.05 }],
  },
  coverFrame: {
    overflow: 'hidden',
    backgroundColor: '#131316',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.52,
    shadowRadius: 25,
    elevation: 16,
  },

  heroInfo: {
    width: '100%',
    alignItems: 'center',
  },
  heroInfoLandscape: {
    flex: 1,
    alignItems: 'flex-start',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 27,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 11,
  },
  typeBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginRight: 7,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.25,
    color: 'rgba(255,255,255,0.68)',
  },
  titleTouchZone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: 4,
  },
  titleTouchZoneLandscape: {
    justifyContent: 'flex-start',
  },
  playlistHeroTitle: {
    flexShrink: 1,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -1.15,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  playlistHeroTitleCompact: {
    fontSize: 27,
    lineHeight: 32,
  },
  playlistHeroTitleWide: {
    fontSize: 36,
    lineHeight: 41,
  },
  playlistHeroTitleLandscape: {
    textAlign: 'left',
  },
  editPencilBadge: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 9,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  descriptionText: {
    maxWidth: 560,
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.53)',
    textAlign: 'center',
  },
  descriptionTextLandscape: {
    textAlign: 'left',
  },
  playlistMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 13,
  },
  playlistMetaRowLandscape: {
    justifyContent: 'flex-start',
  },
  brandAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    marginRight: 7,
  },
  brandAvatarText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  brandText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  metaDotLarge: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.34)',
    marginHorizontal: 8,
  },
  metaText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.52)',
  },

  actionRowContainer: {
    width: '100%',
    minHeight: 56,
    marginTop: 20,
    marginBottom: 6,
    position: 'relative',
    justifyContent: 'center',
  },
  actionDockRight: {
    position: 'absolute',
    right: 4,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  searchPill: {
    position: 'absolute',
    left: 4,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  searchPillTouchOverlay: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPillExpandedInner: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  searchPillIconBox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPillInputWrap: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchDockInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  searchDockClear: {
    padding: 4,
    marginRight: 4,
  },
  searchPillCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  shuffleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  playIcon: {
    marginLeft: 3,
  },
  buttonDisabled: {
    opacity: 0.38,
  },

  trackSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 32,
    marginBottom: 11,
    paddingHorizontal: 4,
  },
  trackSectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  trackSectionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.38)',
  },
  inlineSearchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  inlineSearchButtonActive: {
    backgroundColor: 'rgba(229,9,20,0.12)',
    borderColor: 'rgba(229,9,20,0.20)',
  },

  trackOuter: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  trackRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingLeft: 4,
    paddingRight: 2,
    borderRadius: 16,
    marginBottom: 4,
  },
  trackRowActive: {
    backgroundColor: 'rgba(229,9,20,0.095)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.12)',
    paddingLeft: 3,
    paddingRight: 1,
  },
  trackLeadingBox: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  playingIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229,9,20,0.12)',
  },
  trackIndex: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.30)',
  },
  trackThumbWrapper: {
    position: 'relative',
    width: 50,
    height: 50,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#151518',
    marginRight: 12,
  },
  trackThumb: {
    width: '100%',
    height: '100%',
  },
  trackThumbOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  equalizerRow: {
    height: 17,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  equalizerBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  equalizerBarSmall: {
    height: 8,
  },
  equalizerBarTall: {
    height: 16,
  },
  equalizerBarMid: {
    height: 12,
  },
  trackMeta: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  trackTitle: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '700',
    color: '#F7F7F8',
    marginBottom: 4,
  },
  trackTitleActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  trackSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  trackArtist: {
    flexShrink: 1,
    fontSize: 12.25,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.26)',
    marginHorizontal: 6,
  },
  trackDurationText: {
    flexShrink: 0,
    fontSize: 11.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.32)',
  },
  moreBtn: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyStateOuter: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingTop: 18,
  },
  emptyStateCard: {
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 42,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.055)',
  },
  emptyStateIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyStateHeading: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptyStateMessage: {
    maxWidth: 390,
    marginTop: 7,
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.44)',
    textAlign: 'center',
  },
  emptyStateResetButton: {
    marginTop: 18,
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  emptyStateResetText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  overlayLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 80,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  menuSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    backgroundColor: '#121214',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.42,
    shadowRadius: 26,
    elevation: 24,
  },
  menuHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.20)',
    marginBottom: 14,
  },
  sheetInner: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  menuHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    marginBottom: 14,
  },
  menuCoverFrame: {
    width: 58,
    height: 58,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: '#1B1B1E',
  },
  menuHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 13,
  },
  menuEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.15,
    color: 'rgba(255,255,255,0.34)',
    marginBottom: 3,
  },
  menuPlaylistTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  menuSubText: {
    marginTop: 3,
    fontSize: 11.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.38)',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 7,
  },
  menuDividerSoft: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.055)',
    marginVertical: 5,
  },
  menuRowItem: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderRadius: 16,
  },
  menuRowDanger: {
    marginTop: 1,
  },
  menuIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  menuIconCircleDanger: {
    backgroundColor: 'rgba(255,89,100,0.09)',
  },
  menuRowText: {
    flex: 1,
    minWidth: 0,
  },
  menuRowTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  menuRowTitleDanger: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FF5964',
  },
  menuRowSub: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.36)',
  },
  menuDismissBtn: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  menuDismissText: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.62)',
  },

  dialogBadgeBlue: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(112,167,255,0.13)',
  },
  dialogBadgeDanger: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    backgroundColor: 'rgba(255,89,100,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(255,89,100,0.12)',
  },
  dialogHeading: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: -0.35,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  dialogSubheading: {
    marginTop: 7,
    marginBottom: 18,
    fontSize: 12.75,
    lineHeight: 19,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.50)',
    textAlign: 'center',
  },
  dialogStrongText: {
    fontWeight: '900',
    color: '#FFFFFF',
  },
  dialogTextInput: {
    width: '100%',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#08080A',
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 18,
  },
  dialogActionsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dialogSecondaryButton: {
    flex: 1,
    minHeight: 45,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.065)',
  },
  dialogSecondaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.68)',
  },
  dialogPrimaryButton: {
    flex: 1,
    minHeight: 45,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
  },
  dialogDangerButton: {
    flex: 1,
    minHeight: 45,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
  },
  dialogPrimaryText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
