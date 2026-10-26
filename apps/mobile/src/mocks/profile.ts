/** Mock account for the Profile tab (Figma 942:5362) until the real profile data is wired in. */
export const mockProfile = {
  name: 'Erickson Guhilde',
  /** Name used in the tab banners ("Hello, Erickson!"). */
  greetingName: 'Erickson',
  phone: '0912 345 6789',
  walletId: 'J7856X',
  /** Shortened for display, as in the design. */
  vaultAddressShort: 'GH456F6X003...7YUI0996XXXJ',
  /** Mock full address that Copy puts on the clipboard. */
  vaultAddress: 'GH456F6X003MOCKMOCKMOCKMOCKMOCKMOCKMOCKMOCK7YUI0996XXXJ',
} as const;
