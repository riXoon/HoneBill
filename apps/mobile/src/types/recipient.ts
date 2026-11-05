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
  favorite: boolean;
};
