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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMusicStore } from '../store/musicStore';
import { useUiStore } from '../store/uiStore';
import { YouTubeService, TrackItem } from '../services/youtubeService';
import { Colors } from '../constants/theme';

export const RelatedTracksModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { activeModal, closeModal } = useUiStore();
  const isOpen = activeModal === 'related';
  const { currentTrack, playTrack, addToQueue } = useMusicStore();

  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentTrack) return;

    let isMounted = true;
    setLoading(true);
    setTracks([]);

    YouTubeService.getRelatedTracks(currentTrack.id)
      .then((res) => {
        if (isMounted) {
          setTracks(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentTrack?.id]);

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeModal}
    >
      <View style={[styles.container, { paddingTop: insets.top || 16, paddingBottom: insets.bottom || 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Benzer & İlgili Parçalar</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={closeModal} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* Subtitle info */}
        {currentTrack && (
          <View style={styles.subHeader}>
            <Text style={styles.subText} numberOfLines={1}>
              <Text style={{ fontWeight: '700', color: Colors.primary }}>{currentTrack.title}</Text> parçasına benzeyen öneriler
            </Text>
          </View>
        )}

        {/* List */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>YouTube Music önerileri yükleniyor...</Text>
          </View>
        ) : tracks.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="disc-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Henüz benzer parça bulunamadı.</Text>
          </View>
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.trackRow}
                activeOpacity={0.7}
                onPress={() => {
                  playTrack(item);
                  closeModal();
                }}
              >
                <Image source={{ uri: item.thumbnail }} style={styles.thumb} contentFit="cover" />
                <View style={styles.infoCol}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.artist} numberOfLines={1}>
                    {item.artist}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.addBtn}
                  activeOpacity={0.7}
                  onPress={() => addToQueue(item)}
                >
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  closeBtn: {
    padding: 6,
  },
  subHeader: {
    marginVertical: 12,
  },
  subText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  listContent: {
    paddingBottom: 24,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.card,
  },
  infoCol: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  artist: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

