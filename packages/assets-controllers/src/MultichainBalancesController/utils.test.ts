import {
  BtcAccountType,
  SolAccountType,
  BtcMethod,
  SolMethod,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import { validate, Network } from 'bitcoin-address-validation';
import { v4 as uuidv4 } from 'uuid';

import { MultichainNetworks } from './constants';
import {
  getScopeForBtcAddress,
  getScopeForSolAddress,
  getScopeForAccount,
} from './utils';

const mockBtcAccount = {
  address: 'bc1qssdcp5kvwh6nghzg9tuk99xsflwkdv4hgvq58q',
  id: uuidv4(),
  metadata: {
    name: 'Bitcoin Account 1',
    importTime: Date.now(),
    keyring: {
      type: KeyringTypes.snap,
    },
    snap: {
      id: 'mock-btc-snap',
      name: 'mock-btc-snap',
      enabled: true,
    },
    lastSelected: 0,
  },
  options: {},
  methods: [BtcMethod.SendBitcoin],
  type: BtcAccountType.P2wpkh,
};

const mockSolAccount = {
  address: 'nicktrLHhYzLmoVbuZQzHUTicd2sfP571orwo9jfc8c',
  id: uuidv4(),
  metadata: {
    name: 'Solana Account 1',
    importTime: Date.now(),
    keyring: {
      type: KeyringTypes.snap,
    },
    snap: {
      id: 'mock-sol-snap',
      name: 'mock-sol-snap',
      enabled: true,
    },
    lastSelected: 0,
  },
  options: {
    scope: 'solana-scope',
  },
  methods: [SolMethod.SendAndConfirmTransaction],
  type: SolAccountType.DataAccount,
};

jest.mock('bitcoin-address-validation', () => ({
  validate: jest.fn(),
  Network: {
    mainnet: 'mainnet',
    testnet: 'testnet',
  },
}));

describe('getScopeForBtcAddress', () => {
  it('returns Bitcoin scope for a valid mainnet address', () => {
    const account = {
      ...mockBtcAccount,
      address: 'valid-mainnet-address',
    };
    (validate as jest.Mock).mockReturnValueOnce(true);

    const scope = getScopeForBtcAddress(account);

    expect(scope).toBe(MultichainNetworks.Bitcoin);
    expect(validate).toHaveBeenCalledWith(account.address, Network.mainnet);
  });

  it('returns BitcoinTestnet scope for a valid testnet address', () => {
    const account = {
      ...mockBtcAccount,
      address: 'valid-testnet-address',
    };
    (validate as jest.Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const scope = getScopeForBtcAddress(account);

    expect(scope).toBe(MultichainNetworks.BitcoinTestnet);
    expect(validate).toHaveBeenCalledWith(account.address, Network.mainnet);
    expect(validate).toHaveBeenCalledWith(account.address, Network.testnet);
  });

  it('throws an error for an invalid address', () => {
    const account = {
      ...mockBtcAccount,
      address: 'invalid-address',
    };
    (validate as jest.Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    expect(() => getScopeForBtcAddress(account)).toThrow(
      `Invalid Bitcoin address: ${account.address}`,
    );
    expect(validate).toHaveBeenCalledWith(account.address, Network.mainnet);
    expect(validate).toHaveBeenCalledWith(account.address, Network.testnet);
  });
});

describe('getScopeForSolAddress', () => {
  it('returns the scope for a valid Solana account', () => {
    const scope = getScopeForSolAddress(mockSolAccount);

    expect(scope).toBe('solana-scope');
  });

  it('throws an error if the Solana account scope is undefined', () => {
    const account = {
      ...mockSolAccount,
      options: {},
    };

    expect(() => getScopeForSolAddress(account)).toThrow(
      'Solana account scope is undefined',
    );
  });
});

describe('getScopeForAddress', () => {
  it('returns the scope for a Bitcoin account', () => {
    const account = {
      ...mockBtcAccount,
      address: 'valid-mainnet-address',
    };
    (validate as jest.Mock).mockReturnValueOnce(true);

    const scope = getScopeForAccount(account);

    expect(scope).toBe(MultichainNetworks.Bitcoin);
  });

  it('returns the scope for a Solana account', () => {
    const account = {
      ...mockSolAccount,
      options: { scope: 'solana-scope' },
    };

    const scope = getScopeForAccount(account);

    expect(scope).toBe('solana-scope');
  });

  it('throws an error for an unsupported account type', () => {
    const account = {
      ...mockSolAccount,
      type: 'unsupported-type',
    };

    // @ts-expect-error - We're testing an error case.
    expect(() => getScopeForAccount(account)).toThrow(
      `Unsupported non-EVM account type: ${account.type}`,
    );
  });
});
