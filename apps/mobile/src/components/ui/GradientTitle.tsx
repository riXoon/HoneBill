import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

import { colors, fonts } from '../../theme';

type GradientTitleProps = {
  children: string;
  size?: number;
};

// Figma fills the headings with layered radial gradients that run deeper red than the brand
// palette. Only palette colors are used here (coral to orange); ask the designer if the deeper
// red is meant to be an official brand color.
const GRADIENT = [colors.coral, colors.primary] as const;

/** Bold heading painted with the brand gradient. */
export function GradientTitle({ children, size = 28 }: GradientTitleProps) {
  const textStyle = [styles.text, { fontSize: size }];
  return (
    <MaskedView maskElement={<Text style={textStyle}>{children}</Text>} accessibilityRole="header">
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.5 }}>
        {/* Invisible copy gives the gradient the same size as the text. */}
        <Text style={[textStyle, styles.hidden]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.bold },
  hidden: { opacity: 0 },
});
