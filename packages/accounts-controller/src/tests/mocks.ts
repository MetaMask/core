import {
  BtcAccountType,
  EthAccountType,
  BtcMethod,
  EthMethod,
  EthScope,
  BtcScope,
} from '@metamask/keyring-api';
import type { KeyringAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { v4 } from 'uuid';

export const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

export const ETH_ERC_4337_METHODS = [
  EthMethod.PatchUserOperation,
  EthMethod.PrepareUserOperation,
  EthMethod.SignUserOperation,
] as const;

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
} = {}): InternalAccount => {
  const getInternalAccountInfo = () => {
    switch (type) {
      case `${EthAccountType.Eoa}`:
        return {
          methods: [...Object.values(ETH_EOA_METHODS)],
          scopes: [EthScope.Eoa],
        };
      case `${EthAccountType.Erc4337}`:
        return {
          methods: [...Object.values(ETH_ERC_4337_METHODS)],
          scopes: [EthScope.Mainnet], // Assuming we are using mainnet for those Smart Accounts.
        };
      case `${BtcAccountType.P2wpkh}`:
        return {
          methods: [...Object.values(BtcMethod)],
          scopes: [BtcScope.Mainnet],
        };
      default:
        throw new Error(`Unknown account type: ${type as string}`);
    }
  };

  const { methods, scopes } = getInternalAccountInfo();

  return {
    id,
    address,
    options: {},
    methods,
    scopes,
    type,
    metadata: {
      name,
      keyring: { type: keyringType },
      importTime,
      lastSelected,
      // Use spread operator, to avoid having a `snap: undefined` if not defined.
      ...(snap ? { snap } : {}),
    },
  } as InternalAccount;
};

export const createExpectedInternalAccount = (
  args: Parameters<typeof createMockInternalAccount>[0],
) => {
  return createMockInternalAccount({
    ...args,
    importTime: expect.any(Number),
    lastSelected: expect.any(Number),
  });
};
