import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useUiStore } from '../store/uiStore';
import { useMusicStore } from '../store/musicStore';
import { useLibraryStore } from '../store/libraryStore';
import {
  YouTubeService,
  type ArtistReleaseItem,
  type SimilarArtistItem,
} from '../services/youtubeService';
import { Colors } from '../constants/theme';
import type { Track } from '../models';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 400;

export const ArtistDetailModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeModal, closeModal, activeArtistQuery, openArtist } = useUiStore();
  const isOpen = activeModal === 'artist';

  const { playTrack, openActionSheet } = useMusicStore();
  const { followArtist, unfollowArtist, isFollowingArtist } = useLibraryStore();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<ArtistReleaseItem[]>([]);
  const [singles, setSingles] = useState<ArtistReleaseItem[]>([]);
  const [similarArtists, setSimilarArtists] = useState<SimilarArtistItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [artistAvatar, setArtistAvatar] = useState<string | null>(null);
  const [monthlyListeners, setMonthlyListeners] = useState<string | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<string | null>(null);
  const [artistDescription, setArtistDescription] = useState<string | null>(null);
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [showAllTracks, setShowAllTracks] = useState(false);

  const artistName = activeArtistQuery || 'Sanatçı';
  const isFollowing = isFollowingArtist(artistName);

  useEffect(() => {
    if (!isOpen || !activeArtistQuery) return;

    let isMounted = true;
    setIsLoading(true);
    setArtistAvatar(null);
    setMonthlyListeners(null);
    setSubscriberCount(null);
    setArtistDescription(null);
    setAlbums([]);
    setSingles([]);
    setSimilarArtists([]);
    setIsBioExpanded(false);
    setShowAllTracks(false);

    YouTubeService.getArtistDetails(activeArtistQuery)
      .then((details) => {
        if (!isMounted) return;
        if (details) {
          if (details.thumbnailUrl) setArtistAvatar(details.thumbnailUrl);
          if (details.monthlyListeners) setMonthlyListeners(details.monthlyListeners);
          if (details.subscriberCount) setSubscriberCount(details.subscriberCount);
          if (details.description) setArtistDescription(details.description);
          if (details.albums) setAlbums(details.albums);
          if (details.singles) setSingles(details.singles);
          if (details.similarArtists) setSimilarArtists(details.similarArtists);
          if (details.tracks && details.tracks.length > 0) {
            setTracks(details.tracks);
            setIsLoading(false);
            return;
          }
        }

        // Fallback search if no tracks returned
        YouTubeService.search(`${activeArtistQuery} şarkıları`)
          .then((results) => {
            if (isMounted) {
              setTracks(results);
              setIsLoading(false);
            }
          })
          .catch(() => {
            if (isMounted) setIsLoading(false);
          });
      })
      .catch(() => {
        if (isMounted) {
          YouTubeService.search(`${activeArtistQuery} şarkıları`)
            .then((results) => {
              if (isMounted) {
                setTracks(results);
                setIsLoading(false);
              }
            })
            .catch(() => {
              if (isMounted) setIsLoading(false);
            });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeArtistQuery]);

  const handleToggleFollow = () => {
    if (isFollowing) {
      unfollowArtist(artistName);
    } else {
      followArtist({
        id: artistName,
        name: artistName,
        thumbnailUrl: artistAvatar || tracks[0]?.thumbnail || tracks[0]?.thumbnails?.medium,
      });
    }
  };

  const handlePlayAll = (shuffle = false) => {
    if (tracks.length === 0) return;
    const queueTracks = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
    playTrack(queueTracks[0], queueTracks);
  };

  const handleShareArtist = async () => {
    try {
      await Share.share({
        message: `${artistName} Voxen Music'te dinle!`,
        title: artistName,
      });
    } catch {
      // ignore
    }
  };

  const { openAlbum } = useUiStore();

  const handleSelectRelease = (item: ArtistReleaseItem) => {
    openAlbum(`${artistName} ${item.title}`, item.browseId || item.id);
  };

  const heroImage = artistAvatar || tracks[0]?.thumbnail || tracks[0]?.thumbnails?.large;
  const displayedTracks = showAllTracks ? tracks : tracks.slice(0, 5);

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={closeModal}
    >
      <View style={styles.container}>
        {/* Floating Top Navigation Bar */}
        <View style={styles.floatingNavBar}>
          <TouchableOpacity style={styles.floatingCircleBtn} onPress={closeModal} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.floatingNavRight}>
            <TouchableOpacity
              style={styles.floatingCircleBtn}
              onPress={handleShareArtist}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social-outline" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={displayedTracks}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View>
                {/* Edge-to-Edge "Sonsuz Ekran" Hero Artwork */}
                <View style={styles.heroWrap}>
                  {heroImage ? (
                    <Image source={{ uri: heroImage }} style={styles.heroImage} contentFit="cover" />
                  ) : (
                    <View style={styles.heroFallback}>
                      <Ionicons name="person" size={80} color={Colors.textMuted} />
                    </View>
                  )}

                  {/* Multi-Stop Seamless Gradient Fading to Dark Background */}
                  <LinearGradient
                    colors={[
                      'rgba(0, 0, 0, 0.65)',
                      'rgba(0, 0, 0, 0.1)',
                      'rgba(10, 10, 12, 0.35)',
                      'rgba(10, 10, 12, 0.85)',
                      Colors.background,
                    ]}
                    locations={[0, 0.25, 0.55, 0.85, 1]}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* Hero Bottom Artist Title & Meta */}
                  <View style={styles.heroContent}>
                    <View style={styles.verifiedRow}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                      <Text style={styles.verifiedText}>Doğrulanmış Sanatçı</Text>
                    </View>

                    <Text style={styles.artistBigTitle} numberOfLines={2}>
                      {artistName}
                    </Text>

                    <View style={styles.audienceWrap}>
                      {monthlyListeners ? (
                        <View style={styles.audienceChip}>
                          <Ionicons name="headset" size={13} color="rgba(255, 255, 255, 0.85)" />
                          <Text style={styles.audienceText}>
                            Aylık {monthlyListeners.replace(/\s*dinleyici/i, '')} dinleyici
                          </Text>
                        </View>
                      ) : null}

                      {subscriberCount ? (
                        <View style={styles.audienceChip}>
                          <Ionicons name="people" size={13} color="rgba(255, 255, 255, 0.85)" />
                          <Text style={styles.audienceText}>{subscriberCount} abone</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>

                {/* Actions Control Bar */}
                <View style={styles.actionRow}>
                  <View style={styles.actionLeft}>
                    <TouchableOpacity
                      style={[styles.followBtn, isFollowing && styles.followingBtn]}
                      onPress={handleToggleFollow}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={isFollowing ? 'checkmark' : 'add'}
                        size={18}
                        color={isFollowing ? Colors.textMuted : Colors.text}
                      />
                      <Text style={[styles.followText, isFollowing && styles.followingText]}>
                        {isFollowing ? 'Takip Ediliyor' : 'Takip Et'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.radioBtn}
                      onPress={() => handlePlayAll(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="radio-outline" size={18} color={Colors.text} />
                      <Text style={styles.radioText}>Radyo</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.actionRight}>
                    <TouchableOpacity
                      style={styles.shuffleBtn}
                      onPress={() => handlePlayAll(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="shuffle" size={22} color={Colors.text} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.playAllBtn}
                      onPress={() => handlePlayAll(false)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="play" size={26} color="#FFF" style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Popüler Parçalar Section Title */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeader}>Popüler Parçalar</Text>
                  {tracks.length > 0 ? (
                    <Text style={styles.sectionCountText}>{tracks.length} Parça</Text>
                  ) : null}
                </View>
              </View>
            }
            renderItem={({ item, index }) => {
              const cleanPlayCount = item.playCount
                ? item.playCount.replace(/\s*(?:kez\s*)?(?:dinlendi|görüntüleme|views)/i, '').trim()
                : null;

              return (
                <TouchableOpacity
                  style={styles.trackRow}
                  activeOpacity={0.7}
                  onPress={() => playTrack(item, tracks)}
                >
                  <Text style={styles.trackIndex}>{index + 1}</Text>
                  <Image
                    source={{ uri: item.thumbnail || item.thumbnails?.small }}
                    style={styles.trackThumb}
                    contentFit="cover"
                  />
                  <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <View style={styles.trackMetaRow}>
                      {cleanPlayCount ? (
                        <View style={styles.playCountBadge}>
                          <Ionicons name="play" size={10} color={Colors.primary} style={{ marginRight: 3 }} />
                          <Text style={styles.playCountText}>{cleanPlayCount} dinlenme</Text>
                          <Text style={styles.metaDot}>•</Text>
                        </View>
                      ) : null}
                      {item.durationFormatted ? (
                        <Text style={styles.trackDuration}>{item.durationFormatted}</Text>
                      ) : null}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.moreBtn}
                    onPress={() => openActionSheet(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
            ListFooterComponent={
              <View style={styles.footerWrap}>
                {/* Show more tracks button */}
                {tracks.length > 5 ? (
                  <TouchableOpacity
                    style={styles.showMoreTracksBtn}
                    onPress={() => setShowAllTracks(!showAllTracks)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.showMoreTracksText}>
                      {showAllTracks ? 'Daha Az Göster' : `Tüm Popüler Parçaları Gör (${tracks.length})`}
                    </Text>
                    <Ionicons
                      name={showAllTracks ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.textMuted}
                    />
                  </TouchableOpacity>
                ) : null}

                {/* Albümler (Albums Carousel) */}
                {albums.length > 0 ? (
                  <View style={styles.carouselSection}>
                    <Text style={styles.carouselTitle}>Albümler</Text>
                    <FlatList
                      data={albums}
                      keyExtractor={(item) => item.id}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.carouselList}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.albumCard}
                          activeOpacity={0.8}
                          onPress={() => handleSelectRelease(item)}
                        >
                          <Image
                            source={{ uri: item.thumbnailUrl }}
                            style={styles.albumCover}
                            contentFit="cover"
                          />
                          <Text style={styles.albumTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.albumYear}>
                            {item.year || item.subtitle || 'Albüm'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                ) : null}

                {/* Single'lar ve EP'ler */}
                {singles.length > 0 ? (
                  <View style={styles.carouselSection}>
                    <Text style={styles.carouselTitle}>Single'lar ve EP'ler</Text>
                    <FlatList
                      data={singles}
                      keyExtractor={(item) => item.id}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.carouselList}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.albumCard}
                          activeOpacity={0.8}
                          onPress={() => handleSelectRelease(item)}
                        >
                          <Image
                            source={{ uri: item.thumbnailUrl }}
                            style={styles.albumCover}
                            contentFit="cover"
                          />
                          <Text style={styles.albumTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.albumYear}>
                            {item.year || item.subtitle || 'Single'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                ) : null}

                {/* Benzer Sanatçılar (Similar Artists Carousel) */}
                {similarArtists.length > 0 ? (
                  <View style={styles.carouselSection}>
                    <Text style={styles.carouselTitle}>Hayranlar Bunu da Beğendi</Text>
                    <FlatList
                      data={similarArtists}
                      keyExtractor={(item) => item.id}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.carouselList}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.artistCard}
                          activeOpacity={0.8}
                          onPress={() => openArtist(item.name)}
                        >
                          <Image
                            source={{ uri: item.thumbnailUrl }}
                            style={styles.artistAvatar}
                            contentFit="cover"
                          />
                          <Text style={styles.artistCardName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {item.subscribers ? (
                            <Text style={styles.artistCardSub} numberOfLines={1}>
                              {item.subscribers}
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                ) : null}

                {/* Sanatçı Hakkında (Bio Card) */}
                {artistDescription ? (
                  <View style={styles.bioSection}>
                    <View style={styles.bioHeaderRow}>
                      <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
                      <Text style={styles.bioTitle}>Sanatçı Hakkında</Text>
                    </View>

                    <Text style={styles.bioText} numberOfLines={isBioExpanded ? undefined : 4}>
                      {artistDescription}
                    </Text>

                    {artistDescription.length > 180 ? (
                      <TouchableOpacity
                        onPress={() => setIsBioExpanded(!isBioExpanded)}
                        style={styles.bioToggleBtn}
                      >
                        <Text style={styles.bioToggleText}>
                          {isBioExpanded ? 'Daha Az Göster' : 'Devamını Oku'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}

                <View style={{ height: 60 }} />
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  floatingNavBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingNavRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    zIndex: 5,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.2,
  },
  artistBigTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.5,
    lineHeight: 42,
  },
  audienceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  audienceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  audienceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.background,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderColor: Colors.border,
  },
  followText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  followingText: {
    color: Colors.textMuted,
  },
  radioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  radioText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  actionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shuffleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playAllBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  sectionHeader: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.text,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  listContent: {
    paddingBottom: 40,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  trackIndex: {
    width: 24,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  trackThumb: {
    width: 46,
    height: 46,
    borderRadius: 8,
    marginRight: 12,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  trackMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  playCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playCountText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 12,
    color: Colors.textMuted,
    marginHorizontal: 5,
  },
  trackDuration: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  moreBtn: {
    padding: 8,
  },
  footerWrap: {
    marginTop: 10,
  },
  showMoreTracksBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
    marginBottom: 20,
  },
  showMoreTracksText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  carouselSection: {
    marginBottom: 28,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  carouselList: {
    paddingHorizontal: 16,
    gap: 14,
  },
  albumCard: {
    width: 140,
  },
  albumCover: {
    width: 140,
    height: 140,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    marginBottom: 8,
  },
  albumTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  albumYear: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  artistCard: {
    width: 90,
    alignItems: 'center',
  },
  artistAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    marginBottom: 8,
  },
  artistCardName: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  artistCardSub: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  bioSection: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
    padding: 18,
    borderRadius: 18,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bioHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  bioTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  bioText: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  bioToggleBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  bioToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
});

