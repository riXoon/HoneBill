/** Queue name shared by the Phase 5 SMS producer and the Phase 4 settlement worker. */
export const SETTLEMENT_QUEUE_NAME = 'engine-settlement';
/** Job type identifies inbound offline voucher settlement requests. */
export const SETTLEMENT_JOB_NAME = 'process-offline-voucher';

export interface SettlementJobData {
  smsBody: string;
  senderPhone?: string;
  traceId?: string;
}
