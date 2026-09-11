import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore, Theme } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { useLibraryStore } from '../store/libraryStore';
import { useUiStore } from '../store/uiStore';
import { youtubeCache } from '../services/youtube/youtubeCache';
import { Colors } from '../constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export const SettingsModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeModal, closeModal, openModal } = useUiStore();
  const isOpen = activeModal === 'settings';

  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = SCREEN_HEIGHT * 0.75;
  const fullHeight = SCREEN_HEIGHT * 0.94;
  const heightAnim = useRef(new Animated.Value(defaultHeight)).current;

  useEffect(() => {
    if (isOpen) {
      setIsFullScreen(false);
      heightAnim.setValue(defaultHeight);
    }
  }, [isOpen]);

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
        // Explicit swipe UP -> expand to full screen
        if (gestureState.dy < -30) {
          toggleFullScreen(true);
        } else if (gestureState.dy > 60) {
          // Explicit swipe DOWN
          if (fullScreenRef.current) {
            toggleFullScreen(false);
          } else {
            closeModal();
          }
        }
      },
    })
  ).current;

  const {
    theme,
    autoplay,
    normalizeVolume,
    crossfade,
    crossfadeDuration,
    explicitContent,
    historyEnabled,
    profileVisibility,
    showListeningActivity,
    updateSettings,
  } = useSettingsStore();

  const { user, signOut, openAuthModal } = useAuthStore();
  const { clearHistory } = useLibraryStore();

  const handleClearCache = () => {
    youtubeCache.clearSearch();
    Alert.alert('Başarılı', 'Uygulama arama ve metadata önbelleği temizlendi.');
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Geçmişi Temizle',
      'Tüm dinleme geçmişiniz silinecek. Onaylıyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: () => {
            clearHistory();
            Alert.alert('Başarılı', 'Dinleme geçmişi temizlendi.');
          },
        },
      ]
    );
  };

  const THEMES: { key: Theme; label: string }[] = [
    { key: 'dark', label: 'Koyu (Önerilen)' },
    { key: 'amoled', label: 'Saf Siyah (AMOLED)' },
    { key: 'light', label: 'Açık' },
  ];

  const CROSSFADE_OPTIONS = [2, 3, 4, 5, 6, 8];

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
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={closeModal}
        />
        <Animated.View style={[styles.sheet, { height: heightAnim }]}>
          {/* Top Drag & Header Area */}
          <View {...panResponder.panHandlers} style={styles.topBar}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Ayarlar</Text>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Playback Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Oynatma</Text>

              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>Otomatik Çalma (Autoplay)</Text>
                  <Text style={styles.rowSub}>Sıra bittiğinde benzer müzikleri çalmaya devam et</Text>
                </View>
                <Switch
                  value={autoplay}
                  onValueChange={(val) => updateSettings({ autoplay: val })}
                  trackColor={{ false: '#333', true: Colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>Ses Seviyesini Dengele</Text>
                  <Text style={styles.rowSub}>Şarkılar arasındaki ses seviyesi farklarını normalize et</Text>
                </View>
                <Switch
                  value={normalizeVolume}
                  onValueChange={(val) => updateSettings({ normalizeVolume: val })}
                  trackColor={{ false: '#333', true: Colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              {/* Crossfade Toggle */}
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>Yumuşak Geçiş</Text>
                  <Text style={styles.rowSub}>Parçalar üst üste binmeden ses yavaşça açılır ve kapanır</Text>
                </View>
                <Switch
                  value={crossfade}
                  onValueChange={(val) => updateSettings({ crossfade: val })}
                  trackColor={{ false: '#333', true: Colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              {/* Crossfade Duration Selector (only visible when crossfade is on) */}
              {crossfade && (
                <View style={styles.crossfadeContainer}>
                  <Text style={styles.rowSub}>Geçiş süresi: {crossfadeDuration} sn</Text>
                  <View style={styles.crossfadeRow}>
                    {CROSSFADE_OPTIONS.map((sec) => (
                      <TouchableOpacity
                        key={sec}
                        style={[
                          styles.crossfadeChip,
                          crossfadeDuration === sec && styles.crossfadeChipActive,
                        ]}
                        onPress={() => updateSettings({ crossfadeDuration: sec })}
                      >
                        <Text
                          style={[
                            styles.crossfadeChipText,
                            crossfadeDuration === sec && styles.crossfadeChipTextActive,
                          ]}
                        >
                          {sec}s
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Content & Privacy */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>İçerik ve Gizlilik</Text>

              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>Açık İçeriğe İzin Ver (Explicit)</Text>
                  <Text style={styles.rowSub}>Uygunsuz sözler içeren şarkıları göster ve çal</Text>
                </View>
                <Switch
                  value={explicitContent}
                  onValueChange={(val) => updateSettings({ explicitContent: val })}
                  trackColor={{ false: '#333', true: Colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>Dinleme Geçmişini Kaydet</Text>
                  <Text style={styles.rowSub}>Çalınan parçaları geçmiş listesine ekle</Text>
                </View>
                <Switch
                  value={historyEnabled}
                  onValueChange={(val) => updateSettings({ historyEnabled: val })}
                  trackColor={{ false: '#333', true: Colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>Dinleme Aktivitemi Göster</Text>
                  <Text style={styles.rowSub}>Şu an dinlediğiniz şarkıyı arkadaşlarınız görebilir</Text>
                </View>
                <Switch
                  value={showListeningActivity}
                  onValueChange={(val) => updateSettings({ showListeningActivity: val })}
                  trackColor={{ false: '#333', true: Colors.primary }}
                  thumbColor="#FFF"
                />
              </View>
            </View>

            {/* Appearance / Theme */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Görünüm & Tema</Text>
              <View style={styles.themeSelector}>
                {THEMES.map((t) => {
                  const isSelected = theme === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.themeChip, isSelected && styles.themeChipActive]}
                      onPress={() => updateSettings({ theme: t.key })}
                    >
                      <Text style={[styles.themeChipText, isSelected && styles.themeChipTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Storage / Data Actions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Depolama ve Veri</Text>

              <TouchableOpacity style={styles.actionRow} onPress={handleClearCache}>
                <Ionicons name="trash-bin-outline" size={20} color={Colors.text} />
                <Text style={styles.actionLabel}>Arama ve Medya Önbelleğini Temizle</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionRow} onPress={handleClearHistory}>
                <Ionicons name="time-outline" size={20} color={Colors.primary} />
                <Text style={[styles.actionLabel, { color: Colors.primary }]}>
                  Dinleme Geçmişini Temizle
                </Text>
              </TouchableOpacity>
            </View>

            {/* Account */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hesap</Text>
              {user ? (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    closeModal();
                    signOut();
                  }}
                >
                  <Ionicons name="log-out-outline" size={20} color={Colors.textMuted} />
                  <Text style={styles.actionLabel}>Hesaptan Çıkış Yap</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    closeModal();
                    openAuthModal();
                  }}
                >
                  <Ionicons name="person-add-outline" size={20} color={Colors.primary} />
                  <Text style={[styles.actionLabel, { color: Colors.primary }]}>
                    Giriş Yap veya Hesap Oluştur
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 30,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowText: {
    flex: 1,
    marginRight: 16,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  rowSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  themeSelector: {
    flexDirection: 'column',
    gap: 8,
  },
  themeChip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  themeChipActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
  },
  themeChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  themeChipTextActive: {
    color: Colors.text,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 12,
  },
  crossfadeContainer: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  crossfadeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  crossfadeChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  crossfadeChipActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
  },
  crossfadeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  crossfadeChipTextActive: {
    color: Colors.primary,
  },
});

