import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useNavigation } from '@react-navigation/native';

/**
 * While `active`, the user cannot leave the screen: Android's Back button does nothing and iOS's swipe-back gesture is
 * off. Used while a transaction is in flight, so leaving cannot make it look cancelled when it is not. The on-screen
 * back button is covered by the processing overlay at the same time.
 *
 * Navigation the screen itself starts (to the receipt, or back after success) is not blocked.
 */
export function useBlockBack(active: boolean): void {
  const navigation = useNavigation();

  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [active]);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !active });
  }, [navigation, active]);
}
