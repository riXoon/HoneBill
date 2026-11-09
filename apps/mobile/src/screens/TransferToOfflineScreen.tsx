import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { TransferForm } from '../components/send/TransferForm';
import { OfflineFundsBadge } from '../components/ui/smallIcons';
import { useWalletTransfer } from '../hooks/useWalletTransfer';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';

// Figma: Transfer to Offline (870:3307), 402x874.
export function TransferToOfflineScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'TransferOffline'>) {
  // Deposits into the offline vault: `/engine/deposit`, signed with the wallet key and submitted from the phone.
  const { busy, transfer } = useWalletTransfer('offline', navigation.goBack);
  return (
    <TransferForm
      to="offline"
      title="Offline Wallet"
      icon={<OfflineFundsBadge color={colors.text} />}
      mood="bill"
      onBack={navigation.goBack}
      onConfirm={transfer}
      busy={busy}
    />
  );
}
