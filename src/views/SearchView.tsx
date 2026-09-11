import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Keyboard,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YouTubeService, TrackItem, AlbumItem } from '../services/youtubeService';
import { useMusicStore } from '../store/musicStore';
import { useLibraryStore } from '../store/libraryStore';
import { useUiStore } from '../store/uiStore';
import { TrackRow } from '../components/TrackRow';
import { SkeletonCard } from '../components/SkeletonCard';
import { Colors } from '../constants/theme';

const BROWSE_CATEGORIES = [
  { label: 'Türkçe Rap', query: 'Türkçe Rap 2024', color: '#E02424', icon: 'mic-outline' },
  { label: 'Türkçe Pop', query: 'Türkçe Pop Hit', color: '#D97706', icon: 'musical-note' },
  { label: 'Akustik & Sakin', query: 'Türkçe Akustik', color: '#059669', icon: 'cafe-outline' },
  { label: 'Gece Modu', query: 'Gece Şarkıları Derin', color: '#4F46E5', icon: 'moon-outline' },
  { label: 'Spor & Motivasyon', query: 'Workout Music Hip Hop', color: '#DC2626', icon: 'barbell-outline' },
  { label: '90lar Nostalji', query: '90lar Türkçe Pop', color: '#9333EA', icon: 'time-outline' },
  { label: 'Rock & Alternatif', query: 'Türkçe Rock Şarkıları', color: '#2563EB', icon: 'flame-outline' },
  { label: 'Odak & Çalışma', query: 'Lofi Chill Beats Study', color: '#0891B2', icon: 'book-outline' },
];

const POPULAR_TAGS = [
  'Motive',
  'Uzi',
  'Semicenk',
  'Lvbel C5',
  'BLOK3',
  'Duman',
  'Ezhel',
  'Mabel Matiz',
  'Dedublüman',
  'Köfn',
];

type SearchTab = 'all' | 'songs' | 'artists' | 'albums';

interface ArtistResultItem {
  id: string;
  name: string;
  genre: string;
  thumbnailUrl: string;
}

