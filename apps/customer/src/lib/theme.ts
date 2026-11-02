import * as SecureStore from 'expo-secure-store';
import { Appearance } from 'react-native';

/*
 * The Pakka Fix palette (packages/ui/src/styles/tokens.css) and type scale, for React Native, in a
 * light and a dark version. The scheme is chosen once at start-up (the customer's choice, else the
 * phone's); changing it restarts the app (lib/appearance.ts), because styles are built at start.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_KEY = 'pakkafix.customer.theme';

export const themePreference: ThemePreference = (() => {
  try {
    const saved = SecureStore.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
})();

export const isDark = themePreference === 'dark' || (themePreference === 'system' && Appearance.getColorScheme() === 'dark');

const brand = {
  navy950: '#001d3f',
  navy900: '#062447',
  navy800: '#0a2f5a',
  navy700: '#0f3d72',
  accent: '#ff8000',
  accentPressed: '#f07400',
  accentText: '#1f0f00',
};

const light = {
  ...brand,
  primary: '#154d8c',
  primaryPressed: '#0f3d72',
  primarySubtle: '#eef4fb',
  primarySubtleText: '#0f3d72',
  primaryBorder: '#b3cbe8',
  accentSubtle: '#fff3e6',
  accentSubtleText: '#a34300',
  accentBorder: '#ffd2a3',
  surface: '#ffffff',
  background: '#f6f7f9',
  sunken: '#eef0f4',
  tile: '#eef1f6',
  border: '#e3e7ed',
  borderStrong: '#b5bfcb',
  text: '#121a29',
  textSecondary: '#46526a',
  textMuted: '#5f6b7e',
  success: '#1d7a43',
  successSubtle: '#eaf6ee',
  successText: '#17633a',
  successBorder: '#b6dec4',
  warning: '#e8a317',
  warningSubtle: '#fff6e5',
  warningText: '#8a4b00',
  warningBorder: '#f3d08c',
  error: '#c4271b',
  errorPressed: '#a61f15',
  errorSubtle: '#fdeeec',
  errorText: '#a01d13',
  errorBorder: '#f4c3bd',
  overlay: 'rgba(0, 29, 63, 0.55)',
};

/** Deep navy surfaces (like the reference's dark screens), lighter blues for text and icons. */
const dark: typeof light = {
  ...brand,
  primary: '#3b7fd4',
  primaryPressed: '#2f6bb8',
  primarySubtle: '#132843',
  primarySubtleText: '#a9cbf3',
  primaryBorder: '#24426e',
  accentSubtle: '#33210f',
  accentSubtleText: '#ffb266',
  accentBorder: '#5e3a14',
  surface: '#162033',
  background: '#0d1524',
  sunken: '#1c2740',
  tile: '#1c2740',
  border: '#26324a',
  borderStrong: '#3b4964',
  text: '#eef2f8',
  textSecondary: '#b9c3d3',
  textMuted: '#8c98ad',
  success: '#3fbf73',
  successSubtle: '#10301f',
  successText: '#86e2aa',
  successBorder: '#1f5a38',
  warning: '#f0b43a',
  warningSubtle: '#33270c',
  warningText: '#f5c96b',
  warningBorder: '#5e4813',
  error: '#ff6b5e',
  errorPressed: '#e85a4e',
  errorSubtle: '#3a1512',
  errorText: '#ffa197',
  errorBorder: '#6a2620',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const colors = isDark ? dark : light;

/** Manrope, the website's typeface, loaded in the root layout. */
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
};

export const radius = { sm: 8, control: 12, card: 16, sheet: 24, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  display: { fontSize: 28, lineHeight: 34, fontFamily: fonts.extrabold },
  title: { fontSize: 22, lineHeight: 28, fontFamily: fonts.bold },
  h2: { fontSize: 18, lineHeight: 24, fontFamily: fonts.bold },
  h3: { fontSize: 16, lineHeight: 22, fontFamily: fonts.bold },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  small: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fonts.medium },
};

/** Soft card shadow (Android elevation + iOS shadow). */
export const shadow = {
  card: {
    shadowColor: '#0a2f5a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0a2f5a',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};
