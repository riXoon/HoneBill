/**
 * Brand tokens from the Figma brand guide (file QvLzQR9hWs96dBf84A2z5C, node 942:3753).
 * The official palette is four colors: background #ECF0F3, text #222021, primary #F08F31 and
 * coral #E6795E. Every other value below is a named Figma variable or a value read from a Figma
 * frame (noted per token); never invent a color, ask the designer instead.
 * Spacing/radius are read off the screens and will grow as more pages are built.
 */
export const colors = {
  background: '#ECF0F3',
  surface: '#F7F7FB',
  /** Translucent fill used by inputs and OTP/PIN boxes ("L50 low opacity"). */
  surfaceTranslucent: 'rgba(247, 247, 251, 0.5)',
  text: '#222021',
  textMuted: 'rgba(34, 32, 33, 0.5)',
  primary: '#F08F31',
  /** "L orange": soft border of inactive inputs and the unfinished part of the step diamond. */
  primarySoft: '#FFCE8B',
  coral: '#E6795E',
  /** Phone-number pill border on the login screen. */
  borderRed: '#B43912',
  /** "L pink" in Figma: icon tint on the login phone pill. */
  pink: '#F3A3A7',
  yellow: '#FFF0D8',
  /** Figma "Ellipse 68" status dots on Home (not part of the 4-color palette). */
  statusOnline: '#53D44C',
  statusOffline: '#8D8B8B',
  shadow: '#D3D3D3',
  /** Send 2 "Balance after" bar: the remaining-balance part (#0BA98C) and the spent part (#C9C9C9). */
  success: '#0BA98C',
  track: '#C9C9C9',
  /** "L50 low opacity" (#F7F7FB at 50%) flattened over the page background, as TransactionCard does: a translucent fill would show the card shadow through. */
  card: '#F2F4F7',
  /** Figma "placeholder color" (#9784AC) at 10%: the QR "Send via offline" pill and the vault address row. */
  placeholderTint: 'rgba(151, 132, 172, 0.1)',
  /** Pure white, used for text on the Profile arch (Figma text-white). */
  white: '#FFFFFF',
} as const;

/** Loaded in App.tsx via @expo-google-fonts/lexend. Keys match the registered font names. */
export const fonts = {
  extraLight: 'Lexend_200ExtraLight',
  light: 'Lexend_300Light',
  regular: 'Lexend_400Regular',
  medium: 'Lexend_500Medium',
  semibold: 'Lexend_600SemiBold',
  bold: 'Lexend_700Bold',
} as const;

export const radius = {
  pill: 30,
  field: 12,
} as const;
