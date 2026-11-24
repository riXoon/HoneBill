import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * This app's version, from `version` in app.json. Read from the app config rather than the native app,
 * because in Expo Go the native app is Expo Go itself. Raise it in app.json for every release, and add that
 * version's notes to `content/releaseNotes.ts`.
 */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

/**
 * The build number Android/iOS use to tell installs apart (Android `versionCode`), raised by EAS on every build.
 * Null in Expo Go, where it would be Expo Go's own.
 */
export const APP_BUILD: string | null =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? null : (Application.nativeBuildVersion ?? null);

/** "1.1.0 (12)", or "1.1.0" without a build number. For the Profile footer and bug reports. */
export const APP_VERSION_LABEL = APP_BUILD ? `${APP_VERSION} (${APP_BUILD})` : APP_VERSION;
