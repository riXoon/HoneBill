/**
 * What's new in each release, newest first. Written for the people using the app: what they can now do, not how.
 *
 * On every release:
 *   1. raise `version` in app.json;
 *   2. add an entry here with that exact version, at the top;
 *   3. after the APK is published, set APP_LATEST_VERSION (and APP_DOWNLOAD_URL) on the backend, so older apps
 *      are told an update is out.
 * The first launch of the new version puts its entry in the Inbox under Updates.
 */
export type ReleaseNote = {
  version: string;
  /** ISO date, e.g. "2026-11-14". */
  date: string;
  title: string;
  /** Short, one line each. */
  items: string[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.1.0',
    date: '2026-11-14',
    title: 'Safer sign-in and clearer payments',
    items: [
      'Forgot your MPIN? Reset it from the sign-in screen with a code sent to your number.',
      'Changing your MPIN or email now asks for a code sent to your number.',
      'HoneBill locks itself when you leave it for 30 seconds, and opens on the MPIN screen.',
      'Bigger, easier-to-read text across the app.',
      'See what happened to each payment: sent, waiting, or failed and why.',
      'Send offline payments even when you have no internet to check the Short ID.',
      'Report a problem or send feedback from Profile > Help & Feedback.',
    ],
  },
];

export function releaseNoteFor(version: string): ReleaseNote | undefined {
  return RELEASE_NOTES.find((note) => note.version === version);
}
