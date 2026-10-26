import { Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { TransferForm } from '../components/send/TransferForm';
import { OfflineFundsBadge } from '../components/ui/smallIcons';
import { formatPeso } from '../mocks/send';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';

// Figma: Transfer to Offline (870:3307), 402x874.
export function TransferToOfflineScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'TransferOffline'>) {
  return (
    <TransferForm
      to="offline"
      title="Offline Wallet"
      icon={<OfflineFundsBadge color={colors.text} />}
      mood="bill"
      onBack={navigation.goBack}
      // Mock: there is no confirmation frame or ledger yet, so say what would happen and go home.
      onConfirm={(amount) =>
        Alert.alert('Transfer queued (mock)', `${formatPeso(amount)} would move from your online wallet to your offline wallet.`, [
          { text: 'OK', onPress: navigation.goBack },
        ])
      }
    />
  );
}
