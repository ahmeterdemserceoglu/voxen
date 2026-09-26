import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import { useUiStore, type TabKey } from '../store/uiStore';

type NavItem = {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
};

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Ana Sayfa', icon: 'home-outline', activeIcon: 'home' },
  { key: 'search', label: 'Keşfet', icon: 'compass-outline', activeIcon: 'compass' },
  { key: 'library', label: 'Kütüphane', icon: 'albums-outline', activeIcon: 'albums' },
  { key: 'profile', label: 'Profil', icon: 'person-outline', activeIcon: 'person' },
];

export const DesktopSidebar: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeTab, setActiveTab, openModal } = useUiStore();

  return (
    <View style={styles.container}>
      <View style={styles.brandBlock}>
        <View style={styles.brandRow}>
          <View style={styles.logoMark}>
            <Ionicons name="pulse" size={21} color="#FFFFFF" />
          </View>
          <Text style={styles.brand}>VOXEN</Text>
        </View>
        <Text style={styles.tagline}>Müziğin, senin alanın.</Text>
      </View>

      <Text style={styles.groupLabel}>MENÜ</Text>
      <View style={styles.navGroup}>
        {NAV_ITEMS.map(item => {
          const active = activeTab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.navItem, active && styles.navItemActive]}
              activeOpacity={0.78}
              onPress={() => setActiveTab(item.key)}
            >
              <Ionicons
                name={active ? item.activeIcon : item.icon}
                size={20}
                color={active ? '#FFFFFF' : Colors.textMuted}
              />
              <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
              {active && <View style={styles.activeRail} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.spacer} />

      <TouchableOpacity style={styles.settingsButton} onPress={() => openModal('settings')} activeOpacity={0.75}>
        <Ionicons name="settings-outline" size={19} color={Colors.textMuted} />
        <Text style={styles.settingsText}>Ayarlar</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    width: 238,
    flexShrink: 0,
    backgroundColor: '#0D0D0F',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 18,
  },
  brandBlock: { paddingHorizontal: 10, marginBottom: 36 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  brand: { color: Colors.text, fontSize: 21, fontWeight: '900', letterSpacing: 2.4 },
  tagline: { color: Colors.textMuted, fontSize: 11, marginTop: 10, letterSpacing: 0.2 },
  groupLabel: { color: Colors.textDisabled, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginLeft: 12, marginBottom: 10 },
  navGroup: { gap: 5 },
  navItem: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
  },
  navItemActive: { backgroundColor: 'rgba(229,9,20,0.14)' },
  navText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  navTextActive: { color: Colors.text, fontWeight: '700' },
  activeRail: { position: 'absolute', left: 0, width: 3, height: 22, borderRadius: 3, backgroundColor: Colors.primary },
  spacer: { flex: 1 },
  settingsButton: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, borderRadius: 11 },
  settingsText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
});
