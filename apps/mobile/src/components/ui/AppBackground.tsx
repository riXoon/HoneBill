import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';

// Figma "Backgound compiled" (870:3042 / 870:3056): honeycomb corners and the warm glow, 402x874.
const backgroundImage = require('../../../assets/landing/background.png');

/** Full-bleed brand background shared by the onboarding and login screens. Place it first in a screen. */
export function AppBackground() {
  return <Image source={backgroundImage} style={StyleSheet.absoluteFill} contentFit="cover" pointerEvents="none" />;
}
