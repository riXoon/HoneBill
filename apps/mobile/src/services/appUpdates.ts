import Storage from 'expo-sqlite/kv-store';

import { APP_VERSION } from '../config/appVersion';
import { RELEASE_NOTES } from '../content/releaseNotes';
import { compareVersions, isVersion } from '../utils/version';
import { getAppVersionInfo, type AppVersionInfo } from './api/appVersion';
import { reportError } from './errorReporting';

/**
 * App updates, kept on this phone (not per account):
 *   - "What's new" notes: the first launch of a new version adds its notes to the Inbox under Updates.
 *   - "Update available": the backend's newest release, when it is newer than this app.
 *   - "Update required": this app is older than the backend's minimum, so it must be updated before it is used
 *     (an old app could make payments the backend no longer accepts). The last answer is kept, so this holds offline too.
 */

export type UpdateEntry = {
  id: string;
  kind: 'release' | 'available';
  version: string;
  title: string;
  body: string;
  /** Unix ms, for sorting and the date shown. */
  at: number;
  read: boolean;
  /** `available` only: where the new APK is downloaded. */
  downloadUrl?: string;
};

export type UpdateState = {
  entries: UpdateEntry[];
  /** Set when this app is below the backend's minimum version. */
  required: { minimumVersion: string; downloadUrl: string | null } | null;
};

const ENTRIES_KEY = 'honebill.updates.entries';
const LAST_SEEN_KEY = 'honebill.updates.lastSeenVersion';
const INFO_KEY = 'honebill.updates.versionInfo';
const CHECKED_AT_KEY = 'honebill.updates.checkedAt';
/** How often the backend is asked, at most (the app also asks on every launch). */
const CHECK_EVERY_MS = 60 * 60 * 1000;

let state: UpdateState = { entries: [], required: null };
const listeners = new Set<() => void>();

function setState(next: UpdateState) {
  state = next;
  listeners.forEach((l) => l());
}

export function getUpdateState(): UpdateState {
  return state;
}

export function subscribeUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await Storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await Storage.setItem(key, JSON.stringify(value));
  } catch (e) {
    reportError(e, { step: 'appUpdates.write', key });
  }
}

function sorted(entries: UpdateEntry[]): UpdateEntry[] {
  return [...entries].sort((a, b) => b.at - a.at);
}

async function saveEntries(entries: UpdateEntry[]) {
  const next = sorted(entries);
  setState({ ...state, entries: next });
  await writeJson(ENTRIES_KEY, next);
}

/** Whether the backend's answer says this app is too old to use. */
function requiredFrom(info: AppVersionInfo | null): UpdateState['required'] {
  if (!info || !isVersion(info.minimumVersion)) return null;
  return compareVersions(APP_VERSION, info.minimumVersion) < 0
    ? { minimumVersion: info.minimumVersion, downloadUrl: info.downloadUrl }
    : null;
}

/** Adds the notes for every version newer than the last one this phone ran, up to this one (only this one on a first run). */
function withReleaseNotes(entries: UpdateEntry[], lastSeen: string | null): UpdateEntry[] {
  const have = new Set(entries.map((e) => e.id));
  const fresh = RELEASE_NOTES.filter(
    (note) =>
      compareVersions(note.version, APP_VERSION) <= 0 &&
      (lastSeen ? compareVersions(note.version, lastSeen) > 0 : note.version === APP_VERSION),
  )
    .filter((note) => !have.has(`release-${note.version}`))
    .map<UpdateEntry>((note) => ({
      id: `release-${note.version}`,
      kind: 'release',
      version: note.version,
      title: `What's new in ${note.version}`,
      body: note.title,
      at: Date.parse(note.date) || Date.now(),
      read: false,
    }));
  return [...entries, ...fresh];
}

/** Keeps at most one "update available" entry: for the newest release, and only while it is newer than this app. */
function withAvailable(entries: UpdateEntry[], info: AppVersionInfo): UpdateEntry[] {
  const latest = info.latestVersion;
  const newer = isVersion(latest) && compareVersions(latest, APP_VERSION) > 0;
  const kept = entries.filter((e) => e.kind !== 'available' || (newer && e.version === latest));
  if (!newer || kept.some((e) => e.kind === 'available')) return kept;
  return [
    ...kept,
    {
      id: `available-${latest}`,
      kind: 'available',
      version: latest,
      title: `Update available: HoneBill ${latest}`,
      body: info.latestNotes ?? 'Tap to download the new version.',
      at: Date.now(),
      read: false,
      downloadUrl: info.downloadUrl ?? undefined,
    },
  ];
}

/**
 * On launch: load what is stored, add this version's notes if it is new here, and apply the last known backend answer
 * (so "update required" holds offline). Then ask the backend, when online.
 */
export async function initAppUpdates(): Promise<void> {
  const [entries, lastSeen, info] = await Promise.all([
    readJson<UpdateEntry[]>(ENTRIES_KEY),
    Storage.getItem(LAST_SEEN_KEY).catch(() => null),
    readJson<AppVersionInfo>(INFO_KEY),
  ]);
  let next = withReleaseNotes(Array.isArray(entries) ? entries : [], lastSeen);
  // A stored "update available" for the version now installed (or older) is done.
  next = next.filter((e) => e.kind !== 'available' || compareVersions(e.version, APP_VERSION) > 0);
  setState({ entries: sorted(next), required: requiredFrom(info) });
  await writeJson(ENTRIES_KEY, state.entries);
  if (lastSeen !== APP_VERSION) await Storage.setItem(LAST_SEEN_KEY, APP_VERSION).catch(() => {});
  await checkForUpdate({ force: true });
}

/** Asks the backend about releases. Without `force`, at most once an hour. Network failures are ignored. */
export async function checkForUpdate({ force = false }: { force?: boolean } = {}): Promise<void> {
  const checkedAt = Number((await Storage.getItem(CHECKED_AT_KEY).catch(() => null)) ?? 0);
  if (!force && Date.now() - checkedAt < CHECK_EVERY_MS) return;
  let info: AppVersionInfo;
  try {
    info = await getAppVersionInfo();
  } catch {
    return; // Offline or the server is down: keep the last answer.
  }
  await Promise.all([writeJson(INFO_KEY, info), Storage.setItem(CHECKED_AT_KEY, String(Date.now())).catch(() => {})]);
  const entries = withAvailable(state.entries, info);
  setState({ entries: sorted(entries), required: requiredFrom(info) });
  await writeJson(ENTRIES_KEY, state.entries);
}

export async function markUpdateRead(id: string): Promise<void> {
  if (!state.entries.some((e) => e.id === id && !e.read)) return;
  await saveEntries(state.entries.map((e) => (e.id === id ? { ...e, read: true } : e)));
}
