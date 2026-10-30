type RecordValue = Record<string, unknown>;

export type AccountUniqueConstraint =
  | 'shortId'
  | 'stellarPublicKey'
  | 'phoneNumber'
  | 'other'
  | null;

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' ? (value as RecordValue) : undefined;
}

function targetValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function classifyTarget(target: string): Exclude<AccountUniqueConstraint, null> | undefined {
  switch (target.toLowerCase()) {
    case 'shortid':
    case 'short_id':
    case 'account_short_id_key':
      return 'shortId';
    case 'stellarpublickey':
    case 'stellar_public_key':
    case 'account_stellar_public_key_key':
      return 'stellarPublicKey';
    case 'phonenumber':
    case 'phone_number':
    case 'account_phone_number_key':
      return 'phoneNumber';
    default:
      return undefined;
  }
}

export function classifyAccountUniqueConstraint(error: unknown): AccountUniqueConstraint {
  const errorRecord = asRecord(error);
  if (errorRecord?.code !== 'P2002') return null;

  const meta = asRecord(errorRecord.meta);
  const targets = targetValues(meta?.target);
  const adapterError = asRecord(meta?.driverAdapterError);
  const cause = asRecord(adapterError?.cause);
  const constraint = asRecord(cause?.constraint);

  targets.push(...targetValues(constraint?.index), ...targetValues(constraint?.name));
  targets.push(...targetValues(constraint?.fields));

  for (const target of targets) {
    const classified = classifyTarget(target);
    if (classified) return classified;
  }

  return 'other';
}
