import { StyleSheet, View } from 'react-native';

import { useLoadingMessage } from '../../hooks/useLoadingMessage';
import { Mascot } from '../mascot/Mascot';
import { SpeechBubble } from './SpeechBubble';
import { useT } from '../../i18n';

/** Honi says it and nudges the user to start: shown wherever transactions would be listed. */

type EmptyStateProps = {
  message?: string;
  isError?: boolean;
  /** Data is on its way: Honi chats away with rotating lines instead of saying the list is empty. */
  loading?: boolean;
};

/** Honi's idle animation (the same one the offline Home uses), with the message as his speech bubble above him. */
export function EmptyState({ message, isError = false, loading = false }: EmptyStateProps) {
  const t = useT();
  const chatter = useLoadingMessage(loading);
  return (
    <View style={styles.wrap}>
      <SpeechBubble message={loading ? chatter : (message ?? t.history.empty)} isError={isError} />
      {/* The Lottie canvas is larger than the box (soft glow), so the slot is sized to the picture, not the canvas. */}
      <View style={styles.honi} pointerEvents="none">
        <Mascot mood="idlePlain" width={347} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4, paddingTop: 4 },
  honi: { height: 224, alignItems: 'center', justifyContent: 'center' },
});
