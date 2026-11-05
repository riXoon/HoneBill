import { Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { TransferForm } from '../components/send/TransferForm';
import { CardTitleIcon } from '../components/ui/smallIcons';
import type { RootStackParamList } from '../navigation/types';

// Figma: Transfer to Online (870:3328), 402x874.
export function TransferToOnlineScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'TransferOnline'>) {
  return (
    <TransferForm
      to="online"
      title="Online Wallet"
      icon={<CardTitleIcon />}
      mood="phone"
      onBack={navigation.goBack}
      // Withdrawing from the vault is `/engine/withdraw` (prepare, sign with the wallet key, submit), which is not
      // wired. Say so rather than showing a confirmation for money that never moved.
      onConfirm={() =>
        Alert.alert('Not available yet', 'Moving funds to your online wallet is not available yet. No money has been moved.')
      }
    />
  );
}
