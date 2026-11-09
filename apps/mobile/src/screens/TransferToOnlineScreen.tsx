import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { TransferForm } from '../components/send/TransferForm';
import { CardTitleIcon } from '../components/ui/smallIcons';
import { useWalletTransfer } from '../hooks/useWalletTransfer';
import type { RootStackParamList } from '../navigation/types';

// Figma: Transfer to Online (870:3328), 402x874.
export function TransferToOnlineScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'TransferOnline'>) {
  // Withdraws from the offline vault: `/engine/withdraw`, signed with the wallet key and submitted from the phone.
  const { busy, transfer } = useWalletTransfer('online', navigation.goBack);
  return (
    <TransferForm
      to="online"
      title="Online Wallet"
      icon={<CardTitleIcon />}
      mood="phone"
      onBack={navigation.goBack}
      onConfirm={transfer}
      busy={busy}
    />
  );
}
