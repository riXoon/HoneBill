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
export type ReleaseNoteSection = {
  heading: string;
  /** Short, one line each. */
  items: string[];
};

export type ReleaseNote = {
  version: string;
  /** ISO date, e.g. "2026-11-14". */
  date: string;
  /** One line, shown in the Inbox notice. */
  title: string;
  sections: ReleaseNoteSection[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.1.0',
    date: '2026-11-14',
    title: 'Forgot MPIN, safer sign-in, clearer payments and bigger text',
    sections: [
      {
        heading: 'New',
        items: [
          'Forgot your MPIN? Tap "Forgot MPIN?" on the sign-in screen and reset it with a code sent to your number.',
          'Help & Feedback in Profile: report a problem or send a suggestion. You can attach a payment, and reports written offline are sent once you are back online.',
          "What's new and app update notices now arrive here in your Inbox.",
        ],
      },
      {
        heading: 'Payments',
        items: [
          'Offline payments by SMS now get a reply text: received, processing, successful, or rejected with the reason. Both the sender and the receiver are told.',
          'Each payment in History shows whether it went through, is still waiting, or failed and why. Home tells you when a waiting payment finishes.',
          'Send offline payments even without internet to check the Short ID. You will see a reminder to double-check it.',
          'A loading screen shows while a payment is being made, and Back is disabled until it is done.',
        ],
      },
      {
        heading: 'Security',
        items: [
          'HoneBill locks itself after 30 seconds in the background, and opens on the MPIN screen when you reopen it.',
          'Changing your MPIN or email now asks for a code sent to your number, and each can be changed once every 24 hours.',
          'After changing your MPIN you sign in again with the new one.',
          'An email already used by another account can no longer be added.',
          'Signing out now asks you to confirm first.',
        ],
      },
      {
        heading: 'Easier to use',
        items: [
          'Bigger, easier-to-read text across the app.',
          'A loading screen while you sign in.',
          'Clearer messages: warnings now look like warnings, not errors.',
          'The "Resend code" link is easier to see.',
          'Example text in input boxes shows what to type.',
          "Honi's speech bubbles can now be read by screen readers.",
        ],
      },
      {
        heading: 'Fixes',
        items: [
          'Transferring funds from your online balance to your offline balance works again.',
          'The confirmation text after an offline SMS payment now arrives.',
          'Buttons on the Profile page respond to taps again.',
        ],
      },
    ],
  },
];

export function releaseNoteFor(version: string): ReleaseNote | undefined {
  return RELEASE_NOTES.find((note) => note.version === version);
}
