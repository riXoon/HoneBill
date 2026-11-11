#!/usr/bin/env node
/**
 * Adds a trustline from an account to an asset, so the account can receive it. Run it for the gateway (relayer) when
 * offline settlements fail with "Missing token trustline for account G...": the settlement contract pays the gateway
 * its toll in that token, and Stellar refuses a payment to an account that does not trust the asset.
 *
 *   ACCOUNT_SECRET=S... ASSET_ISSUER=G... node apps/backend/scripts/add-trustline.mjs
 *
 * Optional: ASSET_CODE (default PHPC), HORIZON_URL (default testnet), NETWORK_PASSPHRASE (default testnet).
 * The secret is read from the environment only; it is never printed or written anywhere. Safe to re-run: an account
 * that already trusts the asset is left as it is.
 */
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

const secret = (process.env.ACCOUNT_SECRET ?? '').trim();
const issuer = (process.env.ASSET_ISSUER ?? '').trim();
const code = (process.env.ASSET_CODE ?? 'PHPC').trim();
const horizonUrl = (process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org').trim();
const passphrase = (process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET).trim();

if (!secret || !issuer) {
  console.error('Set ACCOUNT_SECRET (the account that needs the trustline) and ASSET_ISSUER (the asset issuer G... key).');
  process.exit(1);
}

const keypair = Keypair.fromSecret(secret);
const asset = new Asset(code, issuer);
const server = new Horizon.Server(horizonUrl);

const account = await server.loadAccount(keypair.publicKey());
const existing = account.balances.find((b) => b.asset_code === code && b.asset_issuer === issuer);
if (existing) {
  console.log(`${keypair.publicKey()} already trusts ${code}/${issuer} (balance ${existing.balance}). Nothing to do.`);
  process.exit(0);
}

const tx = new TransactionBuilder(account, { fee: '1000', networkPassphrase: passphrase })
  .addOperation(Operation.changeTrust({ asset }))
  .setTimeout(60)
  .build();
tx.sign(keypair);

try {
  const result = await server.submitTransaction(tx);
  console.log(`Trustline added: ${keypair.publicKey()} now trusts ${code}/${issuer}. Tx ${result.hash}`);
} catch (error) {
  const codes = error?.response?.data?.extras?.result_codes;
  console.error('Stellar rejected the transaction:', codes ? JSON.stringify(codes) : error?.message ?? error);
  process.exit(1);
}
