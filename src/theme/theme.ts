export const colors = {
  primary: '#3B82F6',
  primaryDark: '#1E40AF',
  onPrimary: '#FFFFFF',
  accent: '#059669',

  background: '#0F172A',
  surface: '#16213E',
  surfaceAlt: '#101A34',
  border: 'rgba(255,255,255,0.08)',

  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  profit: '#22C55E',
  loss: '#F87171',
  destructive: '#DC2626',

  overlay: 'rgba(0,0,0,0.55)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  fontRegular: 'IBMPlexSans_400Regular',
  fontMedium: 'IBMPlexSans_500Medium',
  fontSemiBold: 'IBMPlexSans_600SemiBold',
  fontBold: 'IBMPlexSans_700Bold',

  display: { fontSize: 32, lineHeight: 40 },
  title: { fontSize: 20, lineHeight: 28 },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
} as const;

export const touchTarget = {
  minSize: 44,
} as const;
