import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useUiStore } from '../store/uiStore';
import { useMusicStore } from '../store/musicStore';
import { YouTubeService, PodcastChannel, PodcastEpisode } from '../services/youtubeService';
import { Colors } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_SIZE = (SCREEN_W - 48) / 2;

export const PodcastsModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeModal, closeModal, activePodcastData } = useUiStore();
  const { setQueue } = useMusicStore();
  const isOpen = activeModal === 'podcasts';

  const requestId = useRef(0);
  const [channels, setChannels] = useState<PodcastChannel[]>([]);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<PodcastChannel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);

  // Load podcast channels or open directly into activePodcastData
  useEffect(() => {
    const request = ++requestId.current;
    if (!isOpen) return;
    if (activePodcastData) {
      setSelectedChannel(activePodcastData);
      setIsLoadingEpisodes(true);
      setEpisodes([]);
      YouTubeService.getPodcastEpisodes(activePodcastData.browseId)
        .then(items => { if (request === requestId.current) setEpisodes(items); })
        .finally(() => { if (request === requestId.current) setIsLoadingEpisodes(false); });
    } else {
      setIsLoading(true);
      setSelectedChannel(null);
      setEpisodes([]);
      YouTubeService.getPodcasts()
        .then(setChannels)
        .finally(() => setIsLoading(false));
    }
    return () => { requestId.current++; };
  }, [isOpen, activePodcastData]);

  // Load episodes when a channel is selected
  const handleSelectChannel = useCallback(async (channel: PodcastChannel) => {
    const request = ++requestId.current;
    setSelectedChannel(channel);
    setIsLoadingEpisodes(true);
    setEpisodes([]);
    const eps = await YouTubeService.getPodcastEpisodes(channel.browseId);
    if (request !== requestId.current) return;
    setEpisodes(eps);
    setIsLoadingEpisodes(false);
  }, []);

  const handlePlayEpisode = useCallback((episode: PodcastEpisode) => {
    const channelName = selectedChannel?.title || 'Podcast';
    const queueTracks = episodes.map((ep) => ({
      id: ep.videoId,
      videoId: ep.videoId,
      title: ep.title,
      artist: channelName,
      artistName: channelName,
      artists: [{ name: channelName }],
      thumbnail: ep.thumbnailUrl,
      thumbnails: {
        small: ep.thumbnailUrl,
        medium: ep.thumbnailUrl,
        large: ep.thumbnailUrl,
      },
      source: 'youtube' as const,
    }));

    const startIndex = queueTracks.findIndex((t) => t.id === episode.videoId);
    setQueue(queueTracks, startIndex >= 0 ? startIndex : 0);
    closeModal();
  }, [selectedChannel, episodes, setQueue, closeModal]);

  const handleBack = useCallback(() => {
    requestId.current++;
    setSelectedChannel(null);
    setEpisodes([]);
    if (channels.length === 0) {
      setIsLoading(true);
      YouTubeService.getPodcasts()
        .then(setChannels)
        .finally(() => setIsLoading(false));
    }
  }, [channels.length]);

  const renderChannel = ({ item }: { item: PodcastChannel }) => (
    <TouchableOpacity
      style={styles.channelCard}
      onPress={() => handleSelectChannel(item)}
      activeOpacity={0.75}
    >
      <Image
        source={{ uri: item.thumbnailUrl }}
        style={styles.channelThumb}
        contentFit="cover"
      />
      <Text style={styles.channelTitle} numberOfLines={2}>{item.title}</Text>
      {item.subtitle ? (
        <Text style={styles.channelSub} numberOfLines={1}>{item.subtitle}</Text>
      ) : null}
    </TouchableOpacity>
  );

  const renderEpisode = ({ item }: { item: PodcastEpisode }) => (
    <TouchableOpacity
      style={styles.episodeRow}
      onPress={() => handlePlayEpisode(item)}
      activeOpacity={0.75}
    >
      <Image
        source={{ uri: item.thumbnailUrl }}
        style={styles.episodeThumb}
        contentFit="cover"
      />
      <View style={styles.episodeInfo}>
        <Text style={styles.episodeTitle} numberOfLines={2}>{item.title}</Text>
        {item.meta ? (
          <Text style={styles.episodeMeta} numberOfLines={1}>{item.meta}</Text>
        ) : null}
      </View>
      <Pressable style={styles.playBtn} onPress={() => handlePlayEpisode(item)}>
        <Ionicons name="play" size={18} color={Colors.primary} />
      </Pressable>
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
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal} />

        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            {selectedChannel ? (
              <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={22} color={Colors.text} />
              </TouchableOpacity>
            ) : (
              <View style={styles.handle} />
            )}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {selectedChannel ? selectedChannel.title : '🎙️ Podcast'}
            </Text>
            <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Channels grid */}
          {!selectedChannel && (
            isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.loadingText}>Podcast kanalları yükleniyor…</Text>
              </View>
            ) : (
              <FlatList
                data={channels}
                keyExtractor={(ch) => ch.id}
                renderItem={renderChannel}
                numColumns={2}
                columnWrapperStyle={styles.columnWrapper}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Text style={styles.emptyText}>Podcast bulunamadı</Text>
                  </View>
                }
              />
            )
          )}

          {/* Episodes list */}
          {selectedChannel && (
            isLoadingEpisodes ? (
              <View style={styles.center}>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.loadingText}>Bölümler yükleniyor…</Text>
              </View>
            ) : (
              <FlatList
                data={episodes}
                keyExtractor={(ep) => ep.id}
                renderItem={renderEpisode}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Text style={styles.emptyText}>Bu kanalda bölüm bulunamadı</Text>
                  </View>
                }
              />
            )
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    height: '88%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.textMuted,
    borderRadius: 2,
    opacity: 0.4,
    alignSelf: 'center',
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceElevated,
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 48,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  channelCard: {
    width: CARD_SIZE,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    overflow: 'hidden',
  },
  channelThumb: {
    width: CARD_SIZE,
    height: CARD_SIZE,
  },
  channelTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    padding: 8,
    paddingBottom: 2,
  },
  channelSub: {
    fontSize: 11,
    color: Colors.textMuted,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    marginBottom: 8,
    padding: 10,
  },
  episodeThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  episodeInfo: {
    flex: 1,
    marginHorizontal: 10,
  },
  episodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  episodeMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 3,
  },
  playBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,59,48,0.12)',
    borderRadius: 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 12,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
});