export const SearchView: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<TrackItem[]>([]);
  const [artistResults, setArtistResults] = useState<ArtistResultItem[]>([]);
  const [albumResults, setAlbumResults] = useState<AlbumItem[]>([]);
  const [matchedArtist, setMatchedArtist] = useState<ArtistResultItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const debounceTimer = useRef<any>(null);
  const searchRequest = useRef(0);
  const suggestionRequest = useRef(0);
  useEffect(() => () => { searchRequest.current++; suggestionRequest.current++; clearTimeout(debounceTimer.current); }, []);
  const [topCharts, setTopCharts] = useState<Array<{ title: string; items: TrackItem[] }>>([]);
  const [loadingCharts, setLoadingCharts] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoadingCharts(true);
    YouTubeService.getTopCharts()
      .then((charts) => {
        if (isMounted) {
          setTopCharts(charts);
          setLoadingCharts(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingCharts(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const { playTrack, currentTrack, isPlaying, openActionSheet } = useMusicStore();
  const { recentSearches, addRecentSearch, clearRecentSearches } = useLibraryStore();
  const { openArtist, openAlbum } = useUiStore();

  const handleQueryChange = (text: string) => {
    const request = ++suggestionRequest.current;
    searchRequest.current++;
    setLoading(false);
    setQuery(text);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!text.trim()) {
      setSuggestions([]);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const suggs = await YouTubeService.getSuggestions(text.trim());
        if (request === suggestionRequest.current) setSuggestions(suggs);
      } catch {
        if (request === suggestionRequest.current) setSuggestions([]);
      }
    }, 300);
  };

  const handleSearch = async (term: string, tabOverride?: SearchTab) => {
    if (!term.trim()) return;
    const request = ++searchRequest.current;
    suggestionRequest.current++;
    clearTimeout(debounceTimer.current);
    Keyboard.dismiss();
    setQuery(term);
    setSuggestions([]);
    setLoading(true);

    addRecentSearch(term.trim());

    const currentTab = tabOverride || activeTab;

    try {
      const q = term.trim();

      if (currentTab === 'all') {
        const [tracksRes, artistsRes, albumsRes] = await Promise.allSettled([
          YouTubeService.search(q),
          YouTubeService.searchArtists(q),
          YouTubeService.searchAlbums(q),
        ]);

        if (request !== searchRequest.current) return;
        const tracks = tracksRes.status === 'fulfilled' ? tracksRes.value : [];
        const artists = artistsRes.status === 'fulfilled' ? artistsRes.value : [];
        const albums = albumsRes.status === 'fulfilled' ? albumsRes.value : [];

        setResults(tracks);
        setArtistResults(artists);
        setAlbumResults(albums);

        if (artists.length > 0) {
          setMatchedArtist(artists[0]);
        } else {
          setMatchedArtist(null);
        }
      } else if (currentTab === 'songs') {
        const tracks = await YouTubeService.search(q);
        if (request !== searchRequest.current) return;
        setResults(tracks);
      } else if (currentTab === 'artists') {
        const artists = await YouTubeService.searchArtists(q);
        if (request !== searchRequest.current) return;
        setArtistResults(artists);
        if (artists.length > 0) {
          setMatchedArtist(artists[0]);
        }
      } else if (currentTab === 'albums') {
        const albums = await YouTubeService.searchAlbums(q);
        if (request !== searchRequest.current) return;
        setAlbumResults(albums);
      }
    } catch (e) {
      console.warn('Search error:', e);
    } finally {
      if (request === searchRequest.current) setLoading(false);
    }
  };

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
    if (!query.trim()) return;
    if (tab === 'artists' && artistResults.length === 0) {
      handleSearch(query, tab);
    } else if (tab === 'albums' && albumResults.length === 0) {
      handleSearch(query, tab);
    } else if (tab === 'songs' && results.length === 0) {
      handleSearch(query, tab);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setResults([]);
    setArtistResults([]);
    setAlbumResults([]);
    setMatchedArtist(null);
  };

  const topResult = results[0];
  const remainingResults = results.slice(1);

  const hasResults =
    results.length > 0 || artistResults.length > 0 || albumResults.length > 0 || matchedArtist !== null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
    <View style={[styles.container, { paddingTop: (insets.top || 16) + 12 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Arama</Text>
        <Text style={styles.subTitle}>Milyonlarca şarkı ve sanatçı parmaklarınızın ucunda</Text>
      </View>

      {/* Capsule Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder="Şarkı, sanatçı veya albüm ara..."
          placeholderTextColor="#666"
          value={query}
          onChangeText={handleQueryChange}
          onSubmitEditing={() => handleSearch(query)}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Live Suggestions Dropdown */}
      {suggestions.length > 0 && (
        <View style={styles.suggestionsCard}>
          {suggestions.slice(0, 5).map((sugg, idx) => (
            <TouchableOpacity
              key={`${sugg}-${idx}`}
              style={styles.suggestionItem}
              onPress={() => handleSearch(sugg)}
            >
              <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.suggestionText}>{sugg}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Filter Tabs when results are present */}
      {hasResults && (
        <View style={styles.tabFilterRow}>
          {(['all', 'songs', 'artists', 'albums'] as SearchTab[]).map((tab) => {
            const labels = { all: 'Tümü', songs: 'Şarkılar', artists: 'Sanatçılar', albums: 'Albümler' };
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => handleTabChange(tab)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {labels[tab]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Results or Browse Mode */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <SkeletonCard variant="track" />
          <SkeletonCard variant="track" />
          <SkeletonCard variant="track" />
          <SkeletonCard variant="track" />
          <SkeletonCard variant="track" />
        </View>
      ) : hasResults ? (
        activeTab === 'artists' ? (
          <FlatList
            data={artistResults}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.artistRowCard}
                activeOpacity={0.8}
                onPress={() => openArtist(item.name)}
              >
                <Image source={{ uri: item.thumbnailUrl }} style={styles.artistRowAvatar} contentFit="cover" />
                <View style={styles.artistRowInfo}>
                  <Text style={styles.artistRowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.artistRowSub}>Sanatçı • YouTube Music</Text>
                </View>
                <View style={styles.artistRowAction}>
                  <Text style={styles.artistRowActionText}>Profili Gör</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="person-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>"{query}" ile eşleşen sanatçı bulunamadı.</Text>
              </View>
            }
          />
        ) : activeTab === 'albums' ? (
          <FlatList
            data={albumResults}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.albumRowCard}
                activeOpacity={0.8}
                onPress={() => openAlbum(item.title, item.id)}
              >
                <Image source={{ uri: item.thumbnailUrl }} style={styles.albumRowThumb} contentFit="cover" />
                <View style={styles.albumRowInfo}>
                  <Text style={styles.albumRowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.albumRowSub} numberOfLines={1}>
                    {item.artist}{item.year ? ` • ${item.year}` : ''} • Albüm
                  </Text>
                </View>
                <View style={styles.albumRowAction}>
                  <Ionicons name="disc-outline" size={20} color={Colors.primary} />
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="disc-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>"{query}" ile eşleşen albüm bulunamadı.</Text>
              </View>
            }
          />
        ) : activeTab === 'songs' ? (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            renderItem={({ item, index }) => (
              <TrackRow
                track={item}
                index={index}
                isCurrent={currentTrack?.id === item.id}
                isPlaying={isPlaying}
                onPress={() => playTrack(item, results)}
                onMorePress={() => openActionSheet(item)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="musical-notes-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>"{query}" ile eşleşen şarkı bulunamadı.</Text>
              </View>
            }
          />
        ) : (
          /* activeTab === 'all' */
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            ListHeaderComponent={
              <View>
                {/* Matched Artist Hero Card */}
                {matchedArtist && (
                  <View style={styles.artistHeroSection}>
                    <Text style={styles.sectionHeader}>Sanatçı Profili</Text>
                    <TouchableOpacity
                      style={styles.artistHeroCard}
                      activeOpacity={0.85}
                      onPress={() => openArtist(matchedArtist.name)}
                    >
                      <Image
                        source={{ uri: matchedArtist.thumbnailUrl }}
                        style={styles.artistHeroAvatar}
                        contentFit="cover"
                      />
                      <View style={styles.artistHeroInfo}>
            
                        <Text style={styles.artistHeroName} numberOfLines={1}>
                          {matchedArtist.name}
                        </Text>
                        <Text style={styles.artistHeroSub}>Resmi Sanatçı Profili</Text>
                      </View>
                      <View style={styles.artistHeroAction}>
                        <Text style={styles.artistHeroActionText}>Gör</Text>
                        <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Top Song Result */}
                {topResult && (
                  <View style={styles.topResultSection}>
                    <Text style={styles.sectionHeader}>En İyi Şarkı</Text>
                    <TouchableOpacity
                      style={styles.topResultCard}
                      activeOpacity={0.8}
                      onPress={() => playTrack(topResult, results)}
                    >
                      <Image
                        source={{ uri: topResult.thumbnail }}
                        style={styles.topResultThumb}
                        contentFit="cover"
                      />
                      <View style={styles.topResultInfo}>
                        <Text style={styles.topResultTitle} numberOfLines={1}>
                          {topResult.title}
                        </Text>
                        <Text style={styles.topResultSub} numberOfLines={1}>
                          {topResult.artist} • Şarkı
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.topResultPlayBtn}
                        onPress={() => playTrack(topResult, results)}
                      >
                        <Ionicons name="play" size={20} color="#FFF" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </View>
                )}

                {results.length > 0 && (
                  <Text style={[styles.sectionHeader, { marginTop: 14 }]}>Şarkılar</Text>
                )}
              </View>
            }
            renderItem={({ item, index }) => (
              <TrackRow
                track={item}
                index={index}
                isCurrent={currentTrack?.id === item.id}
                isPlaying={isPlaying}
                onPress={() => playTrack(item, results)}
                onMorePress={() => openActionSheet(item)}
              />
            )}
            ListFooterComponent={
              albumResults.length > 0 ? (
                <View style={styles.allAlbumsSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeader}>Albümler</Text>
                    <TouchableOpacity onPress={() => handleTabChange('albums')}>
                      <Text style={styles.seeAllText}>Tümünü Gör ({albumResults.length})</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.albumsHorizontalScroll}
                  >
                    {albumResults.slice(0, 8).map((album) => (
                      <TouchableOpacity
                        key={album.id}
                        style={styles.albumHorizontalCard}
                        activeOpacity={0.8}
                        onPress={() => openAlbum(album.title, album.id)}
                      >
                        <Image
                          source={{ uri: album.thumbnailUrl }}
                          style={styles.albumHorizontalThumb}
                          contentFit="cover"
                        />
                        <Text style={styles.albumHorizontalTitle} numberOfLines={1}>
                          {album.title}
                        </Text>
                        <Text style={styles.albumHorizontalArtist} numberOfLines={1}>
                          {album.artist}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null
            }
          />
        )
      ) : (
        <ScrollView
          style={styles.browseScroll}
          contentContainerStyle={styles.browseContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        >
          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text style={styles.sectionHeader}>Son Aramalar</Text>
                <TouchableOpacity onPress={clearRecentSearches}>
                  <Text style={styles.clearRecentText}>Temizle</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.tagsGrid}>
                {recentSearches.slice(0, 6).map((term) => (
                  <TouchableOpacity
                    key={term}
                    style={styles.recentChip}
                    onPress={() => handleSearch(term)}
                  >
                    <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.recentChipText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Top Charts & Trends (FEmusic_charts) */}
          {topCharts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeader}>En Çok Dinlenen Listeler (Charts)</Text>
              {topCharts.map((chart, cIdx) => (
                <View key={`${chart.title}-${cIdx}`} style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10 }}>
                    {chart.title}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                    {chart.items.map((track) => (
                      <TouchableOpacity
                        key={track.id}
                        style={{ width: 130 }}
                        activeOpacity={0.8}
                        onPress={() => playTrack(track, chart.items)}
                      >
                        <Image
                          source={{ uri: track.thumbnail }}
                          style={{ width: 130, height: 130, borderRadius: 12, backgroundColor: Colors.card }}
                          contentFit="cover"
                        />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 6 }} numberOfLines={1}>
                          {track.title}
                        </Text>
                        <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                          {track.artist}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </View>
          )}

          {/* Popular Trends */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Popüler Trendler</Text>
            <View style={styles.tagsGrid}>
              {POPULAR_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={styles.tagChip}
                  onPress={() => handleSearch(tag)}
                >
                  <Ionicons name="trending-up" size={13} color={Colors.primary} />
                  <Text style={styles.tagText}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Browse Categories / Genres & Moods */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Hepsine Göz At</Text>
            <View style={styles.categoryGrid}>
              {BROWSE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.label}
                  style={[styles.categoryCard, { backgroundColor: cat.color }]}
                  activeOpacity={0.8}
                  onPress={() => handleSearch(cat.query)}
                >
                  <Text style={styles.categoryLabel}>{cat.label}</Text>
                  <Ionicons
                    name={cat.icon as any}
                    size={28}
                    color="rgba(255, 255, 255, 0.4)"
                    style={styles.categoryIcon}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subTitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
  },
  suggestionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    zIndex: 50,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  suggestionText: {
    color: Colors.text,
    fontSize: 14,
  },
  tabFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  loadingContainer: {
    paddingTop: 20,
    gap: 10,
  },
  topResultSection: {
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  topResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topResultInfo: {
    flex: 1,
    marginRight: 12,
  },
  topResultTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  topResultSub: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 3,
  },
  topResultPlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topResultThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    marginRight: 12,
  },
  artistHeroSection: {
    marginBottom: 16,
  },
  artistHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181C',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  artistHeroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  artistHeroInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  artistTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  artistTag: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  artistTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFD700',
  },
  ytVerifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ytVerifiedText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  artistHeroName: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
  },
  artistHeroSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  artistHeroAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  artistHeroActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  artistRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  artistRowAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  artistRowInfo: {
    flex: 1,
    marginLeft: 14,
  },
  artistRowName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  artistRowSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  artistRowAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  artistRowActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  albumRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  albumRowThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  albumRowInfo: {
    flex: 1,
    marginLeft: 14,
  },
  albumRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  albumRowSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  albumRowAction: {
    padding: 6,
  },
  allAlbumsSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  albumsHorizontalScroll: {
    paddingRight: 20,
  },
  albumHorizontalCard: {
    width: 120,
    marginRight: 12,
  },
  albumHorizontalThumb: {
    width: 120,
    height: 120,
    borderRadius: 10,
    marginBottom: 6,
  },
  albumHorizontalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  albumHorizontalArtist: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
  listContent: {
    paddingTop: 10,
    paddingBottom: 170,
  },
  browseScroll: {
    flex: 1,
  },
  browseContent: {
    paddingTop: 16,
    paddingBottom: 180,
  },
  recentSection: {
    marginBottom: 24,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  clearRecentText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recentChipText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  categoryCard: {
    width: '48%',
    height: 90,
    borderRadius: 14,
    padding: 14,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },
  categoryIcon: {
    position: 'absolute',
    right: 10,
    bottom: 8,
  },
});

