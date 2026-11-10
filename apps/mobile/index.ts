// Must stay first: it installs crypto.getRandomValues, which wallet key generation
// (@scure/bip39) needs. Hermes has no secure random source of its own.
import 'react-native-get-random-values';

import { Buffer } from 'buffer';

import { registerRootComponent } from 'expo';

import App from './App';

// The Stellar SDK (loaded on the first signature, see src/services/wallet/signer.ts) expects Node's Buffer.
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer;
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
