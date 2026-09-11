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
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useUiStore } from '../store/uiStore';
import { useMusicStore } from '../store/musicStore';
import { YouTubeService } from '../services/youtubeService';
import { Colors } from '../constants/theme';
import type { Track } from '../models';

export const AlbumDetailModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeModal, closeModal, activeAlbumQuery, activeAlbumId } = useUiStore();
  const isOpen = activeModal === 'album';

  const { playTrack, openActionSheet, setSourceContext } = useMusicStore();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const albumTitle = activeAlbumQuery || 'Albüm';

  useEffect(() => {
    if (!isOpen || !activeAlbumQuery) return;

    let isMounted = true;
    setIsLoading(true);
    setTracks([]);

    YouTubeService.getAlbum(activeAlbumQuery, activeAlbumId || undefined)
      .then((results) => {
        if (isMounted) {
          setTracks(results?.tracks || []);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeAlbumQuery, activeAlbumId]);

  const handlePlayAll = (shuffle = false) => {
    if (tracks.length === 0) return;
    setSourceContext({ type: 'album', id: albumTitle });
    const queueTracks = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
    playTrack(queueTracks[0], queueTracks);
  };

  const coverImage = tracks[0]?.thumbnail || tracks[0]?.thumbnails?.large;
  const artistName = tracks[0]?.artist || tracks[0]?.artistName || 'Çeşitli Sanatçılar';

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={closeModal}
    >
      <View style={styles.container}>
        {/* Navigation Bar */}
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.backBtn} onPress={closeModal}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>
            {albumTitle}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <View style={styles.headerComponent}>
                {/* Album Cover & Info */}
                <View style={styles.coverWrapper}>
                  {coverImage ? (
                    <Image source={{ uri: coverImage }} style={styles.coverImage} contentFit="cover" />
                  ) : (
                    <View style={styles.coverFallback}>
                      <Ionicons name="disc-outline" size={64} color={Colors.textMuted} />
                    </View>
                  )}
                </View>

                <Text style={styles.albumTitleText} numberOfLines={2}>
                  {albumTitle}
                </Text>
                <Text style={styles.albumArtistText} numberOfLines={1}>
                  {artistName}
                </Text>
                <Text style={styles.albumMetaText}>
                  Albüm • {tracks.length} parça
                </Text>

                {/* Actions: Play & Shuffle */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.shuffleBtn}
                    onPress={() => handlePlayAll(true)}
                  >
                    <Ionicons name="shuffle" size={22} color={Colors.text} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.playAllBtn}
                    onPress={() => handlePlayAll(false)}
                  >
                    <Ionicons name="play" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>

                <View style={styles.divider} />
              </View>
            }
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={styles.trackRow}
                activeOpacity={0.7}
                onPress={() => {
                  setSourceContext({ type: 'album', id: albumTitle });
                  playTrack(item, tracks);
                }}
              >
                <Text style={styles.trackIndex}>{index + 1}</Text>
                <View style={styles.trackInfo}>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {item.artist || item.artistName}
                  </Text>
                </View>

                <Text style={styles.trackDuration}>{item.durationFormatted || ''}</Text>

                <TouchableOpacity
                  style={styles.moreBtn}
                  onPress={() => openActionSheet(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerComponent: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  coverWrapper: {
    width: 180,
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumTitleText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  albumArtistText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: 6,
  },
  albumMetaText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  shuffleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  playAllBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: Colors.border,
  },
  listContent: {
    paddingBottom: 120,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  trackIndex: {
    width: 24,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  trackInfo: {
    flex: 1,
    marginRight: 10,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  trackArtist: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  trackDuration: {
    fontSize: 12,
    color: Colors.textMuted,
    marginRight: 10,
  },
  moreBtn: {
    padding: 8,
  },
});

