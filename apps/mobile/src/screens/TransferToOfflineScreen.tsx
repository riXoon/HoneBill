import { Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { TransferForm } from '../components/send/TransferForm';
import { OfflineFundsBadge } from '../components/ui/smallIcons';
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
      // Depositing into the vault is `/engine/deposit` (prepare, sign with the wallet key, submit), which is not
      // wired. Say so rather than showing a confirmation for money that never moved.
      onConfirm={() =>
        Alert.alert('Not available yet', 'Moving funds to your offline wallet is not available yet. No money has been moved.')
      }
    />
  );
}
