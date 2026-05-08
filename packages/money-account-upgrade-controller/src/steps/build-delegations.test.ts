import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import {
  createDelegation,
  getSmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit';
import {
  SIGNABLE_DELEGATION_TYPED_DATA,
  toDelegationStruct,
} from '@metamask/smart-accounts-kit/utils';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController';
import { buildDelegationStep } from './build-delegations';

jest.mock('@metamask/smart-accounts-kit', () => ({
  createDelegation: jest.fn(),
  getSmartAccountsEnvironment: jest.fn(),
}));

jest.mock(
  '@metamask/smart-accounts-kit/utils',
  () => ({
    SIGNABLE_DELEGATION_TYPED_DATA: { Delegation: [] },
    toDelegationStruct: jest.fn(),
  }),
  { virtual: true },
);

const mockCreateDelegation = jest.mocked(createDelegation);
const mockGetEnvironment = jest.mocked(getSmartAccountsEnvironment);
const mockToDelegationStruct = jest.mocked(toDelegationStruct);

const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const MOCK_CHAIN_ID = '0xaa36a7' as Hex; // 11155111 (Sepolia)
const MOCK_CHAIN_ID_DECIMAL = 11155111;
const MOCK_DELEGATE = '0x1111111111111111111111111111111111111111' as Hex;
const MOCK_DELEGATOR_IMPL = '0x2222222222222222222222222222222222222222' as Hex;
const MOCK_TOKEN = '0x3333333333333333333333333333333333333333' as Hex;
const MOCK_VAULT_ADAPTER = '0x4444444444444444444444444444444444444444' as Hex;
const MOCK_DELEGATION_MANAGER =
  '0x5555555555555555555555555555555555555555' as Hex;
const MOCK_ERC20_ENFORCER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const MOCK_REDEEMER_ENFORCER =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
const MOCK_VALUE_LTE_ENFORCER =
  '0xcccccccccccccccccccccccccccccccccccccccc' as Hex;
const OTHER_ADDRESS = '0x9999999999999999999999999999999999999999' as Hex;
const OTHER_CHAIN_ID = '0x1' as Hex;
const OTHER_TOKEN = '0x8888888888888888888888888888888888888888' as Hex;
const MOCK_SIGNATURE: Hex = `0x${'cd'.repeat(65)}`;

const MAX_UINT256 = 2n ** 256n - 1n;

// SDK-derived environment, with deliberately distinct enforcer addresses so
// the test can prove the step overrides them with the configured values.
const MOCK_ENVIRONMENT = {
  DelegationManager: MOCK_DELEGATION_MANAGER,
  caveatEnforcers: {
    ERC20TransferAmountEnforcer:
      '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead' as Hex,
    RedeemerEnforcer: '0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef' as Hex,
    ValueLteEnforcer: '0xfacefacefacefacefacefacefacefacefaceface' as Hex,
    UnrelatedEnforcer: '0x1234123412341234123412341234123412341234' as Hex,
  },
} as unknown as ReturnType<typeof getSmartAccountsEnvironment>;

const EXPECTED_ENVIRONMENT = {
  ...MOCK_ENVIRONMENT,
  caveatEnforcers: {
    ...MOCK_ENVIRONMENT.caveatEnforcers,
    ERC20TransferAmountEnforcer: MOCK_ERC20_ENFORCER,
    RedeemerEnforcer: MOCK_REDEEMER_ENFORCER,
    ValueLteEnforcer: MOCK_VALUE_LTE_ENFORCER,
  },
};

const MOCK_DELEGATION: ReturnType<typeof createDelegation> = {
  delegate: MOCK_DELEGATE,
  delegator: MOCK_ADDRESS,
  authority:
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex,
  caveats: [
    {
      enforcer: '0x6666666666666666666666666666666666666666' as Hex,
      terms: '0x' as Hex,
      args: '0x' as Hex,
    },
  ],
  salt: `0x${'42'.repeat(32)}`,
  signature: '0x' as Hex,
};

const MOCK_DELEGATION_STRUCT = {
  ...MOCK_DELEGATION,
  salt: BigInt(MOCK_DELEGATION.salt),
};

/**
 * Builds a `DelegationResponse` for use as a mocked `listDelegations` entry,
 * defaulting every identifying field to one that matches our run() config.
 * Tests override one field at a time to probe the matcher.
 *
 * @param overrides - Identifying fields to override.
 * @param overrides.delegator - The delegator address.
 * @param overrides.delegate - The delegate address.
 * @param overrides.chainIdHex - The chain ID in hex.
 * @param overrides.tokenAddress - The token address.
 * @returns A complete `DelegationResponse`.
 */
function makeDelegationResponse(
  overrides: {
    delegator?: Hex;
    delegate?: Hex;
    chainIdHex?: Hex;
    tokenAddress?: Hex;
  } = {},
): DelegationResponse {
  return {
    signedDelegation: {
      ...MOCK_DELEGATION,
      delegator: overrides.delegator ?? MOCK_ADDRESS,
      delegate: overrides.delegate ?? MOCK_DELEGATE,
      signature: '0x' as Hex,
    },
    metadata: {
      delegationHash: `0x${'ab'.repeat(32)}`,
      chainIdHex: overrides.chainIdHex ?? MOCK_CHAIN_ID,
      allowance: '0x00',
      tokenSymbol: 'mUSD',
      tokenAddress: overrides.tokenAddress ?? MOCK_TOKEN,
      type: 'lend',
    },
  };
}

type AllActions = MessengerActions<MoneyAccountUpgradeControllerMessenger>;
type AllEvents = MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type Mocks = {
  listDelegations: jest.Mock;
  signTypedMessage: jest.Mock;
  verifyDelegation: jest.Mock;
};

function setup(): {
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  const mocks: Mocks = {
    listDelegations: jest.fn().mockResolvedValue([]),
    signTypedMessage: jest.fn().mockResolvedValue(MOCK_SIGNATURE),
    verifyDelegation: jest.fn().mockResolvedValue({ valid: true }),
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:listDelegations',
    mocks.listDelegations,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:signTypedMessage',
    mocks.signTypedMessage,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:verifyDelegation',
    mocks.verifyDelegation,
  );

  const messenger: MoneyAccountUpgradeControllerMessenger = new Messenger({
    namespace: 'MoneyAccountUpgradeController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'AuthenticatedUserStorageService:listDelegations',
      'KeyringController:signTypedMessage',
      'ChompApiService:verifyDelegation',
    ],
    events: [],
    messenger,
  });

  return { messenger, mocks };
}

