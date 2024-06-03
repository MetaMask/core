import type {
  InternalAccount,
  InternalAccountType,
} from '@metamask/keyring-api';
import {
  BtcAccountType,
  BtcMethod,
  EthAccountType,
  EthErc4337Method,
  EthMethod,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import { v4 } from 'uuid';

export const createMockInternalAccount = ({
  id = v4(),
  address = '0x2990079bcdee240329a520d2444386fc119da21a',
  type = EthAccountType.Eoa,
  name = 'Account 1',
  keyringType = KeyringTypes.hd,
  snap,
  importTime = Date.now(),
  lastSelected = Date.now(),
}: {
  id?: string;
  address?: string;
  type?: InternalAccountType;
  name?: string;
  keyringType?: KeyringTypes;
  snap?: {
    id: string;
    enabled: boolean;
    name: string;
  };
  importTime?: number;
  lastSelected?: number;
} = {}): InternalAccount => {
  let methods;

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
      break;
    case EthAccountType.Erc4337:
      methods = [
        EthErc4337Method.PatchUserOperation,
        EthErc4337Method.PrepareUserOperation,
        EthErc4337Method.SignUserOperation,
      ];
      break;
    case BtcAccountType.P2wpkh:
      methods = [BtcMethod.SendMany];
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
    metadata: {
      name,
      keyring: { type: keyringType },
      importTime,
      lastSelected,
      snap,
    },
  } as InternalAccount;
};
