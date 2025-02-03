import {
  BtcAccountType,
  SolAccountType,
  EthAccountType,
  type KeyringAccountType,
} from '@metamask/keyring-api';

export const MAP_SWIFT_ISO4217: Record<KeyringAccountType, string> = {
  [SolAccountType.DataAccount]: 'swift:0/iso4217:SOL',
  [BtcAccountType.P2wpkh]: 'swift:0/iso4217:BTC',
  [EthAccountType.Eoa]: 'swift:0/iso4217:ETH',
  [EthAccountType.Erc4337]: 'swift:0/iso4217:ETH',
};
