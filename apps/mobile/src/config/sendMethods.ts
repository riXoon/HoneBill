const BLUE = '#00A1FF';
const GREEN = '#0BA98C';
const ORANGE = '#F08F31';

/** The pay-to rails listed under "Methods" on Send 1. Only HoneBill is open; the others show a "not available yet" notice. */
export const SEND_METHODS = [
  { key: 'honebill', label: 'Honebill', letter: 'H', color: ORANGE, isDefault: true, available: true },
  { key: 'maya', label: 'Maya', letter: 'M', color: GREEN, isDefault: false, available: false },
  { key: 'gcash', label: 'G-Xchange Inc. / GCash', letter: 'G', color: BLUE, isDefault: false, available: false },
] as const;
export type SendMethodKey = (typeof SEND_METHODS)[number]['key'];

/** Avatar colours for recipients. */
export const AVATAR_COLORS = [BLUE, GREEN, ORANGE] as const;
