import { Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { TransferForm } from '../components/send/TransferForm';
import { CardTitleIcon } from '../components/ui/smallIcons';
import { formatPeso } from '../mocks/send';
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
      // Mock: there is no confirmation frame or ledger yet, so say what would happen and go home.
      onConfirm={(amount) =>
        Alert.alert('Transfer queued (mock)', `${formatPeso(amount)} would move from your offline wallet to your online wallet.`, [
          { text: 'OK', onPress: navigation.goBack },
        ])
      }
    />
  );
}
