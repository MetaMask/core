import type { InternalAccount } from '@metamask/keyring-api';
import { EthAccountType, EthMethod } from '@metamask/keyring-api';
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
  type?: EthAccountType;
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
  const methods =
    type === EthAccountType.Eoa
      ? [
          EthMethod.PersonalSign,
          EthMethod.Sign,
          EthMethod.SignTransaction,
          EthMethod.SignTypedDataV1,
          EthMethod.SignTypedDataV3,
          EthMethod.SignTypedDataV4,
        ]
      : [
          EthMethod.PatchUserOperation,
          EthMethod.PrepareUserOperation,
          EthMethod.SignUserOperation,
        ];

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
      snap: snap && snap,
    },
  };
};
