import { useEffect } from 'react';
import { Dimensions, Easing } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps, BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { BottomNavBar } from '../components/ui/BottomNavBar';
import type { NavTabKey } from '../components/ui/BottomNavBar';
import { HomeScreen } from '../screens/HomeScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

// Horizontal page slide: the outgoing and incoming tabs move together, in the direction of the
// tab order (progress is -1 for a tab on the left, 0 current, 1 on the right). Native-driven
// transform only, no opacity fade, so the pages read as one strip.
const slideTransition: Pick<BottomTabNavigationOptions, 'transitionSpec' | 'sceneStyleInterpolator'> = {
  transitionSpec: {
    animation: 'timing',
    config: { duration: 260, easing: Easing.out(Easing.cubic) },
  },
  sceneStyleInterpolator: ({ current }) => ({
    sceneStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-Dimensions.get('window').width, 0, Dimensions.get('window').width],
          }),
        },
      ],
    },
  }),
};

function TabBar({ state, navigation }: BottomTabBarProps) {
  const active = state.routes[state.index].name as NavTabKey;

  // Tabs mount lazily, so a page's first visit used to render in the middle of the slide. Once the first
  // screen is idle, mount the other tabs one at a time (so no single JS stall is long) and they are
  // already there when the slide starts.
  useEffect(() => {
    const names = ['Profile', 'History', 'Inbox'] as const;
    let handle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const preloadNext = (i: number) => {
      if (i >= names.length) return;
      // Idle callbacks only fire when the JS thread has nothing else to do, so a tap or a running slide
      // is never delayed; the timeout makes sure it still happens on a busy phone.
      handle = requestIdleCallback(
        () => {
          navigation.preload(names[i]);
          timer = setTimeout(() => preloadNext(i + 1), 300);
        },
        { timeout: 2000 },
      );
    };
    timer = setTimeout(() => preloadNext(0), 400);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      if (handle !== undefined) cancelIdleCallback(handle);
    };
  }, [navigation]);

  const onTabPress = (key: NavTabKey) => {
    const route = state.routes.find((r) => r.name === key);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (active !== key && !event.defaultPrevented) navigation.navigate(key);
  };

  // The scan screen sits on the root stack, above the tabs.
  const onScanPress = () => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('QrScan');

  return <BottomNavBar active={active} onTabPress={onTabPress} onScanPress={onScanPress} />;
}

export function MainTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, ...slideTransition }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="History" component={TransactionsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
