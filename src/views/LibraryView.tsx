import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMusicStore, Playlist } from '../store/musicStore';
import { useLibraryStore } from '../store/libraryStore';
import { useUiStore } from '../store/uiStore';
import { YouTubeService, TrackItem } from '../services/youtubeService';
import { offlineDownloadService } from '../services/offlineDownloadService';
import { useAuthStore } from '../store/authStore';
import { TrackRow } from '../components/TrackRow';
import { PlaylistCollageThumb } from '../components/PlaylistCollageThumb';
import { KeyboardAvoidModal } from '../components/KeyboardAvoidModal';
import { accountSession } from '../services/auth/accountStorage';
import { Colors } from '../constants/theme';

const { width: screenWidth } = Dimensions.get('window');
const GRID_SPACING = 12;
const HORIZONTAL_PADDING = 16;
const CARD_WIDTH = Math.floor((screenWidth - HORIZONTAL_PADDING * 2 - GRID_SPACING) / 2);

type SubTabKey = 'all' | 'playlists' | 'favorites' | 'downloads' | 'artists' | 'history';
type ViewMode = 'grid' | 'list';
type SortOrder = 'recent' | 'alphabetical' | 'tracks';

export const LibraryView: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [isNewPlaylistModalOpen, setIsNewPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [downloadedTracks, setDownloadedTracks] = useState<TrackItem[]>([]);

  // Library 3-dots Menu and Playlist Import States
  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importName, setImportName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatusText, setImportStatusText] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  React.useEffect(() => {
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

  React.useEffect(() => {
    offlineDownloadService.getDownloadedTracks().then((items) => {
      setDownloadedTracks(items.map((i) => i.track));
    });
  }, [activeSubTab]);

  const {
    favorites,
    history,
    playlists,
    playTrack,
    currentTrack,
    isPlaying,
    createPlaylist,
    importPlaylist,
    openPlaylistDetail,
    openActionSheet,
  } = useMusicStore();
  const { followedArtists, unfollowArtist, clearHistory } = useLibraryStore();
  const { openArtist, setActiveTab } = useUiStore();
  const { user } = useAuthStore();

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      Alert.alert('Uyarı', 'Lütfen çalma listesi için bir ad girin.');
      return;
    }
    await createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setIsNewPlaylistModalOpen(false);
  };

  const handleImportPlaylist = async () => {
    const epoch = accountSession.generation;
    if (!importUrl.trim()) {
      Alert.alert('Uyarı', 'Lütfen bir çalma listesi bağlantısı (URL) veya ID girin.');
      return;
    }

    setIsImporting(true);
    setImportStatusText('Çalma listesi bilgileri alınıyor...');

    try {
      const result = await YouTubeService.getPlaylist(importUrl.trim());
      if (!accountSession.isCurrent(epoch)) return;
      if (!result || !result.tracks || result.tracks.length === 0) {
        Alert.alert(
          'Hata',
          'Çalma listesi bulunamadı veya parça içermiyor. Bağlantının YouTube veya YouTube Music herkese açık (public/unlisted) bir liste olduğundan emin olun.'
        );
        setIsImporting(false);
        setImportStatusText('');
        return;
      }

      setImportStatusText(`${result.tracks.length} parça aktarılıyor...`);

      const playlistTitle = importName.trim() || result.title || 'İçe Aktarılan Liste';
      const newPlaylist = await importPlaylist(
        playlistTitle,
        result.tracks,
        result.thumbnailUrl,
        `YouTube üzerinden içe aktarıldı (${result.author || ''})`
      );

      setIsImporting(false);
      setImportStatusText('');
      setIsImportModalOpen(false);
      setImportUrl('');
      setImportName('');

      if (!accountSession.isCurrent(epoch)) return;
      openPlaylistDetail(newPlaylist);
    } catch (err: any) {
      console.warn('Import playlist error:', err);
      Alert.alert('Hata', 'Çalma listesi içe aktarılırken bir sorun oluştu.');
      setIsImporting(false);
      setImportStatusText('');
    }
  };

  const playShuffled = (trackList: TrackItem[]) => {
    if (!trackList || trackList.length === 0) return;
    const randomIndex = Math.floor(Math.random() * trackList.length);
    playTrack(trackList[randomIndex], trackList);
  };

  // Filter and sort playlists
  const filteredPlaylists = useMemo(() => {
    let result = [...playlists];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (sortOrder === 'alphabetical') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    } else if (sortOrder === 'tracks') {
      result.sort((a, b) => (b.tracks?.length || 0) - (a.tracks?.length || 0));
    }
    return result;
  }, [playlists, searchQuery, sortOrder]);

  // Filter favorites
  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favorites;
    const q = searchQuery.toLowerCase().trim();
    return favorites.filter(
      (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );
  }, [favorites, searchQuery]);

  // Filter downloads
  const filteredDownloads = useMemo(() => {
    if (!searchQuery.trim()) return downloadedTracks;
    const q = searchQuery.toLowerCase().trim();
    return downloadedTracks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );
  }, [downloadedTracks, searchQuery]);

  // Filter artists
  const filteredArtists = useMemo(() => {
    if (!searchQuery.trim()) return followedArtists;
    const q = searchQuery.toLowerCase().trim();
    return followedArtists.filter((a) => a.name.toLowerCase().includes(q));
  }, [followedArtists, searchQuery]);

  // Filter history
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.toLowerCase().trim();
    return history.filter(
      (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );
  }, [history, searchQuery]);

  const cycleSortOrder = () => {
    if (sortOrder === 'recent') setSortOrder('alphabetical');
    else if (sortOrder === 'alphabetical') setSortOrder('tracks');
    else setSortOrder('recent');
  };

  const getSortLabel = () => {
    switch (sortOrder) {
      case 'alphabetical':
        return 'Alfabetik';
      case 'tracks':
        return 'Parça Sayısı';
      case 'recent':
      default:
        return 'Son Eklenen';
    }
  };

  const renderTrackItem = ({ item, index }: { item: TrackItem; index: number }) => {
    const isThisPlaying = currentTrack?.id === item.id;
    const currentList =
      activeSubTab === 'favorites'
        ? filteredFavorites
        : activeSubTab === 'downloads'
        ? filteredDownloads
        : filteredHistory;

    return (
      <TrackRow
        track={item}
        index={index}
        isCurrent={isThisPlaying}
        isPlaying={isPlaying}
        onPress={() => playTrack(item, currentList)}
        onMorePress={() => openActionSheet(item)}
      />
    );
  };

  // Liked Songs item representation in grid
  const renderLikedSongsGridCard = () => (
    <TouchableOpacity
      key="liked-songs-grid"
      style={[styles.gridCard, { width: CARD_WIDTH }]}
      activeOpacity={0.82}
      onPress={() => setActiveSubTab('favorites')}
    >
      <View style={[styles.gridThumbContainer, { width: CARD_WIDTH, height: CARD_WIDTH }]}>
        <LinearGradient
          colors={['#7E1D2D', '#D61A24']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.likedSongsGradient}
        >
          <Ionicons name="heart" size={CARD_WIDTH * 0.35} color="#FFFFFF" />
          {favorites.length > 0 && (
            <TouchableOpacity
              style={styles.gridPlayFloatingBtn}
              activeOpacity={0.85}
              onPress={(e) => {
                e.stopPropagation();
                playTrack(favorites[0], favorites);
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="play" size={18} color="#FFFFFF" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          )}
        </LinearGradient>
      </View>
      <View style={styles.gridMeta}>
        <View style={styles.pinnedRow}>
          <Ionicons name="pin" size={11} color={Colors.primary} style={{ marginRight: 4 }} />
          <Text style={styles.gridCardTitle} numberOfLines={1}>
            Beğenilen Şarkılar
          </Text>
        </View>
        <Text style={styles.gridCardSub} numberOfLines={1}>
          Çalma Listesi • {favorites.length} parça
        </Text>
      </View>
    </TouchableOpacity>
  );

  // New Playlist action card in grid
  const renderAddPlaylistGridCard = () => (
    <TouchableOpacity
      key="add-playlist-grid"
      style={[styles.gridCard, { width: CARD_WIDTH }]}
      activeOpacity={0.78}
      onPress={() => setIsNewPlaylistModalOpen(true)}
    >
      <View style={[styles.gridThumbContainer, styles.addPlaylistContainer, { width: CARD_WIDTH, height: CARD_WIDTH }]}>
        <View style={styles.addPlaylistIconBox}>
          <Ionicons name="add" size={32} color="#FFFFFF" />
        </View>
      </View>
      <View style={styles.gridMeta}>
        <Text style={styles.gridCardTitle} numberOfLines={1}>
          Yeni Liste Oluştur
        </Text>
        <Text style={styles.gridCardSub} numberOfLines={1}>
          Özel koleksiyon ekle
        </Text>
      </View>
    </TouchableOpacity>
  );

  // Regular Playlist card in grid
  const renderPlaylistGridCard = (playlist: Playlist) => {
    const tracksCount = playlist.tracks?.length || 0;
    return (
      <TouchableOpacity
        key={playlist.id}
        style={[styles.gridCard, { width: CARD_WIDTH }]}
        activeOpacity={0.82}
        onPress={() => openPlaylistDetail(playlist)}
      >
        <View style={[styles.gridThumbContainer, { width: CARD_WIDTH, height: CARD_WIDTH }]}>
          <PlaylistCollageThumb playlist={playlist} size={CARD_WIDTH} borderRadius={10} />
          {tracksCount > 0 && (
            <TouchableOpacity
              style={styles.gridPlayFloatingBtn}
              activeOpacity={0.85}
              onPress={(e) => {
                e.stopPropagation();
                playTrack(playlist.tracks[0], playlist.tracks);
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="play" size={18} color="#FFFFFF" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.gridMeta}>
          <Text style={styles.gridCardTitle} numberOfLines={1}>
            {playlist.name}
          </Text>
          <Text style={styles.gridCardSub} numberOfLines={1}>
            Çalma Listesi • {tracksCount} parça
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Regular Playlist row in list mode
  const renderPlaylistListRow = (playlist: Playlist) => {
    const tracksCount = playlist.tracks?.length || 0;
    return (
      <TouchableOpacity
        key={playlist.id}
        style={styles.listRow}
        activeOpacity={0.75}
        onPress={() => openPlaylistDetail(playlist)}
      >
        <PlaylistCollageThumb playlist={playlist} size={58} borderRadius={8} />
        <View style={styles.listRowMeta}>
          <Text style={styles.listRowTitle} numberOfLines={1}>
            {playlist.name}
          </Text>
          <Text style={styles.listRowSub}>
            Çalma Listesi • {tracksCount} parça
          </Text>
        </View>
        {tracksCount > 0 && (
          <TouchableOpacity
            style={styles.listPlayBtn}
            activeOpacity={0.8}
            onPress={(e) => {
              e.stopPropagation();
              playTrack(playlist.tracks[0], playlist.tracks);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="play" size={16} color="#FFFFFF" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: (insets.top || 16) + 8 }]}>
      {/* Top Bar / Header */}
      <View style={styles.topHeader}>
        <View style={styles.titleRow}>
          <Text style={styles.screenTitle}>Kütüphanen</Text>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={[styles.headerActionBtn, isSearchActive && styles.headerActionBtnActive]}
            activeOpacity={0.8}
            onPress={() => {
              setIsSearchActive(!isSearchActive);
              if (isSearchActive) setSearchQuery('');
            }}
          >
            <Ionicons
              name={isSearchActive ? 'close' : 'search-outline'}
              size={20}
              color={isSearchActive ? Colors.primary : '#FFFFFF'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerActionBtn}
            activeOpacity={0.8}
            onPress={() => setIsLibraryMenuOpen(true)}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Expandable In-Library Search Input */}
      {isSearchActive && (
        <View style={styles.searchBarWrapper}>
          <Ionicons name="search" size={16} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Kütüphanende ara..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Filter Chips Bar */}
      <View style={styles.chipsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          <TouchableOpacity
            style={[styles.chip, activeSubTab === 'all' && styles.chipActive]}
            onPress={() => setActiveSubTab('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, activeSubTab === 'all' && styles.chipTextActive]}>
              Tümü
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, activeSubTab === 'playlists' && styles.chipActive]}
            onPress={() => setActiveSubTab('playlists')}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, activeSubTab === 'playlists' && styles.chipTextActive]}>
              Çalma Listeleri
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, activeSubTab === 'favorites' && styles.chipActive]}
            onPress={() => setActiveSubTab('favorites')}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, activeSubTab === 'favorites' && styles.chipTextActive]}>
              Favoriler
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, activeSubTab === 'downloads' && styles.chipActive]}
            onPress={() => setActiveSubTab('downloads')}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, activeSubTab === 'downloads' && styles.chipTextActive]}>
              İndirilenler
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, activeSubTab === 'artists' && styles.chipActive]}
            onPress={() => setActiveSubTab('artists')}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, activeSubTab === 'artists' && styles.chipTextActive]}>
              Sanatçılar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, activeSubTab === 'history' && styles.chipActive]}
            onPress={() => setActiveSubTab('history')}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, activeSubTab === 'history' && styles.chipTextActive]}>
              Geçmiş
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Sort and View Mode Toggle Toolbar (for playlists / all tabs) */}
      {(activeSubTab === 'all' || activeSubTab === 'playlists') && (
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.sortBtn}
            activeOpacity={0.75}
            onPress={cycleSortOrder}
          >
            <Ionicons name="swap-vertical" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.sortText}>{getSortLabel()}</Text>
          </TouchableOpacity>

          <View style={styles.viewModeGroup}>
            <TouchableOpacity
              style={[styles.viewModeBtn, viewMode === 'grid' && styles.viewModeBtnActive]}
              activeOpacity={0.8}
              onPress={() => setViewMode('grid')}
            >
              <Ionicons
                name="grid"
                size={16}
                color={viewMode === 'grid' ? '#FFFFFF' : Colors.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewModeBtn, viewMode === 'list' && styles.viewModeBtnActive]}
              activeOpacity={0.8}
              onPress={() => setViewMode('list')}
            >
              <Ionicons
                name="list"
                size={18}
                color={viewMode === 'list' ? '#FFFFFF' : Colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main Content Area */}
      <View style={styles.contentArea}>
        {/* TAB: ALL & PLAYLISTS */}
        {(activeSubTab === 'all' || activeSubTab === 'playlists') && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollPadding}
          >
            {viewMode === 'grid' ? (
              <View style={styles.gridContainer}>
                {/* 1. Liked Songs Card */}
                {renderLikedSongsGridCard()}

                {/* 2. Add New Playlist Card */}
                {renderAddPlaylistGridCard()}

                {/* 3. User Playlists */}
                {filteredPlaylists.map((p) => renderPlaylistGridCard(p))}
              </View>
            ) : (
              <View style={styles.listContainer}>
                {/* Liked songs list row */}
                <TouchableOpacity
                  style={styles.listRow}
                  activeOpacity={0.75}
                  onPress={() => setActiveSubTab('favorites')}
                >
                  <View style={[styles.listRowThumb, { backgroundColor: '#7E1D2D' }]}>
                    <Ionicons name="heart" size={26} color="#FFFFFF" />
                  </View>
                  <View style={styles.listRowMeta}>
                    <Text style={styles.listRowTitle}>Beğenilen Şarkılar</Text>
                    <Text style={styles.listRowSub}>
                      Çalma Listesi • {favorites.length} parça • Sabitlendi
                    </Text>
                  </View>
                  {favorites.length > 0 && (
                    <TouchableOpacity
                      style={styles.listPlayBtn}
                      activeOpacity={0.8}
                      onPress={(e) => {
                        e.stopPropagation();
                        playTrack(favorites[0], favorites);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="play" size={16} color="#FFFFFF" style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                {/* User playlists rows */}
                {filteredPlaylists.map((p) => renderPlaylistListRow(p))}
              </View>
            )}
          </ScrollView>
        )}

        {/* TAB: FAVORITES */}
        {activeSubTab === 'favorites' && (
          <View style={{ flex: 1 }}>
            {filteredFavorites.length > 0 ? (
              <>
                <View style={styles.subtabHeroBar}>
                  <View>
                    <Text style={styles.subtabHeroTitle}>Beğenilen Şarkılar</Text>
                    <Text style={styles.subtabHeroCount}>{filteredFavorites.length} parça</Text>
                  </View>
                  <View style={styles.subtabHeroActions}>
                    <TouchableOpacity
                      style={styles.shuffleCircleBtn}
                      activeOpacity={0.8}
                      onPress={() => playShuffled(filteredFavorites)}
                    >
                      <Ionicons name="shuffle" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.playAllCircleBtn}
                      activeOpacity={0.85}
                      onPress={() => playTrack(filteredFavorites[0], filteredFavorites)}
                    >
                      <Ionicons name="play" size={22} color="#FFFFFF" style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  </View>
                </View>

                <FlatList
                  data={filteredFavorites}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTrackItem}
                  contentContainerStyle={styles.scrollPadding}
                  showsVerticalScrollIndicator={false}
                />
              </>
            ) : (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="heart-outline" size={42} color={Colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>Henüz Beğenilen Şarkı Yok</Text>
                <Text style={styles.emptySub}>
                  Sevdiğin şarkıları çalarken kalp butonuna basarak kütüphanene ekleyebilirsin.
                </Text>
                <TouchableOpacity
                  style={styles.emptyCtaBtn}
                  activeOpacity={0.85}
                  onPress={() => setActiveTab('search')}
                >
                  <Text style={styles.emptyCtaBtnText}>Müzik Keşfet</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* TAB: DOWNLOADS */}
        {activeSubTab === 'downloads' && (
          <View style={{ flex: 1 }}>
            {filteredDownloads.length > 0 ? (
              <>
                <View style={styles.subtabHeroBar}>
                  <View>
                    <Text style={styles.subtabHeroTitle}>İndirilen Şarkılar</Text>
                    <Text style={styles.subtabHeroCount}>{filteredDownloads.length} parça indirildi</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.playAllCircleBtn}
                    activeOpacity={0.85}
                    onPress={() => playTrack(filteredDownloads[0], filteredDownloads)}
                  >
                    <Ionicons name="play" size={22} color="#FFFFFF" style={{ marginLeft: 2 }} />
                  </TouchableOpacity>
                </View>

                <FlatList
                  data={filteredDownloads}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTrackItem}
                  contentContainerStyle={styles.scrollPadding}
                  showsVerticalScrollIndicator={false}
                />
              </>
            ) : (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="cloud-offline-outline" size={42} color={Colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>Henüz İndirilen Parça Yok</Text>
                <Text style={styles.emptySub}>
                  Şarkıların yanındaki seçeneklerden (üç nokta) 'Çevrimdışı İndir' butonuna basarak internet olmadan dinleyebilirsin.
                </Text>
                <TouchableOpacity
                  style={styles.emptyCtaBtn}
                  activeOpacity={0.85}
                  onPress={() => setActiveTab('search')}
                >
                  <Text style={styles.emptyCtaBtnText}>Şarkı Bul ve İndir</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* TAB: ARTISTS */}
        {activeSubTab === 'artists' && (
          <View style={{ flex: 1 }}>
            {filteredArtists.length > 0 ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollPadding}
              >
                <View style={styles.artistsGrid}>
                  {filteredArtists.map((artist) => (
                    <TouchableOpacity
                      key={artist.id}
                      style={styles.artistCard}
                      activeOpacity={0.8}
                      onPress={() => openArtist(artist.name)}
                    >
                      <View style={styles.artistAvatarWrap}>
                        {artist.thumbnailUrl ? (
                          <Image
                            source={{ uri: artist.thumbnailUrl }}
                            style={styles.artistAvatar}
                            contentFit="cover"
                            transition={150}
                          />
                        ) : (
                          <View style={styles.artistAvatarFallback}>
                            <Ionicons name="person" size={40} color={Colors.textMuted} />
                          </View>
                        )}
                      </View>
                      <Text style={styles.artistCardName} numberOfLines={1}>
                        {artist.name}
                      </Text>
                      <Text style={styles.artistCardSub}>Sanatçı</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="person-outline" size={42} color={Colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>Takip Edilen Sanatçı Yok</Text>
                <Text style={styles.emptySub}>
                  Sanatçı sayfalarına giderek takip et butonuna bastığında sanatçıların burada listelenir.
                </Text>
                <TouchableOpacity
                  style={styles.emptyCtaBtn}
                  activeOpacity={0.85}
                  onPress={() => setActiveTab('search')}
                >
                  <Text style={styles.emptyCtaBtnText}>Sanatçı Keşfet</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* TAB: HISTORY */}
        {activeSubTab === 'history' && (
          <View style={{ flex: 1 }}>
            {filteredHistory.length > 0 ? (
              <>
                <View style={styles.subtabHeroBar}>
                  <View>
                    <Text style={styles.subtabHeroTitle}>Dinleme Geçmişi</Text>
                    <Text style={styles.subtabHeroCount}>Son {filteredHistory.length} parça</Text>
                  </View>
                  <View style={styles.subtabHeroActions}>
                    <TouchableOpacity
                      style={styles.clearTextBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        Alert.alert(
                          'Geçmişi Temizle',
                          'Dinleme geçmişinizi silmek istediğinize emin misiniz?',
                          [
                            { text: 'Vazgeç', style: 'cancel' },
                            { text: 'Temizle', style: 'destructive', onPress: clearHistory },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={14} color="#FF6B6B" style={{ marginRight: 4 }} />
                      <Text style={styles.clearTextBtnText}>Temizle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.playAllCircleBtn}
                      activeOpacity={0.85}
                      onPress={() => playTrack(filteredHistory[0], filteredHistory)}
                    >
                      <Ionicons name="play" size={22} color="#FFFFFF" style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  </View>
                </View>

                <FlatList
                  data={filteredHistory}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTrackItem}
                  contentContainerStyle={styles.scrollPadding}
                  showsVerticalScrollIndicator={false}
                />
              </>
            ) : (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="time-outline" size={42} color={Colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>Dinleme Geçmişi Boş</Text>
                <Text style={styles.emptySub}>
                  Dinlediğin müzikler otomatik olarak burada toplanacaktır.
                </Text>
                <TouchableOpacity
                  style={styles.emptyCtaBtn}
                  activeOpacity={0.85}
                  onPress={() => setActiveTab('search')}
                >
                  <Text style={styles.emptyCtaBtnText}>Müzik Dinle</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Modern Create Playlist Modal */}
      <KeyboardAvoidModal
        visible={isNewPlaylistModalOpen}
        onRequestClose={() => {
          setIsNewPlaylistModalOpen(false);
          setNewPlaylistName('');
        }}
        onBackdropPress={() => {
          setIsNewPlaylistModalOpen(false);
          setNewPlaylistName('');
        }}
      >
        <View style={styles.modalIconBox}>
          <Ionicons name="musical-notes" size={28} color={Colors.primary} />
        </View>
        <Text style={styles.modalTitle}>Çalma Listesi Adı</Text>
        <Text style={styles.modalSub}>Listeniz için akılda kalıcı bir isim belirleyin:</Text>

        <TextInput
          style={styles.modalInput}
          placeholder="Örn: Yolculuk Şarkıları"
          placeholderTextColor={Colors.textMuted}
          value={newPlaylistName}
          onChangeText={setNewPlaylistName}
          autoFocus
          maxLength={40}
        />

        <View style={styles.modalActions}>
          <TouchableOpacity
            style={styles.modalCancelBtn}
            activeOpacity={0.8}
            onPress={() => {
              setIsNewPlaylistModalOpen(false);
              setNewPlaylistName('');
            }}
          >
            <Text style={styles.modalCancelText}>İptal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalSubmitBtn}
            activeOpacity={0.85}
            onPress={handleCreatePlaylist}
          >
            <Text style={styles.modalSubmitText}>Oluştur</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidModal>

      {/* Library 3-Dots Options Menu Bottom Sheet */}
      <Modal
        visible={isLibraryMenuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setIsLibraryMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setIsLibraryMenuOpen(false)}
        >
          <View style={[styles.menuSheet, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuSheetTitle}>Kütüphane İşlemleri</Text>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setIsLibraryMenuOpen(false);
                setIsNewPlaylistModalOpen(true);
              }}
            >
              <View style={[styles.menuItemIconWrap, { backgroundColor: 'rgba(229, 9, 20, 0.15)' }]}>
                <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
              </View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Yeni Çalma Listesi Oluştur</Text>
                <Text style={styles.menuItemSub}>Boş bir özel liste oluşturun ve şarkılar ekleyin</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setIsLibraryMenuOpen(false);
                setIsImportModalOpen(true);
              }}
            >
              <View style={[styles.menuItemIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <Ionicons name="cloud-download-outline" size={22} color="#3B82F6" />
              </View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Çalma Listesini İçe Aktar</Text>
                <Text style={styles.menuItemSub}>YouTube veya YouTube Music bağlantısı ile aktarın</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancelBtn}
              activeOpacity={0.8}
              onPress={() => setIsLibraryMenuOpen(false)}
            >
              <Text style={styles.menuCancelText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Import Playlist Modal */}
      <KeyboardAvoidModal
        visible={isImportModalOpen}
        onRequestClose={() => {
          if (!isImporting) {
            setIsImportModalOpen(false);
            setImportUrl('');
            setImportName('');
          }
        }}
        onBackdropPress={() => {
          if (!isImporting) {
            setIsImportModalOpen(false);
            setImportUrl('');
            setImportName('');
          }
        }}
        contentStyle={{ maxWidth: 360 }}
      >
        <View style={[styles.modalIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
          <Ionicons name="cloud-download-outline" size={28} color="#3B82F6" />
        </View>
        <Text style={styles.modalTitle}>Çalma Listesini İçe Aktar</Text>
        <Text style={styles.modalSub}>
          YouTube veya YouTube Music çalma listesi bağlantısını yapıştırarak tüm parçaları kütüphanenize ekleyin:
        </Text>

        <TextInput
          style={[styles.modalInput, { textAlign: 'left', fontSize: 13 }]}
          placeholder="https://music.youtube.com/playlist?list=..."
          placeholderTextColor={Colors.textMuted}
          value={importUrl}
          onChangeText={setImportUrl}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isImporting}
        />

        <TextInput
          style={[styles.modalInput, { textAlign: 'left', fontSize: 13, marginBottom: 16 }]}
          placeholder="Özel Liste Adı (İsteğe bağlı)"
          placeholderTextColor={Colors.textMuted}
          value={importName}
          onChangeText={setImportName}
          maxLength={50}
          editable={!isImporting}
        />

        {isImporting && (
          <View style={styles.importLoadingBox}>
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 10 }} />
            <Text style={styles.importLoadingText}>{importStatusText}</Text>
          </View>
        )}

        <View style={styles.modalActions}>
          <TouchableOpacity
            style={[styles.modalCancelBtn, isImporting && { opacity: 0.5 }]}
            activeOpacity={0.8}
            disabled={isImporting}
            onPress={() => {
              setIsImportModalOpen(false);
              setImportUrl('');
              setImportName('');
            }}
          >
            <Text style={styles.modalCancelText}>İptal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modalSubmitBtn,
              { backgroundColor: '#3B82F6' },
              (isImporting || !importUrl.trim()) && { opacity: 0.5 },
            ]}
            activeOpacity={0.85}
            disabled={isImporting || !importUrl.trim()}
            onPress={handleImportPlaylist}
          >
            <Text style={styles.modalSubmitText}>
              {isImporting ? 'Aktarılıyor...' : 'İçe Aktar'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidModal>
    </View>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070708',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionBtnActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161619',
    marginHorizontal: HORIZONTAL_PADDING,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    height: '100%',
  },
  chipsContainer: {
    marginBottom: 14,
  },
  chipsScroll: {
    paddingHorizontal: HORIZONTAL_PADDING,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipActive: {
    backgroundColor: '#FFFFFF',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  chipTextActive: {
    color: '#070708',
    fontWeight: '700',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: 14,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  viewModeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 2,
  },
  viewModeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewModeBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  contentArea: {
    flex: 1,
  },
  scrollPadding: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 170,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
  },
  gridCard: {
    marginBottom: 14,
  },
  gridThumbContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#161619',
    position: 'relative',
  },
  likedSongsGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridPlayFloatingBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 4,
  },
  addPlaylistContainer: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  addPlaylistIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridMeta: {
    marginTop: 8,
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gridCardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  listContainer: {
    flex: 1,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    marginBottom: 2,
  },
  listRowThumb: {
    width: 58,
    height: 58,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRowMeta: {
    flex: 1,
    marginLeft: 12,
  },
  listRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listRowSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 3,
  },
  listPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtabHeroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: 14,
  },
  subtabHeroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtabHeroCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  subtabHeroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shuffleCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playAllCircleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  clearTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
  },
  clearTextBtnText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '600',
  },
  artistsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
  },
  artistCard: {
    width: CARD_WIDTH,
    alignItems: 'center',
    marginBottom: 18,
  },
  artistAvatarWrap: {
    width: CARD_WIDTH * 0.8,
    height: CARD_WIDTH * 0.8,
    borderRadius: (CARD_WIDTH * 0.8) / 2,
    overflow: 'hidden',
    backgroundColor: '#161619',
    marginBottom: 8,
  },
  artistAvatar: {
    width: '100%',
    height: '100%',
  },
  artistAvatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  artistCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  artistCardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  emptyCtaBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 20,
  },
  emptyCtaBtnText: {
    color: '#070708',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#161619',
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(229, 9, 20, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalSub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  modalInput: {
    width: '100%',
    backgroundColor: '#070708',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  modalCancelText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#161619',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  menuSheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 14,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    marginBottom: 6,
  },
  menuItemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  menuItemSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  menuCancelBtn: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  importLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  importLoadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});

