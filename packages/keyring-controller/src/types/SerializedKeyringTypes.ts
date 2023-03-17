export interface SerializedLedgerKeyring {
  accounts: { address: string; hdPath: string }[];
  deviceId: string;
  hdPath: string;
}
