import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts } from '../../theme';
import { messages, useLanguage } from '../../i18n';

// Each action is a 62 dp dark circle plus a label.
export type QuickActionKey = 'send' | 'receive' | 'topup' | 'online' | 'offline';

const ICON_BOX = '0 0 37.4286 37.75';
const stroke = { stroke: colors.surface, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

/** Same banknote-with-arrow shape as Receive, turned 180 degrees as in the Figma Send icon. */
function SendIcon() {
  // Figma draws this vector at 197x157; scaled 0.2 to ~39.6x31.6, so the stroke is widened to stay 3 dp.
  return (
    <Svg width={39.4} height={31.5} viewBox="0 0 197.166 157.555" style={{ transform: [{ rotate: '180deg' }] }}>
      <Path
        d="M98.583 117.416H20.9166C15.767 117.416 10.8283 115.381 7.18699 111.758C3.54567 108.135 1.5 103.221 1.5 98.097V20.8194C1.5 15.6956 3.54567 10.7816 7.18699 7.15852C10.8283 3.53543 15.767 1.5 20.9166 1.5H176.249C181.399 1.5 186.338 3.53543 189.979 7.15852C193.62 10.7816 195.666 15.6956 195.666 20.8194V69.1179M195.666 127.076L166.541 156.055L137.416 127.076M166.541 156.055V98.0963M156.833 59.4582H156.931M40.3332 59.4575H40.4314M118 59.4575C118 70.1273 109.306 78.7769 98.583 78.7769C87.8595 78.7769 79.1664 70.1273 79.1664 59.4575C79.1664 48.7877 87.8595 40.1381 98.583 40.1381C109.306 40.1381 118 48.7877 118 59.4575Z"
        {...stroke}
        strokeWidth={15}
      />
    </Svg>
  );
}

function ReceiveIcon() {
  return (
    <Svg width={37.43} height={37.75} viewBox={ICON_BOX}>
      <Path
        d="M18.7143 28.8183H6.2381C5.41087 28.8183 4.61753 28.4913 4.0326 27.9093C3.44766 27.3273 3.11905 26.5379 3.11905 25.7149V13.3011C3.11905 12.478 3.44766 11.6887 4.0326 11.1066C4.61753 10.5246 5.41087 10.1977 6.2381 10.1977H31.1905C32.0177 10.1977 32.811 10.5246 33.396 11.1066C33.9809 11.6887 34.3095 12.478 34.3095 13.3011V21.0597M34.3095 30.37L29.631 35.0252L24.9524 30.37M29.631 35.0252V25.7147M28.0714 19.508H28.0872M9.35714 19.5079H9.37293M21.8333 19.5079C21.8333 21.2218 20.4369 22.6113 18.7143 22.6113C16.9917 22.6113 15.5952 21.2218 15.5952 19.5079C15.5952 17.7939 16.9917 16.4044 18.7143 16.4044C20.4369 16.4044 21.8333 17.7939 21.8333 19.5079Z"
        {...stroke}
      />
    </Svg>
  );
}

/** A plus inside a ring, drawn in the same 37.4 dp box and 3 dp stroke as the other action icons. */
function TopUpIcon() {
  return (
    <Svg width={37.43} height={37.75} viewBox={ICON_BOX}>
      <Path
        d="M18.7143 6.2C25.6 6.2 31.1905 11.8 31.1905 18.7C31.1905 25.6 25.6 31.2 18.7143 31.2C11.8286 31.2 6.2381 25.6 6.2381 18.7C6.2381 11.8 11.8286 6.2 18.7143 6.2ZM18.7143 12.9V24.5M12.9 18.7H24.5"
        {...stroke}
      />
    </Svg>
  );
}

function OnlineIcon() {
  return (
    <Svg width={37.43} height={37.75} viewBox={ICON_BOX}>
      <Path
        d="M3.11883 15.5635H34.3093M9.35693 21.7704H12.476M6.23788 7.80495H31.1903C32.9129 7.80495 34.3093 9.1944 34.3093 10.9084V26.4256C34.3093 28.1395 32.9129 29.529 31.1903 29.529H6.23788C4.51528 29.529 3.11883 28.1395 3.11883 26.4256V10.9084C3.11883 9.1944 4.51528 7.80495 6.23788 7.80495Z"
        {...stroke}
      />
    </Svg>
  );
}

function OfflineIcon() {
  return (
    <Svg width={37.43} height={37.75} viewBox={ICON_BOX}>
      <Path
        d="M17.0474 8.08288C18.8215 8.59407 20.4387 9.54301 21.7503 10.8425C23.0618 12.142 24.0257 13.7503 24.5533 15.5196H27.37C28.5109 15.5196 29.6349 15.7953 30.6463 16.3232C31.6578 16.8511 32.5266 17.6155 33.179 18.5515C33.8314 19.4874 34.248 20.5671 34.3934 21.6987C34.5387 22.8303 34.4084 23.9803 34.0137 25.0507M29.4094 29.3828C28.7478 29.5814 28.0608 29.6821 27.37 29.6817H13.9947C11.5257 29.6813 9.12842 28.8514 7.18763 27.3252C5.24685 25.7991 3.87509 23.6651 3.29251 21.2658C2.70994 18.8665 2.95033 16.3411 3.97511 14.0948C4.99827 11.8521 6.7441 10.0175 8.93312 8.88447M8.93312 8.88447C8.93657 8.88268 8.94003 8.88089 8.94349 8.87911M8.93312 8.88447L2.97965 2.931M8.93312 8.88447L34.4511 34.4025"
        {...stroke}
      />
    </Svg>
  );
}

// Figma: Actions (870:3109), 88 dp columns. Only the transfer that leaves the current balance is offered,
// so the row is Send, Receive and one of the two transfers, centred in the 342 dp row.
const ACTIONS: { key: QuickActionKey; label: string; Icon: () => React.JSX.Element }[] = [
  { key: 'send', label: 'Send', Icon: SendIcon },
  { key: 'receive', label: 'Receive', Icon: ReceiveIcon },
  { key: 'topup', label: 'Top-up', Icon: TopUpIcon },
  { key: 'offline', get label() { return messages().quickActions.toOffline; }, Icon: OfflineIcon },
  { key: 'online', get label() { return messages().quickActions.toOnline; }, Icon: OnlineIcon },
];

const COLUMN = 88;
const ROW_WIDTH = 342;

type QuickActionsProps = {
  /** Online balance mode shows "Transfer to Offline Balance"; offline mode shows "Transfer to Online Balance". */
  online: boolean;
  onPress?: (key: QuickActionKey) => void;
};

export function QuickActions({ online, onPress }: QuickActionsProps) {
  // Re-renders the row when the language changes, so the transfer labels above are read again.
  useLanguage();
  // Online hides "Transfer to Online". Offline hides "Transfer to Offline" and Top-up.
  const actions = ACTIONS.filter(({ key }) => (online ? key !== 'online' : key !== 'offline' && key !== 'topup'));
  // Four columns of 88 dp would overflow the 342 dp row, so they shrink to fit.
  const column = Math.min(COLUMN, ROW_WIDTH / actions.length);
  const start = (ROW_WIDTH - actions.length * column) / 2;
  return (
    <View style={styles.row}>
      {actions.map(({ key, label, Icon }, i) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => onPress?.(key)}
          style={({ pressed }) => [styles.item, { left: start + i * column, width: column }, pressed && styles.pressed]}
        >
          <View style={styles.circle}>
            <Icon />
          </View>
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: ROW_WIDTH, height: 140 },
  item: { position: 'absolute', top: 0, width: COLUMN, height: 140, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 12, gap: 12 },
  pressed: { opacity: 0.7 },
  circle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    backgroundColor: colors.text,
    elevation: 4,
  },
  label: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 16, color: colors.text, textAlign: 'center' },
});
