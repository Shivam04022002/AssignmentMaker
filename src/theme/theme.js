/**
 * Design tokens for HandWrite.
 *
 * Direction: modern note-taking app + physical notebook. Warm off-white
 * surfaces, dark charcoal UI chrome, blue ink as the single accent colour.
 */
import { Platform } from 'react-native';

export const colors = {
  // App surfaces
  background: '#F4F1EA',
  surface: '#FFFFFF',
  surfaceMuted: '#ECE8DF',
  border: '#E2DDD2',
  borderStrong: '#CFC8BA',

  // Text / chrome
  charcoal: '#22252A',
  text: '#22252A',
  textMuted: '#6B6E75',
  textFaint: '#9A9CA1',
  onCharcoal: '#FAF8F3',

  // Accent (matches the blue pen)
  accent: '#123A8C',
  accentSoft: '#E4EAF6',

  danger: '#B3261E',

  // Paper
  paper: '#FCFBF8', // near-neutral off-white, as in the reference pages
  paperEdge: '#E9E3D3',
  paperRule: '#B9CBE3',
  paperMargin: '#E7A9A4',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

const systemFont = Platform.select({ ios: 'System', default: undefined });

export const typography = {
  display: {
    fontFamily: systemFont,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: colors.text,
  },
  title: {
    fontFamily: systemFont,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.text,
  },
  sectionLabel: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  body: {
    fontFamily: systemFont,
    fontSize: 15,
    color: colors.text,
  },
  caption: {
    fontFamily: systemFont,
    fontSize: 13,
    color: colors.textMuted,
  },
};

/** Soft, cross-platform card shadow. */
export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#3A3020',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    default: { elevation: 2 },
  }),
  // Selected cards sit slightly higher than their neighbours.
  raised: Platform.select({
    ios: {
      shadowColor: '#123A8C',
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
    },
    default: { elevation: 5 },
  }),
  paper: Platform.select({
    ios: {
      shadowColor: '#3A3020',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    default: { elevation: 4 },
  }),
};

const theme = { colors, spacing, radii, typography, shadows };
export default theme;
