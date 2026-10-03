import { recommendationFeedback } from '../services/recommendations/recommendationFeedback';
import { trackArtwork } from '../utils/artwork';
import { audioCacheService } from '../services/audioCacheService';
import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YouTubeService, HomeSection, TrackItem, PodcastChannel } from '../services/youtubeService';
import { useMusicStore } from '../store/musicStore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useSocialStore } from '../store/socialStore';
import { mixGenerator, DailyMix } from '../services/recommendations/mixGenerator';
import { useSettingsStore } from '../store/settingsStore';
import { useLibraryStore } from '../store/libraryStore';
import { recommendationService, spreadArtists } from '../services/recommendations/recommendationService';
import { Colors } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_DESKTOP = Platform.OS === 'web' && process.env.EXPO_PUBLIC_VOXEN_DESKTOP === '1';
const COLUMN_WIDTH = IS_DESKTOP ? 330 : Math.min(SCREEN_WIDTH * 0.88, 340);

export const HomeView: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [dailyMixes, setDailyMixes] = useState<DailyMix[]>([]);
  const [podcasts, setPodcasts] = useState<PodcastChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failedArtwork, setFailedArtwork] = useState<Set<string>>(() => new Set());
  const hideArtwork = (id: string) => setFailedArtwork(previous => new Set(previous).add(id));
  const visibleTrack = (track: TrackItem) => !!trackArtwork(track) && !failedArtwork.has(track.id);

  const { playTrack, currentTrack, isPlaying, openActionSheet, openPlaylistDetail, favorites, history } = useMusicStore();
  const { user } = useAuthStore();
  const preferredGenres = useSettingsStore(state => state.preferredGenres);
  const followedArtists = useLibraryStore(state => state.followedArtists);
  const requestId = useRef(0);
  const tasteKey = JSON.stringify([preferredGenres, followedArtists.map(a => a.name), favorites.slice(0, 20).map(t => t.id)]);
  const { openModal, setActiveTab, openPodcast } = useUiStore();
  const { unreadCount, activeRoom } = useSocialStore();

  const handleOpenMix = (mix: DailyMix) => {
    openPlaylistDetail({
      id: mix.id,
      name: `${mix.label}: ${mix.genre}`,
      description: mix.description || `Günün sana özel hazırlanan ${mix.genre} miksi (${mix.tracks.length} parça).`,
      visibility: 'private',
      collaborative: false,
      tracks: mix.tracks,
      trackCount: mix.tracks.length,
      totalDuration: mix.tracks.reduce((acc, t) => acc + (t.duration || 0), 0),
      coverUrl: mix.coverUrl || mix.tracks[0]?.thumbnail,
      createdAt: mix.generatedAt,
      updatedAt: mix.generatedAt,
    });
  };

  const [feedbackRevision, setFeedbackRevision] = useState(0);
  const discoveryVariety = useSettingsStore(state => state.discoveryVariety);
  useEffect(() => recommendationFeedback.subscribe(() => setFeedbackRevision(value => value + 1)), []);

  const loadFeed = async (isRefresh = false) => {
    const id = ++requestId.current;
    try {
      await Promise.allSettled([
        Promise.all([
          recommendationService.getDiscoveryFeed(favorites, history, followedArtists.map(a => a.name), preferredGenres),
          history.length || favorites.length ? recommendationService.getPersonalizedSections(favorites, history) : YouTubeService.getHomeFeed(),
          recommendationFeedback.load(),
        ]).then(([feed, homeFeed, feedback]) => {
          if (id !== requestId.current) return;
          const seen = new Set(feed.map(track => track.id));
          const richSections = (Array.isArray(homeFeed) ? homeFeed : [])
            .map(section => ({ ...section, items: spreadArtists(section.items.filter(track => !seen.has(track.id) && recommendationFeedback.allowed(track, feedback))) }))
            .filter(section => section.items.length >= 4)
            .slice(0, 7);
          setSections([{ title: 'Hızlı Seçimler', items: feed }, ...richSections]);
          if (IS_DESKTOP) {
            const first = feed.find(track => !!trackArtwork(track));
            if (first) void audioCacheService.prefetchNext(first.videoId || first.id);
          }
          setLoading(false);
        }),
        mixGenerator.getDailyMixes(preferredGenres, followedArtists.map(a => a.name), favorites, isRefresh).then(mixes => {
          if (id === requestId.current) setDailyMixes(mixes);
        }),
        YouTubeService.getPodcasts().then(items => {
          if (id === requestId.current) setPodcasts(items);
        }),
      ]);
    } catch (err) {
      console.warn('Home feed error:', err);
    } finally {
      if (id !== requestId.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadFeed();
    return () => { requestId.current += 1; };
  }, [user?.uid, IS_DESKTOP ? '' : tasteKey, IS_DESKTOP ? 0 : feedbackRevision, IS_DESKTOP ? '' : discoveryVariety]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadFeed(true);
  };

  // Quick picks
  const quickPicks = (sections.find((s) => s.title === 'Hızlı Seçimler')?.items || []).filter(visibleTrack);

  // Chunk quickPicks into 4-song columns for horizontal grid
  const quickPickColumns: TrackItem[][] = [];
  for (let i = 0; i < quickPicks.length; i += 4) {
    quickPickColumns.push(quickPicks.slice(i, i + 4));
  }

  // Daily discover track
  const dailyDiscoverTrack = quickPicks[0] || sections.flatMap(section => section.items).find(visibleTrack);
  const recentTracks = history.filter((track, index, all) => visibleTrack(track) && all.findIndex(item => item.id === track.id) === index).slice(0, 20);
  const recentColumns: TrackItem[][] = [];
  for (let i = 0; i < recentTracks.length; i += 2) recentColumns.push(recentTracks.slice(i, i + 2));

  // Remaining carousel sections (excluding quick picks, and definitely excluding Dinlemeye Devam Et)
  const carouselSections = sections.map(section => ({ ...section, items: section.items.filter(visibleTrack) })).filter(section => section.items.length > 0).filter(
    (s) => s.title !== 'Hızlı Seçimler' && s.title !== 'Dinlemeye Devam Et'
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          IS_DESKTOP && styles.desktopScrollContent,
          { paddingTop: IS_DESKTOP ? 28 : (insets.top || 16) + 10, paddingBottom: IS_DESKTOP ? 136 : 170 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={IS_DESKTOP ? undefined :
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Top Header */}
        <View style={styles.headerRow}>
          <View>
            <View style={styles.brandRow}>
              <Text style={styles.brandText}>{IS_DESKTOP ? 'Senin için' : 'VOXEN'}</Text>
              {!IS_DESKTOP && <View style={styles.brandDot} />}
            </View>
            <Text style={styles.subBrand}>{IS_DESKTOP ? 'Bugünün seçkileri ve kaldığın yer' : 'Sınırsız & Reklamsız Müzik'}</Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[
                styles.headerActionBtn,
                activeRoom ? styles.headerActionBtnLive : null,
              ]}
              activeOpacity={0.7}
              onPress={() => openModal('listeningRoom')}
            >
              <Ionicons
                name={activeRoom ? 'radio' : 'radio-outline'}
                size={17}
                color={activeRoom ? Colors.success : Colors.textSecondary}
              />
              {activeRoom && <View style={styles.liveGreenDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerActionBtn}
              activeOpacity={0.7}
              onPress={() => openModal('notifications')}
            >
              <Ionicons name="notifications-outline" size={17} color={Colors.textSecondary} />
              {unreadCount > 0 && <View style={styles.notificationBadge} />}
            </TouchableOpacity>

            {!IS_DESKTOP && <TouchableOpacity
              style={styles.headerActionBtn}
              activeOpacity={0.7}
              onPress={() => openModal('settings')}
            >
              <Ionicons name="settings-outline" size={17} color={Colors.textSecondary} />
            </TouchableOpacity>}

            {!IS_DESKTOP && <TouchableOpacity
              style={styles.profileBtn}
              activeOpacity={0.7}
              onPress={() => setActiveTab('profile')}
            >
              {user?.photoURL ? (
                <Image
                  source={{ uri: user.photoURL }}
                  style={{ width: 26, height: 26, borderRadius: 13 }}
                  contentFit="cover"
                />
              ) : (
                <Ionicons
                  name={user ? 'person-circle' : 'person-outline'}
                  size={20}
                  color={user ? Colors.primary : Colors.textSecondary}
                />
              )}
            </TouchableOpacity>}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Müzik dünyası hazırlanıyor...</Text>
          </View>
        ) : (
          <>
            {/* Section 1: Hızlı Seçimler (Quick Picks) - Metrolist 4-Row Horizontal Grid */}
            {quickPicks.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.navTitleRow}>
                  <View style={styles.navTitleLeft}>
                    <Text style={styles.navLabel}>DİNLENENLERE GÖRE</Text>
                    <View style={styles.navTitleHeading}>
                      <View style={styles.redBar} />
                      <Text style={styles.navTitleText}>Hızlı Seçimler</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.playAllBtn}
                    activeOpacity={0.75}
                    onPress={() => {
                      if (quickPicks[0]) playTrack(quickPicks[0], quickPicks);
                    }}
                  >
                    <Ionicons name="play" size={12} color={Colors.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.playAllText}>Tümünü Çal</Text>
                  </TouchableOpacity>
                </View>

                {/* Horizontal Paged 4-row Column Grid */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={COLUMN_WIDTH + 14}
                  contentContainerStyle={styles.quickPicksGrid}
                >
                  {quickPickColumns.map((col, colIdx) => (
                    <View key={colIdx} style={[styles.quickPickColumn, { width: COLUMN_WIDTH }]}>
                      {col.map((item) => {
                        const isThisPlaying = currentTrack?.id === item.id;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[
                              styles.songListItem,
                              isThisPlaying && styles.songListItemActive,
                            ]}
                            activeOpacity={0.7}
                            onPress={() => playTrack(item, quickPicks)}
                          >
                            <View style={styles.thumbWrapper}>
                              <Image
                                source={{ uri: trackArtwork(item) }}
                                onError={() => hideArtwork(item.id)}
                                style={styles.thumb}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={150}
                              />
                              {isThisPlaying && (
                                <View style={styles.thumbPlayingOverlay}>
                                  <Ionicons
                                    name={isPlaying ? 'volume-high' : 'pause'}
                                    size={14}
                                    color="#FFFFFF"
                                  />
                                </View>
                              )}
                            </View>

                            <View style={styles.songMeta}>
                              <Text
                                style={[
                                  styles.songTitle,
                                  isThisPlaying && styles.songTitleActive,
                                ]}
                                numberOfLines={1}
                              >
                                {item.title}
                              </Text>
                              <Text style={styles.songSubtitle} numberOfLines={1}>
                                {item.durationFormatted && !item.artist.includes(item.durationFormatted)
                                  ? `${item.artist} • ${item.durationFormatted}`
                                  : item.artist}
                              </Text>
                            </View>

                            <TouchableOpacity
                              style={styles.trailingBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              onPress={() => openActionSheet(item)}
                            >
                              <Ionicons
                                name="ellipsis-vertical"
                                size={18}
                                color={Colors.textMuted}
                              />
                            </TouchableOpacity>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Section 2: Günün Keşfi (Daily Discover) Hero Banner */}
            {dailyDiscoverTrack && (
              <View style={styles.sectionBlock}>
                <View style={styles.navTitleRow}>
                  <View style={styles.navTitleLeft}>
                    <Text style={styles.navLabel}>ÖNERİ</Text>
                    <View style={styles.navTitleHeading}>
                      <View style={styles.redBar} />
                      <Text style={styles.navTitleText}>Günün Keşfi</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.heroCard}
                  activeOpacity={0.9}
                  onPress={() => playTrack(dailyDiscoverTrack, quickPicks)}
                >
                  <Image
                    source={{ uri: trackArtwork(dailyDiscoverTrack, true) }}
                    style={styles.heroBg}
                    onError={() => hideArtwork(dailyDiscoverTrack.id)}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <LinearGradient
                    colors={IS_DESKTOP
                      ? ['#0D0D11', 'rgba(13, 13, 17, 0.92)', 'rgba(13, 13, 17, 0.55)', 'rgba(13, 13, 17, 0.10)']
                      : ['rgba(0,0,0,0.2)', 'rgba(11,11,11,0.75)', '#0B0B0B']
                    }
                    start={IS_DESKTOP ? { x: 0, y: 0 } : undefined}
                    end={IS_DESKTOP ? { x: 0.70, y: 0 } : undefined}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={[styles.heroContent, IS_DESKTOP && styles.desktopHeroContent]}>
                    {IS_DESKTOP && (
                      <View style={styles.heroBadge}>
                        <Ionicons name="sparkles" size={13} color={Colors.primary} />
                        <Text style={styles.heroBadgeText}>ÖNE ÇIKAN KEŞİF</Text>
                      </View>
                    )}
                    <Text style={[styles.heroTitle, IS_DESKTOP && styles.desktopHeroTitle]} numberOfLines={1}>
                      {dailyDiscoverTrack.title}
                    </Text>
                    <Text style={[styles.heroArtist, IS_DESKTOP && styles.desktopHeroArtist]} numberOfLines={1}>
                      {dailyDiscoverTrack.artist}
                    </Text>
                    <View style={[styles.heroPlayBtn, IS_DESKTOP && styles.desktopHeroPlayBtn]}>
                      <Ionicons name="play" size={IS_DESKTOP ? 18 : 16} color="#FFFFFF" style={{ marginLeft: 2 }} />
                      <Text style={[styles.heroPlayText, IS_DESKTOP && styles.desktopHeroPlayText]}>Şimdi Dinle</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {recentTracks.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.navTitleRow}>
                  <View style={styles.navTitleLeft}>
                    <Text style={styles.navLabel}>KALDIĞIN YERDEN</Text>
                    <View style={styles.navTitleHeading}>
                      <View style={styles.redBar} />
                      <Text style={styles.navTitleText}>Tekrar Dinle</Text>
                      <Text style={styles.recentCount}>{recentTracks.length}</Text>
                    </View>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
                  {recentColumns.map((column, index) => (
                    <View key={index} style={styles.recentColumn}>
                      {column.map(track => {
                        const active = currentTrack?.id === track.id;
                        return (
                          <TouchableOpacity key={track.id} style={[styles.recentCard, active && styles.recentCardActive]} activeOpacity={0.82} onPress={() => playTrack(track, recentTracks)}>
                            <Image source={{ uri: trackArtwork(track) }} onError={() => hideArtwork(track.id)} style={styles.recentCover} contentFit="cover" cachePolicy="memory-disk" />
                            <View style={styles.recentMeta}>
                              <Text style={[styles.recentTitle, active && styles.recentTitleActive]} numberOfLines={1}>{track.title}</Text>
                              <Text style={styles.recentArtist} numberOfLines={1}>{track.artist || track.artistName}</Text>
                            </View>
                            <Ionicons name={active && isPlaying ? 'volume-high' : 'play'} size={16} color={active ? Colors.primary : Colors.textMuted} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Section: Günün Miksleri (Daily Mixes) */}
            {dailyMixes.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.navTitleRow}>
                  <View style={styles.navTitleLeft}>
                    <Text style={styles.navLabel}>SANA ÖZEL</Text>
                    <View style={styles.navTitleHeading}>
                      <View style={styles.redBar} />
                      <Text style={styles.navTitleText}>Günün Miksleri</Text>
                    </View>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalRow}
                >
                  {dailyMixes.filter(mix => (mix.coverUrl || trackArtwork(mix.tracks[0] || { thumbnail: '' })) && !failedArtwork.has(mix.id)).map((mix, idx) => {
                    const mixThumb = mix.coverUrl || mix.tracks[0]?.thumbnail;
                    const artists = [...new Set(mix.tracks.map(track => track.artist || track.artistName).filter(Boolean))].slice(0, 3).join(' • ');
                    return (
                      <TouchableOpacity
                        key={mix.id}
                        style={[styles.dailyMixCard, idx === 0 && styles.dailyMixCardFeatured]}
                        activeOpacity={0.88}
                        onPress={() => handleOpenMix(mix)}
                      >
                        {mixThumb ? <Image source={{ uri: mixThumb }} onError={() => hideArtwork(mix.id)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
                        <LinearGradient
                          colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.48)', idx === 0 ? 'rgba(120,4,12,0.96)' : 'rgba(10,10,14,0.98)']}
                          locations={[0, 0.48, 1]}
                          style={styles.dailyMixGradient}
                        >
                          <View style={styles.dailyMixHeader}>
                            <View style={styles.mixMoodBadge}>
                              <Ionicons name={idx === 0 ? 'sparkles' : 'headset'} size={11} color="#FFFFFF" />
                              <Text style={styles.mixMoodText}>{mix.mood || 'Sana özel'}</Text>
                            </View>
                            <TouchableOpacity style={styles.dailyMixPlayPill} onPress={() => mix.tracks[0] && playTrack(mix.tracks[0], mix.tracks)}>
                              <Ionicons name="play" size={15} color="#FFFFFF" />
                            </TouchableOpacity>
                          </View>
                          <View style={styles.dailyMixBottom}>
                            <Text style={styles.dailyMixGenre} numberOfLines={1}>{mix.genre}</Text>
                            <Text style={styles.dailyMixLabel} numberOfLines={1}>{mix.label}</Text>
                            <Text style={styles.dailyMixArtists} numberOfLines={2}>{artists}</Text>
                            <View style={styles.dailyMixMetaRow}>
                              <Text style={styles.dailyMixCount}>{mix.tracks.length} parça</Text>
                              <View style={styles.mixMetaDot} />
                              <Text style={styles.dailyMixCount}>Her gün yenilenir</Text>
                            </View>
                          </View>
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Section: Popüler Podcast'ler */}
            {podcasts.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.navTitleRow}>
                  <View style={styles.navTitleLeft}>
                    <Text style={styles.navLabel}>GÜNDEM VE SOHBET</Text>
                    <View style={styles.navTitleHeading}>
                      <View style={styles.redBar} />
                      <Text style={styles.navTitleText}>Popüler Podcast'ler</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.seeAllBtn}
                    activeOpacity={0.7}
                    onPress={() => openModal('podcasts')}
                  >
                    <Text style={styles.seeAllText}>Tümü</Text>
                    <Ionicons name="chevron-forward" size={13} color={Colors.primary} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalRow}
                >
                  {podcasts.filter(podcast => podcast.thumbnailUrl && !failedArtwork.has(podcast.id)).map((podcast) => (
                    <TouchableOpacity
                      key={podcast.id}
                      style={styles.podcastCard}
                      activeOpacity={0.8}
                      onPress={() => openPodcast(podcast)}
                    >
                      <Image
                        source={{ uri: podcast.thumbnailUrl }}
                        onError={() => hideArtwork(podcast.id)}
                        style={styles.podcastCover}
                        contentFit="cover"
                        transition={150}
                      />
                      <Text style={styles.podcastTitle} numberOfLines={2}>
                        {podcast.title}
                      </Text>
                      <Text style={styles.podcastSubtitle} numberOfLines={1}>
                        {podcast.subtitle || 'Podcast'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Deep Extended Sections (All rich music categories) */}
            {carouselSections.map((sec, secIdx) => (
              <View key={`${sec.title}-${secIdx}`} style={styles.sectionBlock}>
                <View style={styles.navTitleRow}>
                  <View style={styles.navTitleLeft}>
                    <View style={styles.navTitleHeading}>
                      <View style={styles.redBar} />
                      <Text style={styles.navTitleText}>{sec.title}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.playAllBtn}
                    onPress={() => {
                      if (sec.items[0]) playTrack(sec.items[0], sec.items);
                    }}
                  >
                    <Ionicons name="play" size={12} color={Colors.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.playAllText}>Tümünü Çal</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalRow}
                >
                  {sec.items.map((item) => {
                    const isThisPlaying = currentTrack?.id === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.trackCard, secIdx % 3 === 0 && styles.trackCardWide, secIdx % 3 === 1 && styles.trackCardTall]}
                        activeOpacity={0.8}
                        onPress={() => playTrack(item, sec.items)}
                      >
                        <View style={[styles.cardCoverWrapper, secIdx % 3 === 0 && styles.cardCoverWide, secIdx % 3 === 1 && styles.cardCoverTall]}>
                          <Image
                            source={{ uri: trackArtwork(item) }}
                            onError={() => hideArtwork(item.id)}
                            style={styles.cardCover}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={150}
                          />
                          {isThisPlaying && (
                            <View style={styles.playingBadge}>
                              <Ionicons
                                name={isPlaying ? 'volume-high' : 'pause'}
                                size={14}
                                color="#FFFFFF"
                              />
                            </View>
                          )}
                          <TouchableOpacity
                            style={styles.cardDotsBtn}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            onPress={() => openActionSheet(item)}
                          >
                            <Ionicons name="ellipsis-horizontal" size={16} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.cardArtist} numberOfLines={1}>
                          {item.artist}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0B',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  desktopScrollContent: {
    paddingHorizontal: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginLeft: 4,
    marginBottom: 4,
  },
  subBrand: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerActionBtnLive: {
    backgroundColor: 'rgba(52, 199, 89, 0.18)',
    borderColor: Colors.success,
    borderWidth: 1.5,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  liveGreenDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.success,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.primary,
  },
  profileBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionBlock: {
    marginBottom: 26,
  },
  navTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navTitleLeft: {
    flex: 1,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  navTitleHeading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  redBar: {
    width: 3.5,
    height: 18,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginRight: 8,
  },
  navTitleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.45)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  playAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  quickPicksGrid: {
    gap: 14,
  },
  quickPickColumn: {
    gap: 6,
  },
  songListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  songListItemActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
  },
  thumbWrapper: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    position: 'relative',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlayingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(229, 9, 20, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songMeta: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  songTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  songTitleActive: {
    color: Colors.primary,
  },
  songSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 3,
  },
  trailingBtn: {
    padding: 6,
  },
  heroCard: {
    height: IS_DESKTOP ? 280 : 185,
    borderRadius: IS_DESKTOP ? 24 : 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroBg: {
    width: '100%',
    height: '100%',
  },
  heroContent: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    right: 16,
  },
  desktopHeroContent: {
    left: 36,
    bottom: 32,
    right: 'auto',
    maxWidth: 580,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(229, 9, 20, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.36)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  desktopHeroTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroArtist: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: 10,
  },
  desktopHeroArtist: {
    fontSize: 15,
    marginTop: 4,
    marginBottom: 16,
  },
  heroPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    gap: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  desktopHeroPlayBtn: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 22,
  },
  heroPlayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  desktopHeroPlayText: {
    fontSize: 14,
  },
  horizontalRow: {
    gap: 14,
  },
  trackCard: {
    width: 132,
  },
  trackCardWide: {
    width: 208,
  },
  trackCardTall: {
    width: 154,
  },
  cardCoverWrapper: {
    width: '100%',
    height: 132,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    position: 'relative',
  },
  cardCoverWide: {
    height: 128,
    borderRadius: 18,
  },
  cardCoverTall: {
    height: 178,
    borderRadius: 18,
  },
  cardCover: {
    width: '100%',
    height: '100%',
  },
  playingBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: Colors.primary,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDotsBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 8,
  },
  cardArtist: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.textMuted,
  },
  dailyMixCard: {
    width: 174,
    height: 206,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dailyMixCardFeatured: {
    width: 246,
  },
  dailyMixGradient: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  dailyMixHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mixMoodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  mixMoodText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  dailyMixPlayPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(229, 9, 20, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyMixBottom: {
    marginTop: 'auto',
  },
  dailyMixGenre: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  dailyMixLabel: {
    fontSize: 19,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  dailyMixArtists: {
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 5,
    minHeight: 30,
  },
  dailyMixMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  mixMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginHorizontal: 6,
  },
  dailyMixCount: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.58)',
    fontWeight: '600',
  },
  recentCard: {
    width: IS_DESKTOP ? 320 : Math.min(SCREEN_WIDTH * 0.78, 310),
    height: 64,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentColumn: {
    gap: 7,
  },
  recentCardActive: {
    backgroundColor: 'rgba(229,9,20,0.1)',
  },
  recentCover: {
    width: 52,
    height: 52,
    borderRadius: 9,
    backgroundColor: Colors.card,
  },
  recentMeta: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  recentTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  recentTitleActive: {
    color: Colors.primary,
  },
  recentArtist: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  recentCount: {
    marginLeft: 8,
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  podcastCard: {
    width: 140,
    marginRight: 14,
  },
  podcastCover: {
    width: 140,
    height: 140,
    borderRadius: 14,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 8,
  },
  podcastTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 17,
  },
  podcastSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginRight: 2,
  },
});
