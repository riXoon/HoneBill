export const HORIZON_SERVER = Symbol('HORIZON_SERVER');

/**
 * Issuer of each supported asset. PHPC's comes from `PHPC_ISSUER_PUBKEY`, the same setting the anchor pays out
 * with, so balances are read from the asset users are actually paid in. The fallback is the original testnet issuer.
 * A getter, so the value is read when used, after the config file has been loaded.
 */
const LEGACY_PHPC_ISSUER = 'GDDKZAOAME26SD2GAQGGDUTI6F5VQ5CLXXELWOYOAXLUIQTQVLIFWZLY';

export const ASSET_ISSUERS: Record<string, string> = {
 //HPC: 'GDDKZAOAME26SD2GAQGGDUTI6F5VQ5CLXXELWOYOAXLUIQTQVLIFWZLY',
  PHPC: 'GBH62WU4CSD2VEBUNCQP5BTZPOITNBE6ERUPJKBZDF7RMIUE7O2VAJRG',
  get PHPC() {
    return process.env.PHPC_ISSUER_PUBKEY?.trim() || LEGACY_PHPC_ISSUER;
  },
  USDC: 'GDQGJU5JTW5IFCGS6JZTIGK57IKPW4N4LJWWEN7F3K3GSEJEYPVJ3BYA',
};