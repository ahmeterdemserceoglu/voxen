import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUiStore, TabKey } from '../store/uiStore';
import { Colors } from '../constants/theme';

interface TabItem {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

const TABS: TabItem[] = [
  { key: 'home', label: 'Ana Sayfa', icon: 'home-outline', activeIcon: 'home' },
  { key: 'search', label: 'Arama', icon: 'search-outline', activeIcon: 'search' },
  { key: 'library', label: 'Kütüphane', icon: 'musical-notes-outline', activeIcon: 'musical-notes' },
  { key: 'profile', label: 'Profil', icon: 'person-outline', activeIcon: 'person' },
];

export const FloatingNav: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeTab, setActiveTab } = useUiStore();
  const insets = useSafeAreaInsets();

  const bottomMargin = insets.bottom > 0 ? insets.bottom + 6 : (Platform.OS === 'ios' ? 20 : 14);

  return (
    <View style={[styles.wrapper, { marginBottom: bottomMargin }]} pointerEvents="box-none">
      <View style={styles.container}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabBtn}
              activeOpacity={0.7}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons
                name={isActive ? tab.activeIcon : tab.icon}
                size={22}
                color={isActive ? Colors.text : Colors.textMuted}
              />
              <Text style={[styles.label, isActive && styles.labelActive]}>
                {tab.label}
              </Text>
              {isActive && <View style={styles.dot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 22, 24, 0.95)',
    borderRadius: 36,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  tabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 4,
    minWidth: 72,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textMuted,
    marginTop: 3,
  },
  labelActive: {
    color: Colors.text,
    fontWeight: '700',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 3,
  },
});

