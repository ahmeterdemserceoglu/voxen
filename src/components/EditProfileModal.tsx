import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { firestoreService } from '../services/firebase/firestoreService';
import { authService } from '../services/auth/authService';
import { YouTubeService } from '../services/youtubeService';
import { POPULAR_ARTISTS_CATALOGUE } from './OnboardingModal';
import { accountSession } from '../services/auth/accountStorage';
import { Colors } from '../constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const SPACE_AVATARS = [
  // Deep Space Nebula & Cosmic Dust
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&h=300&fit=crop',
  // Cosmic Planet Horizon & Atmospheric Glow
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&h=300&fit=crop',
  // Vibrant Orion Nebula & Stars
  'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=300&h=300&fit=crop',
  // Futuristic Celestial Planet
  'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=300&h=300&fit=crop',
  // Cyber Cosmic Vortex & Dark Galaxy
  'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=300&h=300&fit=crop',
  // Galactic Core & Cosmic Aurora
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&h=300&fit=crop',
  // Supernova & Star Cluster
  'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=300&h=300&fit=crop',
  // Lunar Eclipse & Space Horizon
  'https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=300&h=300&fit=crop',
];

export const EditProfileModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { activeModal, closeModal } = useUiStore();
  const { user, setUser } = useAuthStore();

  const isVisible = activeModal === 'editProfile';

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [bio, setBio] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [showActivity, setShowActivity] = useState(true);
  const [showPlaylists, setShowPlaylists] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [avatarCategory, setAvatarCategory] = useState<'youtube' | 'space'>('youtube');
  const [avatarSearchQuery, setAvatarSearchQuery] = useState('');
  const [isSearchingAvatar, setIsSearchingAvatar] = useState(false);
  const [searchedAvatars, setSearchedAvatars] = useState<Array<{ id: string; name: string; thumbnailUrl: string }>>([]);

  const handleSearchYouTubeAvatar = async () => {
    const q = avatarSearchQuery.trim();
    if (!q) return;
    setIsSearchingAvatar(true);
    try {
      const results = await YouTubeService.searchArtists(q);
      if (results.length > 0) {
        setSearchedAvatars(results);
      } else {
        const tracks = await YouTubeService.search(q);
        const unique = new Map<string, { id: string; name: string; thumbnailUrl: string }>();
        tracks.forEach((t) => {
          const name = t.artist || t.artistName;
          if (name && !unique.has(name.toLowerCase())) {
            unique.set(name.toLowerCase(), {
              id: t.id,
              name,
              thumbnailUrl: t.thumbnail,
            });
          }
        });
        setSearchedAvatars(Array.from(unique.values()).slice(0, 10));
      }
    } catch {
      // ignore
    } finally {
      setIsSearchingAvatar(false);
    }
  };

  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = SCREEN_HEIGHT * 0.85;
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

  useEffect(() => {
    if (isVisible && user) {
      setDisplayName(user.displayName || '');
      setPhotoURL(user.photoURL || '');
      loadProfileData(user.uid);
    }
  }, [isVisible, user]);

  const loadProfileData = async (uid: string) => {
    setIsLoading(true);
    try {
      const profile = await firestoreService.getUser(uid);
      if (profile) {
        if (profile.displayName) setDisplayName(profile.displayName);
        if (profile.username) {
          setUsername(profile.username);
          setOriginalUsername(profile.username);
          firestoreService.cleanOrphanUsernames(profile.username, uid);
        }
        if (profile.bio) setBio(profile.bio);
        if (profile.photoURL) setPhotoURL(profile.photoURL);
        setIsPublic(profile.profileVisibility !== 'private');
        setShowActivity(profile.showListeningActivity ?? true);
        setShowPlaylists(profile.showPublicPlaylists ?? true);
      }
    } catch {
      // Offline fallback
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    const epoch = accountSession.generation;
    if (!user) return;
    const trimmedName = displayName.trim();
    const trimmedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    if (!trimmedName) {
      Alert.alert('Eksik Bilgi', 'Lütfen geçerli bir isim girin.');
      return;
    }

    setIsSaving(true);
    try {
      // Username update & cleanup of all duplicate/previous usernames
      if (trimmedUsername) {
        const success = await firestoreService.updateUserUsername(
          trimmedUsername,
          user.uid,
          originalUsername
        );
        if (!success) {
          Alert.alert('Kullanıcı Adı Dolu', 'Bu kullanıcı adı başka bir kullanıcı tarafından alınmış.');
          setIsSaving(false);
          return;
        }
        setOriginalUsername(trimmedUsername);
      }

      if (!accountSession.isCurrent(epoch)) return;
      // Update Firebase Auth user
      try {
        await authService.updateDisplayName(user, trimmedName);
        if (photoURL.trim()) {
          await authService.updatePhotoURL(user, photoURL.trim());
        }
      } catch (authErr) {
        console.warn('Auth profile update error (non-fatal):', authErr);
      }

      if (!accountSession.isCurrent(epoch)) return;
      // Update Firestore document
      try {
        await firestoreService.updateUser(user.uid, {
          displayName: trimmedName,
          username: trimmedUsername || user.uid.slice(0, 8),
          bio: bio.trim(),
          photoURL: photoURL.trim(),
          profileVisibility: isPublic ? 'public' : 'private',
          showListeningActivity: showActivity,
          showPublicPlaylists: showPlaylists,
        });
      } catch (fsErr) {
        console.error('Firestore user update error:', fsErr);
        throw fsErr;
      }

      if (!accountSession.isCurrent(epoch)) return;
      // Update Zustand state
      if (authService.currentUser()) {
        setUser(authService.currentUser());
      } else {
        setUser({
          ...user,
          displayName: trimmedName,
          photoURL: photoURL.trim() || user.photoURL,
        });
      }

      closeModal();
      Alert.alert('Başarılı', 'Profil bilgileriniz güncellendi.');
    } catch (err: any) {
      console.error('handleSave full error:', err);
      const msg = err?.message || 'Profil kaydedilirken bir sorun oluştu.';
      Alert.alert('Hata', msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={closeModal}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
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

            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={closeModal} style={styles.cancelHeaderBtn}>
                <Text style={styles.cancelHeaderText}>İptal</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Profili Düzenle</Text>
              <TouchableOpacity
                style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: (insets.bottom || 24) + 120 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              {/* Avatar Section */}
              <View style={styles.avatarSection}>
                <View style={styles.avatarWrapper}>
                  {photoURL ? (
                    <Image source={{ uri: photoURL }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Ionicons name="person" size={54} color={Colors.primary} />
                    </View>
                  )}
                </View>
                <Text style={styles.avatarHint}>Profil Fotoğrafı Seç</Text>

                {/* Avatar Categories */}
                <View style={styles.avatarTabContainer}>
                  <TouchableOpacity
                    style={[styles.avatarTab, avatarCategory === 'youtube' && styles.avatarTabActive]}
                    onPress={() => setAvatarCategory('youtube')}
                  >
                    <Ionicons
                      name="logo-youtube"
                      size={15}
                      color={avatarCategory === 'youtube' ? '#FF0000' : Colors.textMuted}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.avatarTabText, avatarCategory === 'youtube' && styles.avatarTabTextActive]}>
                      YouTube Sanatçıları
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.avatarTab, avatarCategory === 'space' && styles.avatarTabActive]}
                    onPress={() => setAvatarCategory('space')}
                  >
                    <Ionicons
                      name="planet-outline"
                      size={15}
                      color={avatarCategory === 'space' ? Colors.primary : Colors.textMuted}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.avatarTabText, avatarCategory === 'space' && styles.avatarTabTextActive]}>
                      Kozmik / Uzay
                    </Text>
                  </TouchableOpacity>
                </View>

                {avatarCategory === 'youtube' ? (
                  <View style={styles.ytAvatarSection}>
                    {/* YouTube Search Bar */}
                    <View style={styles.ytSearchRow}>
                      <View style={styles.ytSearchInputWrap}>
                        <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
                        <TextInput
                          style={styles.ytSearchInput}
                          placeholder="YouTube'da sanatçı ara (Ezhel, Drake...)"
                          placeholderTextColor={Colors.textMuted}
                          value={avatarSearchQuery}
                          onChangeText={setAvatarSearchQuery}
                          onSubmitEditing={handleSearchYouTubeAvatar}
                          returnKeyType="search"
                        />
                        {avatarSearchQuery.length > 0 && (
                          <TouchableOpacity
                            onPress={() => {
                              setAvatarSearchQuery('');
                              setSearchedAvatars([]);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.ytSearchBtn,
                          (!avatarSearchQuery.trim() || isSearchingAvatar) && styles.ytSearchBtnDisabled,
                        ]}
                        onPress={handleSearchYouTubeAvatar}
                        disabled={!avatarSearchQuery.trim() || isSearchingAvatar}
                      >
                        {isSearchingAvatar ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.ytSearchBtnText}>Ara</Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* YouTube Avatars Horizontal Scroll */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsRow}>
                      {(searchedAvatars.length > 0 ? searchedAvatars : POPULAR_ARTISTS_CATALOGUE).map((item) => {
                        const isSelected = photoURL === item.thumbnailUrl;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={styles.ytArtistCard}
                            onPress={() => setPhotoURL(item.thumbnailUrl)}
                          >
                            <View style={[styles.ytArtistThumbWrap, isSelected && styles.ytArtistThumbWrapSelected]}>
                              <Image
                                source={{ uri: item.thumbnailUrl }}
                                style={styles.ytArtistThumb}
                                contentFit="cover"
                              />
                            </View>
                            <Text
                              style={[styles.ytArtistName, isSelected && styles.ytArtistNameSelected]}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : (
                  /* Space Avatars */
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsRow}>
                    {SPACE_AVATARS.map((url, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.presetThumbWrap, photoURL === url && styles.presetThumbSelected]}
                        onPress={() => setPhotoURL(url)}
                      >
                        <Image source={{ uri: url }} style={styles.presetThumb} contentFit="cover" />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* Form Inputs */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Görünen İsim</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={20} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Adınız veya Takma Adınız"
                    placeholderTextColor={Colors.textMuted}
                    maxLength={40}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Kullanıcı Adı (@)</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="at" size={20} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="kullaniciadi"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    maxLength={25}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Hakkında / Biyografi</Text>
                  <Text style={styles.charCount}>{bio.length}/150</Text>
                </View>
                <View style={[styles.inputWrap, styles.textAreaWrap]}>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={bio}
                    onChangeText={setBio}
                    placeholder="Müzik zevkinizden veya kendinizden bahsedin..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    maxLength={150}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Fotoğraf Bağlantısı (URL)</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="image-outline" size={20} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={photoURL}
                    onChangeText={setPhotoURL}
                    placeholder="https://example.com/avatar.jpg"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Privacy Toggles */}
              <View style={styles.privacySection}>
                <Text style={styles.sectionHeader}>Gizlilik Ayarları</Text>

                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleTitle}>Herkese Açık Profil</Text>
                    <Text style={styles.toggleSub}>Diğer kullanıcılar profilinizi bulabilir</Text>
                  </View>
                  <Switch
                    value={isPublic}
                    onValueChange={setIsPublic}
                    trackColor={{ false: '#3A3A3C', true: Colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleTitle}>Dinleme Aktivitesini Göster</Text>
                    <Text style={styles.toggleSub}>Şu an dinlediğiniz parçayı göster</Text>
                  </View>
                  <Switch
                    value={showActivity}
                    onValueChange={setShowActivity}
                    trackColor={{ false: '#3A3A3C', true: Colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleTitle}>Çalma Listelerini Göster</Text>
                    <Text style={styles.toggleSub}>Profilinizde genel listeleri sergileyin</Text>
                  </View>
                  <Switch
                    value={showPlaylists}
                    onValueChange={setShowPlaylists}
                    trackColor={{ false: '#3A3A3C', true: Colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
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
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  cancelHeaderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cancelHeaderText: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  loaderContainer: {
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
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarWrapper: {
    width: 104,
    height: 104,
    borderRadius: 52,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.primary,
    marginBottom: 10,
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
  avatarHint: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  avatarTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
    width: '100%',
  },
  avatarTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 9,
  },
  avatarTabActive: {
    backgroundColor: '#2C2C30',
  },
  avatarTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  avatarTabTextActive: {
    color: Colors.text,
    fontWeight: '700',
  },
  ytAvatarSection: {
    width: '100%',
  },
  ytSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
    width: '100%',
  },
  ytSearchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  ytSearchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    padding: 0,
  },
  ytSearchBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ytSearchBtnDisabled: {
    opacity: 0.5,
  },
  ytSearchBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  ytArtistCard: {
    alignItems: 'center',
    marginRight: 14,
    width: 62,
  },
  ytArtistThumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 5,
  },
  ytArtistThumbWrapSelected: {
    borderColor: Colors.primary,
    borderWidth: 2.5,
  },
  ytArtistThumb: {
    width: '100%',
    height: '100%',
  },
  ytArtistName: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    width: '100%',
  },
  ytArtistNameSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  presetsRow: {
    flexDirection: 'row',
  },
  presetThumbWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    marginRight: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetThumbSelected: {
    borderColor: Colors.primary,
  },
  presetThumb: {
    width: '100%',
    height: '100%',
  },
  formGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  charCount: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
  },
  textAreaWrap: {
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    paddingVertical: 12,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
    paddingVertical: 0,
  },
  privacySection: {
    marginTop: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  toggleSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
});

