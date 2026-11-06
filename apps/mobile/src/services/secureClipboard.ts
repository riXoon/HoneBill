import { AppState } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/**
 * Copy for secrets (the recovery phrase). Any app can read the clipboard, so the copy is wiped after
 * `ttlMs`, but only if it still holds our text, so we never erase something the user copied since.
 * Best effort: Android 10+ blocks clipboard reads while the app is in the background, so if the user is
 * elsewhere when the time is up, the wipe happens when they come back to the app.
 */
const DEFAULT_TTL_MS = 60_000;

let pending: { text: string; expiresAt: number; timer: ReturnType<typeof setTimeout> } | null = null;
let listening = false;

async function wipeIfStillThere(): Promise<void> {
  const current = pending;
  if (!current) return;
  pending = null;
  clearTimeout(current.timer);
  try {
    if ((await Clipboard.getStringAsync()) === current.text) await Clipboard.setStringAsync('');
  } catch {
    // The clipboard was unreadable; nothing more we can do.
  }
}

function watchForeground(): void {
  if (listening) return;
  listening = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && pending && Date.now() >= pending.expiresAt) void wipeIfStillThere();
  });
}

export async function copySensitive(text: string, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
  await Clipboard.setStringAsync(text);
  if (pending) clearTimeout(pending.timer);
  pending = { text, expiresAt: Date.now() + ttlMs, timer: setTimeout(() => void wipeIfStillThere(), ttlMs) };
  watchForeground();
}
