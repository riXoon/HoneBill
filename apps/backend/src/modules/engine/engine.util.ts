import {
  Account,
  Address,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';

export function isPublicKey(value: unknown): value is string {
  return typeof value === 'string' && StrKey.isValidEd25519PublicKey(value);
}

export function parsePositiveI128(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed > 0n && parsed <= (1n << 127n) - 1n ? parsed : null;
  } catch {
    return null;
  }
}

export interface AuthInvocation {
  contractId: string;
  functionName: string;
  args: xdr.ScVal[];
  subInvocations?: xdr.SorobanAuthorizedInvocation[];
}

export function authorizedInvocation(input: AuthInvocation): xdr.SorobanAuthorizedInvocation {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: new Address(input.contractId).toScAddress(),
        functionName: input.functionName,
        args: input.args,
      }),
    ),
    subInvocations: input.subInvocations ?? [],
  });
}

/**
 * Replaces simulation auth with a SourceAccount entry that the mobile wallet
 * can satisfy by signing the returned envelope. The contract call arguments
 * are copied from simulation so generated ABI encodings remain authoritative.
 */
export function injectSourceAccountAuth(
  envelopeXdr: string,
  rootContractId: string,
  subInvocations: xdr.SorobanAuthorizedInvocation[] = [],
): string {
  const envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');
  let foundInvocation = false;
  for (const operation of envelope.v1().tx().operations()) {
    if (operation.body().switch().name !== 'invokeHostFunction') continue;
    const invoke = operation.body().invokeHostFunctionOp();
    const fn = invoke.hostFunction().invokeContract();
    if (!fn) continue;
    const root = new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(rootContractId).toScAddress(),
          functionName: fn.functionName(),
          args: fn.args(),
        }),
      ),
      subInvocations,
    });
    invoke.auth([
      new xdr.SorobanAuthorizationEntry({
        credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
        rootInvocation: root,
      }),
    ]);
    foundInvocation = true;
  }
  if (!foundInvocation) throw new Error('Soroban assembly produced no contract invocation');
  return envelope.toXDR('base64');
}

export function rebuildForSourceAccount(options: {
  envelopeXdr: string;
  sourceAccount: Account;
  networkPassphrase: string;
  fee?: string;
  sorobanData?: { build: () => unknown };
  timeoutSeconds?: number;
}): string {
  const envelope = xdr.TransactionEnvelope.fromXDR(options.envelopeXdr, 'base64');
  const original = envelope.v1().tx();
  const account = new Account(options.sourceAccount.accountId(), options.sourceAccount.sequenceNumber());
  const builder = new TransactionBuilder(account, {
    fee: options.fee ?? original.fee().toString(),
    networkPassphrase: options.networkPassphrase,
  });
  for (const operation of original.operations()) builder.addOperation(operation);
  const bounds = original.cond();
  if (bounds.switch().name === 'precondTime') {
    const time = bounds.timeBounds();
    const minTime = Number(time.minTime().toString());
    const maxTime = Number(time.maxTime().toString());
    if (maxTime > 0) builder.setTimebounds(minTime, maxTime);
    else builder.setTimeout(options.timeoutSeconds ?? 300);
  } else {
    builder.setTimeout(options.timeoutSeconds ?? 300);
  }
  if (options.sorobanData) builder.setSorobanData(options.sorobanData.build() as any);
  else if (original.ext().switch() === 1) builder.setSorobanData(original.ext().sorobanData());
  return builder.build().toEnvelope().toXDR('base64');
}

export function amountScVal(amount: bigint): xdr.ScVal {
  return nativeToScVal(amount, { type: 'i128' });
}
