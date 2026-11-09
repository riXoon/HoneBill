// Must stay first: it installs crypto.getRandomValues, which wallet key generation
// (@scure/bip39) needs. Hermes has no secure random source of its own.
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';

import App from './App';

// The rest of the old shims (Buffer, URL polyfill, Stellar SDK toXDR patch, WalletConnect compat)
// are still removed; restore them from git history when transaction signing is wired in.

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
