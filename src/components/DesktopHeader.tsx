import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useThemeColors } from '../utils/useTheme';

declare global {
  interface Window { voxenDesktop?: { windowAction: (action: 'minimize' | 'maximize' | 'close') => void }; }
}
const draggable = { WebkitAppRegion: 'drag' } as any;
const interactive = { WebkitAppRegion: 'no-drag' } as any;

export function DesktopHeader() {
  const colors = useThemeColors();
  const { setActiveTab, openModal } = useUiStore();
  const user = useAuthStore(state => state.user);
  const [closeHover, setCloseHover] = useState(false);

  const action = (label: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.icon, interactive]}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.header, draggable, { backgroundColor: 'rgba(9, 9, 11, 0.95)' }]}>
      <TouchableOpacity accessibilityLabel="Ana sayfa" onPress={() => setActiveTab('home')} style={[styles.brand, interactive]}>
        <View style={[styles.mark, { backgroundColor: colors.primary }]}><Ionicons name="pulse" size={20} color="#fff" /></View>
        <Text style={[styles.brandText, { color: colors.text }]}>VOXEN</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Müzik ara" onPress={() => setActiveTab('search')} style={[styles.search, interactive, { backgroundColor: colors.surface, borderColor: 'rgba(255, 255, 255, 0.08)' }]}>
        <Ionicons name="search-outline" size={17} color={colors.textMuted} />
        <Text style={[styles.searchText, { color: colors.textMuted }]}>Şarkı, sanatçı veya albüm ara...</Text>
      </TouchableOpacity>
      <View style={styles.space} />
      {action('Ayarlar', 'settings-outline', () => openModal('settings'))}
      <TouchableOpacity accessibilityLabel="Profil" onPress={() => setActiveTab('profile')} style={[styles.profile, interactive, { backgroundColor: colors.accentMuted }]}>
        <Text style={{ color: colors.primary, fontWeight: '800' }}>{(user?.displayName || user?.email || 'V').slice(0, 1).toUpperCase()}</Text>
      </TouchableOpacity>
      {typeof window !== 'undefined' && window.voxenDesktop && (
        <View style={[styles.windowActions, interactive]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Simge durumuna küçült"
            onPress={() => window.voxenDesktop?.windowAction('minimize')}
            style={styles.winBtn}
          >
            <Ionicons name="remove-outline" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Büyüt veya geri al"
            onPress={() => window.voxenDesktop?.windowAction('maximize')}
            style={styles.winBtn}
          >
            <Ionicons name="square-outline" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Pencereyi kapat"
            onPress={() => window.voxenDesktop?.windowAction('close')}
            // @ts-ignore Web hover
            onMouseEnter={() => setCloseHover(true)}
            // @ts-ignore Web hover
            onMouseLeave={() => setCloseHover(false)}
            style={[styles.winBtn, styles.winCloseBtn, closeHover && styles.winCloseBtnHover]}
          >
            <Ionicons name="close-outline" size={18} color={closeHover ? '#FFFFFF' : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 0,
    flexShrink: 0,
    zIndex: 2000,
  },
  brand: { width: 238, paddingLeft: 24, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 19, fontWeight: '900', letterSpacing: 1.5 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, height: 38, maxWidth: 520, flex: 1, marginLeft: 16 },
  searchText: { fontSize: 13 },
  space: { flex: 1, minWidth: 20 },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginHorizontal: 2 },
  profile: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 },
  windowActions: { flexDirection: 'row', height: '100%', alignItems: 'center' },
  winBtn: { width: 46, height: '100%', alignItems: 'center', justifyContent: 'center' },
  winCloseBtn: { borderTopRightRadius: 0 },
  winCloseBtnHover: { backgroundColor: '#E81123' },
});
