import type { ReactNode } from 'react';
import { ScrollView, type StyleProp, type ViewStyle } from 'react-native';

type AuthScrollProps = {
  /** The screen's content column. Use `flexGrow: 1`, not `flex: 1`, so it fills the screen but can also grow past it. */
  style: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Body of a sign-up / sign-in screen: laid out exactly as before on a tall phone, but scrolls when the content
 * (or the keyboard) leaves no room on a short one, instead of overflowing and overlapping.
 */
export function AuthScroll({ style, children }: AuthScrollProps) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={style}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {children}
    </ScrollView>
  );
}
