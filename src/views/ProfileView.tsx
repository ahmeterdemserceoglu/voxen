import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { useMusicStore } from '../store/musicStore';
import { useLibraryStore } from '../store/libraryStore';
import { useUiStore } from '../store/uiStore';
import { useSocialStore } from '../store/socialStore';
import { Colors } from '../constants/theme';

export const ProfileView: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { user, signOut, openAuthModal } = useAuthStore();
  const { playlists, favorites } = useMusicStore();
  const { followedArtists } = useLibraryStore();
  const { openModal } = useUiStore();
  const { activeRoom } = useSocialStore();

  const isGuest = !user;
  const displayName = user?.displayName || (isGuest ? 'Misafir Dinleyici' : 'Voxen Kullanıcısı');
  const email = user?.email || 'Yerel modda dinliyorsunuz';

  const handleSignOut = () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkış yapmak istediğinize emin misiniz? Yerel çalma listeleriniz cihazınızda kalacaktır.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: () => signOut(),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profil</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => openModal('settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarContainer}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons
                  name={isGuest ? 'planet-outline' : 'planet'}
                  size={48}
                  color={Colors.primary}
                />
              </View>
            )}
          </View>

          <View style={styles.userInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {displayName}
              </Text>
              {!isGuest && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                </View>
              )}
            </View>
            <Text style={styles.userEmail} numberOfLines={1}>
              {email}
            </Text>
          </View>

          {isGuest ? (
            <TouchableOpacity style={styles.loginBannerBtn} onPress={openAuthModal}>
              <Text style={styles.loginBannerText}>Giriş Yap</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.userActions}>
              <TouchableOpacity
                style={styles.editProfileBtn}
                onPress={() => openModal('editProfile')}
              >
                <Ionicons name="pencil-outline" size={14} color={Colors.text} style={{ marginRight: 4 }} />
                <Text style={styles.editProfileText}>Düzenle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{favorites.length}</Text>
            <Text style={styles.statLabel}>Beğenilen</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{playlists.length}</Text>
            <Text style={styles.statLabel}>Çalma Listesi</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{followedArtists.length}</Text>
            <Text style={styles.statLabel}>Takip Edilen</Text>
          </View>
        </View>

        {/* Guest Warning / Call to Action */}
        {isGuest && (
          <View style={styles.cloudBanner}>
            <View style={styles.cloudIconWrap}>
              <Ionicons name="cloud-upload-outline" size={24} color={Colors.primary} />
            </View>
            <View style={styles.cloudTextWrap}>
              <Text style={styles.cloudTitle}>Bulut Senkronizasyonu</Text>
              <Text style={styles.cloudDesc}>
                Çalma listelerinizi ve beğenilerinizi kaybetmemek için ücretsiz hesap oluşturun.
              </Text>
            </View>
            <TouchableOpacity style={styles.cloudActionBtn} onPress={openAuthModal}>
              <Text style={styles.cloudActionText}>Bağlan</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu Sections */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Müzik & Özellikler</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => openModal('listeningRoom')}
          >
            <View
              style={[
                styles.menuIconWrap,
                {
                  backgroundColor: activeRoom
                    ? 'rgba(52, 199, 89, 0.15)'
                    : 'rgba(255, 59, 48, 0.15)',
                },
              ]}
            >
              <Ionicons
                name="radio"
                size={20}
                color={activeRoom ? Colors.success : Colors.primary}
              />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuLabel}>Birlikte Dinleme Odası</Text>
              <Text
                style={[
                  styles.menuSub,
                  activeRoom ? { color: Colors.success, fontWeight: '600' } : null,
                ]}
              >
                {activeRoom
                  ? `Canlı Yayında • Oda Kodu: ${activeRoom}`
                  : 'Arkadaşlarınızla aynı anda dinleyin'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => openModal('notifications')}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: 'rgba(52, 199, 89, 0.15)' }]}>
              <Ionicons name="notifications-outline" size={20} color={Colors.success} />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuLabel}>Bildirimler</Text>
              <Text style={styles.menuSub}>Yeni müzikler ve aktivite bildirimleri</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ayarlar & Sistem</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => openModal('settings')}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
              <Ionicons name="options-outline" size={20} color={Colors.text} />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuLabel}>Oynatma ve Ses Ayarları</Text>
              <Text style={styles.menuSub}>Otomatik çalma, kalite ve tema seçenekleri</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => openModal('onboarding')}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: 'rgba(255, 149, 0, 0.15)' }]}>
              <Ionicons name="color-palette-outline" size={20} color={Colors.warning} />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuLabel}>Müzik Zevkini Güncelle</Text>
              <Text style={styles.menuSub}>Sevdiğiniz türleri ve sanatçıları yeniden seçin</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* App Info Footer */}
        <View style={styles.footer}>
          <Text style={styles.appName}>VOXEN</Text>
          <Text style={styles.appDesc}>Material 3 • YouTube Music İstemcisi • Reklamsız</Text>
          <Text style={styles.version}>Sürüm 1.0.0 (Expo 57 / React Native)</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 180,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarContainer: {
    marginRight: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    marginRight: 10,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginRight: 6,
    flexShrink: 1,
  },
  verifiedBadge: {
    flexShrink: 0,
    marginTop: 1,
  },
  userEmail: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  loginBannerBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    flexShrink: 0,
  },
  loginBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  userActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    marginRight: 8,
  },
  editProfileText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  signOutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNum: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  cloudBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  cloudIconWrap: {
    marginRight: 12,
  },
  cloudTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  cloudTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  cloudDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  cloudActionBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  cloudActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuTextWrap: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  menuSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    opacity: 0.6,
  },
  appName: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  appDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  version: {
    fontSize: 10,
    color: Colors.textDisabled,
    marginTop: 2,
  },
});

