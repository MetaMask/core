import {
  EthScope,
  BtcScope,
  SolScope,
  BtcAccountType,
  EthAccountType,
  SolAccountType,
  BtcMethod,
  EthMethod,
  SolMethod,
  type KeyringAccountType,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

/**
 * Creates a mock internal account. This is a duplicated function from the accounts-controller package
 * This exists here to prevent circular dependencies with the accounts-controller package
 *
 * @param args - Arguments to this function.
 * @param args.id - The ID of the account.
 * @param args.address - The address of the account.
 * @param args.type - The type of the account.
 * @param args.name - The name of the account.
 * @param args.keyringType - The keyring type of the account.
 * @param args.snap - The snap of the account.
 * @param args.snap.id - The ID of the snap.
 * @param args.snap.enabled - Whether the snap is enabled.
 * @param args.snap.name - The name of the snap.
 * @param args.importTime - The import time of the account.
 * @param args.lastSelected - The last selected time of the account.
 * @param args.scopes - The scopes of the account.
 * @returns A mock internal account.
 */
export const createMockInternalAccount = ({
  id = 'dummy-id',
  address = '0x2990079bcdee240329a520d2444386fc119da21a',
  type = EthAccountType.Eoa,
  name = 'Account 1',
  keyringType = KeyringTypes.hd,
  snap,
  importTime = Date.now(),
  lastSelected = Date.now(),
  scopes,
}: {
  id?: string;
  address?: string;
  type?: KeyringAccountType;
  name?: string;
  keyringType?: KeyringTypes;
  snap?: {
    id: string;
    enabled: boolean;
    name: string;
  };
  importTime?: number;
  lastSelected?: number;
  scopes?: string[];
} = {}): InternalAccount => {
  let methods;
  let newScopes = scopes;

  switch (type) {
    case EthAccountType.Eoa:
      methods = [
        EthMethod.PersonalSign,
        EthMethod.Sign,
        EthMethod.SignTransaction,
        EthMethod.SignTypedDataV1,
        EthMethod.SignTypedDataV3,
        EthMethod.SignTypedDataV4,
      ];
      newScopes = [EthScope.Eoa];
      break;
    case EthAccountType.Erc4337:
      methods = [
        EthMethod.PatchUserOperation,
        EthMethod.PrepareUserOperation,
        EthMethod.SignUserOperation,
      ];
      newScopes = [EthScope.Mainnet];
      break;
    case BtcAccountType.P2wpkh:
      methods = [BtcMethod.SendBitcoin];
      newScopes = [BtcScope.Mainnet];
      break;
    case SolAccountType.DataAccount:
      methods = [SolMethod.SendAndConfirmTransaction];
      newScopes = [SolScope.Mainnet, SolScope.Devnet];
      break;
    default:
      throw new Error(`Unknown account type: ${type as string}`);
  }

  return {
    id,
    address,
    options: {},
    methods,
    type,
    scopes: newScopes,
    metadata: {
      name,
      keyring: { type: keyringType },
      importTime,
      lastSelected,
      snap,
    },
  } as InternalAccount;
};
