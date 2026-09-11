import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useSocialStore } from '../store/socialStore';
import { useMusicStore } from '../store/musicStore';
import { firestoreService } from '../services/firebase/firestoreService';
import { socialService } from '../services/social/socialService';
import { Colors } from '../constants/theme';
import type { UserProfile, Playlist } from '../models';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export const UserProfileModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { activeModal, activeUserUid, closeModal } = useUiStore();
  const { user } = useAuthStore();
  const { isFollowingUser, followUser, unfollowUser } = useSocialStore();
  const { openPlaylistDetail } = useMusicStore();

  const isVisible = activeModal === 'userProfile' && !!activeUserUid;

  const profileRequest = useRef(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = SCREEN_HEIGHT * 0.80;
  const fullHeight = SCREEN_HEIGHT * 0.95;
  const heightAnim = useRef(new Animated.Value(defaultHeight)).current;

  useEffect(() => {
    if (isVisible) {
      setIsFullScreen(false);
      heightAnim.setValue(defaultHeight);
    }
  }, [isVisible]);

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

  const isSelf = user?.uid === activeUserUid;
  const isFollowing = activeUserUid ? isFollowingUser(activeUserUid) : false;

  useEffect(() => {
    if (isVisible && activeUserUid) {
      setProfile(null);
      setPlaylists([]);
      loadProfile(activeUserUid);
    } else {
      setProfile(null);
      setPlaylists([]);
    }
    return () => { profileRequest.current++; };
  }, [isVisible, activeUserUid]);

  const loadProfile = async (uid: string) => {
    const request = ++profileRequest.current;
    setIsLoading(true);
    try {
      const data = await firestoreService.getUser(uid);
      if (request !== profileRequest.current) return;
      setProfile(data);
      // If user profile allows public playlists, load them
      if (data && (data.profileVisibility !== 'private' || isFollowing || isSelf)) {
        const syncData = data;
        const userPlaylists = (syncData as any)?.playlists || [];
        setPlaylists(userPlaylists.filter((p: Playlist) => p.visibility !== 'private'));
      }
    } catch {
      // Offline fallback
    } finally {
      if (request === profileRequest.current) setIsLoading(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!user || !activeUserUid || isFollowLoading) return;
    setIsFollowLoading(true);
    try {
      if (isFollowing) {
        await socialService.unfollowUser(user.uid, activeUserUid);
        unfollowUser(activeUserUid);
      } else {
        await socialService.followUser(user.uid, activeUserUid);
        followUser({
          uid: activeUserUid,
          displayName: profile?.displayName || 'Kullanıcı',
          username: profile?.username || 'user',
          photoURL: profile?.photoURL,
        });
      }
    } catch {
      // Error handling
    } finally {
      setIsFollowLoading(false);
    }
  };

  if (!isVisible) return null;

  const displayName = profile?.displayName || 'Voxen Kullanıcısı';
  const username = profile?.username ? `@${profile.username}` : '';
  const isPrivate = profile?.profileVisibility === 'private' && !isFollowing && !isSelf;

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
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
        <Animated.View style={[styles.container, { height: heightAnim }]}>
          {/* Top Bar with PanResponder */}
          <View {...panResponder.panHandlers} style={styles.topBar}>
            {/* Top Drag Handle */}
            <View style={styles.handle} />

            {/* Top Bar Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {username || displayName}
              </Text>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: (insets.bottom || 24) + 32 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Profile Card */}
              <View style={styles.profileCard}>
                <View style={styles.avatarWrap}>
                  {profile?.photoURL ? (
                    <Image source={{ uri: profile.photoURL }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Ionicons name="planet" size={48} color={Colors.primary} />
                    </View>
                  )}
                </View>

                <Text style={styles.displayName}>{displayName}</Text>
                {username ? <Text style={styles.usernameText}>{username}</Text> : null}

                {profile?.bio ? (
                  <Text style={styles.bioText}>{profile.bio}</Text>
                ) : null}

                {/* Follow Button (if not self) */}
                {!isSelf && user && (
                  <TouchableOpacity
                    style={[styles.followBtn, isFollowing && styles.followingBtn]}
                    onPress={handleToggleFollow}
                    disabled={isFollowLoading}
                  >
                    {isFollowLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons
                          name={isFollowing ? 'checkmark' : 'person-add-outline'}
                          size={16}
                          color={isFollowing ? Colors.textMuted : '#FFFFFF'}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                          {isFollowing ? 'Takip Ediliyor' : 'Takip Et'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Stats Row */}
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{playlists.length}</Text>
                  <Text style={styles.statLabel}>Çalma Listesi</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>
                    {profile?.followedArtistIds?.length || 0}
                  </Text>
                  <Text style={styles.statLabel}>Sanatçı</Text>
                </View>
              </View>

              {/* Private Account Notice */}
              {isPrivate ? (
                <View style={styles.privateNotice}>
                  <View style={styles.lockCircle}>
                    <Ionicons name="lock-closed" size={36} color={Colors.textMuted} />
                  </View>
                  <Text style={styles.privateTitle}>Bu Hesap Gizli</Text>
                  <Text style={styles.privateSub}>
                    Şarkılarını ve çalma listelerini görmek için bu kullanıcıyı takip edin.
                  </Text>
                </View>
              ) : (
                /* Public Playlists Section */
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Genel Çalma Listeleri</Text>
                  {playlists.length === 0 ? (
                    <Text style={styles.emptyText}>Henüz paylaşılan çalma listesi yok.</Text>
                  ) : (
                    playlists.map((pl) => (
                      <TouchableOpacity
                        key={pl.id}
                        style={styles.playlistRow}
                        onPress={() => {
                          closeModal();
                          openPlaylistDetail(pl);
                        }}
                      >
                        <View style={styles.plThumb}>
                          {pl.coverUrl ? (
                            <Image source={{ uri: pl.coverUrl }} style={styles.plImage} contentFit="cover" />
                          ) : (
                            <View style={styles.plFallback}>
                              <Ionicons name="musical-notes" size={20} color={Colors.primary} />
                            </View>
                          )}
                        </View>
                        <View style={styles.plMeta}>
                          <Text style={styles.plName} numberOfLines={1}>
                            {pl.name}
                          </Text>
                          <Text style={styles.plCount}>
                            {pl.tracks?.length || 0} parça
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  container: {
    backgroundColor: '#121214',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  topBar: {
    paddingTop: 12,
    width: '100%',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  profileCard: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.primary,
    marginBottom: 12,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  usernameText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 8,
  },
  bioText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
    lineHeight: 20,
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: 6,
  },
  followingBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  followBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  followingBtnText: {
    color: Colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1E1E22',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  privateNotice: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 30,
  },
  lockCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  privateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  privateSub: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  plThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
  },
  plImage: {
    width: '100%',
    height: '100%',
  },
  plFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plMeta: {
    flex: 1,
  },
  plName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  plCount: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});

