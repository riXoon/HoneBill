import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors, fonts } from '../../theme';
import { formatPeso } from '../../utils/format';
import { HoneBillMark } from '../brand/HoneBillMark';
import { useT } from '../../i18n';

export const QR_CARD_WIDTH = 300;
const QR_BOX = 220;
const QR_SIZE = 184;

type Props = {
  /** The encoded payment request (`honebill://pay?id=…`). */
  value: string;
  /** Whose code this is. */
  name: string;
  /** A requested amount in pesos; leave out for a Short ID-only code. */
  amount?: number;
  /** Ref to the card, for capturing it as the saved/shared image. */
  cardRef?: RefObject<View | null>;
};

/**
 * The HoneBill QR card: brand header, the code, and a footer. It is a self-contained, opaque image-sized view,
 * so capturing it gives the whole card, ready to save or share.
 */
export function QrCard({ value, name, amount, cardRef }: Props) {
  const t = useT();
  const hasAmount = amount !== undefined && amount > 0;
  return (
    <View
      ref={cardRef}
      collapsable={false}
      style={styles.card}
      accessibilityLabel={hasAmount ? t.qrCard.a11yAmount(name, formatPeso(amount)) : t.qrCard.a11y(name)}
    >
      <View style={styles.header}>
        <HoneBillMark width={54} />
        <Text style={styles.brand}>HoneBill</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>{hasAmount ? t.qrCard.pay : t.qrCard.sendTo}</Text>
        <Text style={styles.name} numberOfLines={2}>
          {name || t.qrCard.user}
        </Text>

        {hasAmount ? <Text style={styles.amount}>{formatPeso(amount)}</Text> : null}

        <View style={styles.qrBox}>
          <QRCode value={value} size={QR_SIZE} color={colors.text} backgroundColor={colors.surface} quietZone={0} ecl="M" />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t.qrCard.scanWith}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: QR_CARD_WIDTH,
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    backgroundColor: colors.yellow,
  },
  brand: { fontFamily: fonts.semibold, fontSize: 24, color: colors.primary },
  body: { alignItems: 'center', gap: 4, paddingTop: 18, paddingBottom: 20, paddingHorizontal: 16 },
  label: { fontFamily: fonts.light, fontSize: 12, letterSpacing: 1.5, color: colors.textMuted },
  name: { fontFamily: fonts.medium, fontSize: 20, color: colors.text, textAlign: 'center' },
  amount: { fontFamily: fonts.semibold, fontSize: 32, color: colors.primary, textAlign: 'center' },
  qrBox: {
    marginTop: 12,
    width: QR_BOX,
    height: QR_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primarySoft,
    backgroundColor: colors.surface,
  },
  footer: { alignItems: 'center', paddingVertical: 12, backgroundColor: colors.primary },
  footerText: { fontFamily: fonts.regular, fontSize: 15, color: colors.surface },
});
