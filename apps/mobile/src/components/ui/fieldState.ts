import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { colors } from '../../theme';

/**
 * The one look for every input box (the User Details form is the reference):
 *  - blank and not selected: light orange border
 *  - has text and not selected: orange border
 *  - selected (typing or not): white background with an orange border and a soft shadow
 *
 * Every state must set `shadowColor`, even the ones with no visible shadow. Fabric only gives a view's children
 * their own native parent once the view "forms a stacking context", which `shadowColor` and `elevation` trigger.
 * Adding it only on focus would move a TextInput wrapped in this box to a new native parent the moment it gets
 * focus, and Android then drops the focus and closes the keyboard.
 */
const styles = StyleSheet.create({
  blank: {
    backgroundColor: colors.surfaceTranslucent,
    borderColor: colors.primarySoft,
    shadowColor: colors.shadow,
    shadowOpacity: 0,
  },
  filled: {
    backgroundColor: colors.surfaceTranslucent,
    borderColor: colors.primary,
    shadowColor: colors.shadow,
    shadowOpacity: 0,
  },
  focused: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 6,
  },
});

/** Background and border (plus shadow while selected) for a bordered 1 dp field. */
export function fieldStateStyle(focused: boolean, filled: boolean) {
  return focused ? styles.focused : filled ? styles.filled : styles.blank;
}

/** Tracks whether a TextInput is selected; spread `focusProps` onto it. */
export function useFieldFocus() {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { focused, onFocus, onBlur };
}
