/** Someone the user can send money to, as the Send screens show them. */
export type Recipient = {
  /** The short ID for recipients resolved from the server. */
  id: string;
  name: string;
  initials: string;
  /** Avatar fill. */
  color: string;
  provider: string;
  account: string;
  shortId: string;
  /** The recipient's wallet address, which an online transfer pays. Absent for entries not resolved from the server. */
  stellarPublicKey?: string;
  favorite: boolean;
};
