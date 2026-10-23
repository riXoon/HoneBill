import { Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps, BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

import { BottomNavBar } from '../components/ui/BottomNavBar';
import type { NavTabKey } from '../components/ui/BottomNavBar';
import { AppBackground } from '../components/ui/AppBackground';
import { HomeScreen } from '../screens/HomeScreen';
import { colors, fonts } from '../theme';
import type { TabParamList } from './types';

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

  const onTabPress = (key: NavTabKey) => {
    const route = state.routes.find((r) => r.name === key);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (active !== key && !event.defaultPrevented) navigation.navigate(key);
  };

  // The QR scan screen is not built yet, so the centre button does nothing for now.
  return <BottomNavBar active={active} onTabPress={onTabPress} onScanPress={() => {}} />;
}

/** Stand-in until each tab's real screen is built. */
function ComingSoon({ title }: { title: string }) {
  return (
    <View style={styles.soon}>
      <AppBackground />
      <Text style={styles.soonText}>{title}</Text>
    </View>
  );
}

const InboxTab = () => <ComingSoon title="Inbox" />;
const HistoryTab = () => <ComingSoon title="History" />;
const ProfileTab = () => <ComingSoon title="Profile" />;

export function MainTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, ...slideTransition }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Inbox" component={InboxTab} />
      <Tab.Screen name="History" component={HistoryTab} />
      <Tab.Screen name="Profile" component={ProfileTab} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  soon: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  soonText: { fontFamily: fonts.bold, fontSize: 28, color: colors.text },
});
