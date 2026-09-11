import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/theme';
import { useSettingsStore } from '../store/settingsStore';

export type Palette = { [K in keyof typeof Colors]: string };
const light: Palette = { ...Colors, background: '#F6F6F8', surface: '#FFFFFF', card: '#FFFFFF',
  surfaceElevated: '#EDEDF2', surfaceHighlight: '#E2E2EA', cardSecondary: '#EDEDF2',
  text: '#19191F', textSecondary: '#555561', textMuted: '#666674', textDisabled: '#858590',
  border: 'rgba(0,0,0,0.10)', borderLight: 'rgba(0,0,0,0.15)',
  glassBg: 'rgba(255,255,255,0.95)', glassDark: 'rgba(246,246,248,0.95)', playerBackground: '#F6F6F8' };
const amoled: Palette = { ...Colors, background: '#000000', surface: '#000000', card: '#000000', playerBackground: '#000000', glassDark: 'rgba(0,0,0,0.95)' };
export function useThemeColors(): Palette {
  const theme = useSettingsStore(s => s.theme);
  const system = useColorScheme();
  return theme === 'light' || (theme === 'system' && system === 'light') ? light : theme === 'amoled' ? amoled : Colors;
}
export function useThemeStyles<T>(factory: (colors: Palette) => T): T {
  const colors = useThemeColors();
  return useMemo(() => factory(colors), [factory, colors]);
}
