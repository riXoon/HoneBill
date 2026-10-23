import { registerRootComponent } from 'expo';

import App from './App';

// Frontend-only entry: the Stellar SDK patch and WalletConnect compat shims
// (Buffer, random values, URL polyfill) were removed with the backend wiring.
// Restore them from git history when the logic is reconnected.

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
