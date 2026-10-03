import React from 'react';
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
  const action = (label: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.icon, interactive]}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
  return <View style={[styles.header, draggable, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
    <TouchableOpacity accessibilityLabel="Ana sayfa" onPress={() => setActiveTab('home')} style={[styles.brand, interactive]}>
      <View style={[styles.mark, { backgroundColor: colors.primary }]}><Ionicons name="pulse" size={21} color="#fff" /></View>
      <Text style={[styles.brandText, { color: colors.text }]}>VOXEN</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Müzik ara" onPress={() => setActiveTab('search')} style={[styles.search, interactive, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="search-outline" size={18} color={colors.textMuted} />
      <Text style={[styles.searchText, { color: colors.textMuted }]}>Şarkı, sanatçı veya albüm ara</Text>
    </TouchableOpacity>
    <View style={styles.space} />
    {action('Ayarlar', 'settings-outline', () => openModal('settings'))}
    <TouchableOpacity accessibilityLabel="Profil" onPress={() => setActiveTab('profile')} style={[styles.profile, interactive, { backgroundColor: colors.accentMuted }]}>
      <Text style={{ color: colors.primary, fontWeight: '800' }}>{(user?.displayName || user?.email || 'V').slice(0, 1).toUpperCase()}</Text>
    </TouchableOpacity>
    {typeof window !== 'undefined' && window.voxenDesktop && <View style={[styles.windowActions, interactive]}>
      {action('Simge durumuna küçült', 'remove-outline', () => window.voxenDesktop?.windowAction('minimize'))}
      {action('Büyüt veya geri al', 'square-outline', () => window.voxenDesktop?.windowAction('maximize'))}
      {action('Pencereyi kapat', 'close-outline', () => window.voxenDesktop?.windowAction('close'))}
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  header: { height: 66, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingRight: 10, flexShrink: 0, zIndex: 2000 },
  brand: { width: 238, paddingLeft: 28, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 33, height: 33, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 20, fontWeight: '900', letterSpacing: 1.8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, height: 38, maxWidth: 520, flex: 1, marginLeft: 22 },
  searchText: { fontSize: 12 },
  space: { flex: 1, minWidth: 20 },
  icon: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  profile: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginHorizontal: 10 },
  windowActions: { flexDirection: 'row', marginLeft: 12 },
});
