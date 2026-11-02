/** The Pakka Fix palette (packages/ui/src/styles/tokens.css), for React Native. */
export const colors = {
  navy950: '#001d3f',
  navy900: '#062447',
  navy800: '#0a2f5a',
  primary: '#154d8c',
  primaryPressed: '#0f3d72',
  primarySubtle: '#eef4fb',
  primarySubtleText: '#0f3d72',
  primaryBorder: '#b3cbe8',
  accent: '#ff8000',
  accentText: '#1f0f00',
  accentSubtle: '#fff3e6',
  accentSubtleText: '#a34300',
  surface: '#ffffff',
  background: '#f6f7f9',
  sunken: '#eef0f4',
  border: '#d3d9e1',
  borderStrong: '#b5bfcb',
  text: '#121a29',
  textSecondary: '#46526a',
  textMuted: '#5f6b7e',
  success: '#1d7a43',
  successSubtle: '#eaf6ee',
  successText: '#17633a',
  warning: '#e8a317',
  warningSubtle: '#fff6e5',
  warningText: '#8a4b00',
  error: '#c4271b',
  errorSubtle: '#fdeeec',
  errorText: '#a01d13',
};

export const radius = { control: 10, card: 14, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  h2: { fontSize: 19, lineHeight: 25, fontWeight: '700' as const },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
};
