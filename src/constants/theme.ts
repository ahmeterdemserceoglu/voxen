/** App theme colors — Material 3 dark, Voxen identity */
export const Colors = {
  background: '#0A0A0C',
  surface: '#16161B',
  card: '#16161B',
  surfaceElevated: '#1E1E24',
  surfaceHighlight: '#252530',
  cardSecondary: '#1E1E24',

  // Accent — Voxen red
  accent: '#FF3B30',
  primary: '#FF3B30',
  accentMuted: 'rgba(255,59,48,0.15)',
  primaryGlow: 'rgba(255,59,48,0.25)',

  text: '#FFFFFF',
  textSecondary: '#9999AA',
  textMuted: '#9999AA',
  textDisabled: '#555566',

  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.15)',
  overlay: 'rgba(0,0,0,0.6)',
  glassBg: 'rgba(22,22,27,0.88)',
  glassDark: 'rgba(10,10,12,0.92)',

  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',

  playerBackground: '#0D0D12',
} as const;

export type ColorKey = keyof typeof Colors;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