async function run(
  messenger: MoneyAccountUpgradeControllerMessenger,
): ReturnType<typeof buildDelegationStep.run> {
  return buildDelegationStep.run({
    messenger,
    address: MOCK_ADDRESS,
    chainId: MOCK_CHAIN_ID,
    delegateAddress: MOCK_DELEGATE,
    delegatorImplAddress: MOCK_DELEGATOR_IMPL,
    erc20TransferAmountEnforcer: MOCK_ERC20_ENFORCER,
    musdTokenAddress: MOCK_TOKEN,
    redeemerEnforcer: MOCK_REDEEMER_ENFORCER,
    valueLteEnforcer: MOCK_VALUE_LTE_ENFORCER,
    vedaVaultAdapterAddress: MOCK_VAULT_ADAPTER,
  });
}

describe('buildDelegationStep', () => {
  beforeEach(() => {
    mockGetEnvironment.mockReturnValue(MOCK_ENVIRONMENT);
    mockCreateDelegation.mockReturnValue(MOCK_DELEGATION);
    mockToDelegationStruct.mockReturnValue(MOCK_DELEGATION_STRUCT);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is named "build-delegation"', () => {
    expect(buildDelegationStep.name).toBe('build-delegation');
  });

  it('builds the delegation against the chain-specific environment with config-pinned enforcer addresses and a fresh 32-byte salt', async () => {
    const { messenger } = setup();

    await run(messenger);

    expect(mockGetEnvironment).toHaveBeenCalledWith(MOCK_CHAIN_ID_DECIMAL);
    expect(mockCreateDelegation).toHaveBeenCalledWith({
      environment: EXPECTED_ENVIRONMENT,
      scope: {
        type: 'erc20TransferAmount',
        tokenAddress: MOCK_TOKEN,
        maxAmount: MAX_UINT256,
      },
      from: MOCK_ADDRESS,
      to: MOCK_DELEGATE,
      caveats: [
        { type: 'redeemer', redeemers: [MOCK_VAULT_ADAPTER] },
        { type: 'valueLte', maxValue: 0n },
      ],
      // 32-byte 0x-prefixed hex string.
      salt: expect.stringMatching(/^0x[0-9a-f]{64}$/u) as Hex,
    });
  });

  describe('when listDelegations returns a delegation matching the config', () => {
    it('returns "already-done" without building, signing, or submitting', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([makeDelegationResponse()]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mockCreateDelegation).not.toHaveBeenCalled();
      expect(mocks.signTypedMessage).not.toHaveBeenCalled();
      expect(mocks.verifyDelegation).not.toHaveBeenCalled();
    });

    it('matches addresses and chainId case-insensitively', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({
          delegator: MOCK_ADDRESS.toUpperCase() as Hex,
          delegate: MOCK_DELEGATE.toUpperCase() as Hex,
          chainIdHex: MOCK_CHAIN_ID.toUpperCase() as Hex,
          tokenAddress: MOCK_TOKEN.toUpperCase() as Hex,
        }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mocks.signTypedMessage).not.toHaveBeenCalled();
    });

    it('returns "already-done" when the matching entry is one of several', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({ chainIdHex: OTHER_CHAIN_ID }),
        makeDelegationResponse(),
        makeDelegationResponse({ tokenAddress: OTHER_TOKEN }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
    });
  });

  describe('when no listed delegation matches the config', () => {
    it.each([
      ['delegator differs', { delegator: OTHER_ADDRESS }],
      ['delegate differs', { delegate: OTHER_ADDRESS }],
      ['chainIdHex differs', { chainIdHex: OTHER_CHAIN_ID }],
      ['tokenAddress differs', { tokenAddress: OTHER_TOKEN }],
    ])('proceeds when %s', async (_label, override) => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse(override),
      ]);

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mockCreateDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.signTypedMessage).toHaveBeenCalledTimes(1);
      expect(mocks.verifyDelegation).toHaveBeenCalledTimes(1);
    });

    it('proceeds when listDelegations is empty', async () => {
      const { messenger, mocks } = setup();

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.signTypedMessage).toHaveBeenCalledTimes(1);
      expect(mocks.verifyDelegation).toHaveBeenCalledTimes(1);
    });

    it('signs the delegation as EIP-712 V4 typed data scoped to the DelegationManager', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.signTypedMessage).toHaveBeenCalledWith(
        {
          from: MOCK_ADDRESS,
          data: {
            domain: {
              name: 'DelegationManager',
              version: '1',
              chainId: MOCK_CHAIN_ID_DECIMAL,
              verifyingContract: MOCK_DELEGATION_MANAGER,
            },
            types: SIGNABLE_DELEGATION_TYPED_DATA,
            primaryType: 'Delegation',
            message: MOCK_DELEGATION_STRUCT,
          },
        },
        SignTypedDataVersion.V4,
      );
    });

    it('submits the signed delegation to ChompApiService:verifyDelegation', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.verifyDelegation).toHaveBeenCalledWith({
        signedDelegation: {
          ...MOCK_DELEGATION,
          signature: MOCK_SIGNATURE,
        },
        chainId: MOCK_CHAIN_ID,
      });
    });

    it('throws when CHOMP rejects the delegation', async () => {
      const { messenger, mocks } = setup();
      mocks.verifyDelegation.mockResolvedValue({
        valid: false,
        errors: ['caveat mismatch', 'unknown enforcer'],
      });

      await expect(run(messenger)).rejects.toThrow(
        'CHOMP rejected delegation: caveat mismatch, unknown enforcer',
      );
    });

    it('throws with a default message when CHOMP rejects without errors', async () => {
      const { messenger, mocks } = setup();
      mocks.verifyDelegation.mockResolvedValue({ valid: false });

      await expect(run(messenger)).rejects.toThrow(
        'CHOMP rejected delegation: unknown error',
      );
    });
  });

  describe('error propagation', () => {
    it('propagates errors from listDelegations and does not build, sign, or submit', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockRejectedValue(new Error('storage failed'));

      await expect(run(messenger)).rejects.toThrow('storage failed');
      expect(mockCreateDelegation).not.toHaveBeenCalled();
      expect(mocks.signTypedMessage).not.toHaveBeenCalled();
      expect(mocks.verifyDelegation).not.toHaveBeenCalled();
    });

    it('propagates errors from signing and does not submit to CHOMP', async () => {
      const { messenger, mocks } = setup();
      mocks.signTypedMessage.mockRejectedValue(new Error('signing failed'));

      await expect(run(messenger)).rejects.toThrow('signing failed');
      expect(mocks.verifyDelegation).not.toHaveBeenCalled();
    });

    it('propagates errors from verifyDelegation', async () => {
      const { messenger, mocks } = setup();
      mocks.verifyDelegation.mockRejectedValue(new Error('chomp failed'));

      await expect(run(messenger)).rejects.toThrow('chomp failed');
    });
  });
});
