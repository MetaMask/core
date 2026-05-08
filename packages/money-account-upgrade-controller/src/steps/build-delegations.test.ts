import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import {
  ROOT_AUTHORITY,
  createERC20TransferAmountTerms,
  createRedeemerTerms,
  createValueLteTerms,
} from '@metamask/delegation-core';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController';
import { buildDelegationStep } from './build-delegations';

jest.mock('@metamask/delegation-core', () => ({
  ROOT_AUTHORITY:
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  createERC20TransferAmountTerms: jest.fn(),
  createRedeemerTerms: jest.fn(),
  createValueLteTerms: jest.fn(),
}));

const mockCreateErc20Terms = jest.mocked(createERC20TransferAmountTerms);
const mockCreateRedeemerTerms = jest.mocked(createRedeemerTerms);
const mockCreateValueLteTerms = jest.mocked(createValueLteTerms);

const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const MOCK_CHAIN_ID = '0xaa36a7' as Hex; // 11155111 (Sepolia)
const MOCK_CHAIN_ID_DECIMAL = 11155111;
const MOCK_DELEGATE = '0x1111111111111111111111111111111111111111' as Hex;
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

const MOCK_VALUE_LTE_TERMS: Hex = '0xa1';
const MOCK_ERC20_TERMS: Hex = '0xa2';
const MOCK_REDEEMER_TERMS: Hex = '0xa3';

const SIGNABLE_DELEGATION_TYPED_DATA = {
  Caveat: [
    { name: 'enforcer', type: 'address' },
    { name: 'terms', type: 'bytes' },
  ],
  Delegation: [
    { name: 'delegate', type: 'address' },
    { name: 'delegator', type: 'address' },
    { name: 'authority', type: 'bytes32' },
    { name: 'caveats', type: 'Caveat[]' },
    { name: 'salt', type: 'uint256' },
  ],
} as const;

const EXPECTED_CAVEATS = [
  { enforcer: MOCK_VALUE_LTE_ENFORCER, terms: MOCK_VALUE_LTE_TERMS, args: '0x' },
  { enforcer: MOCK_ERC20_ENFORCER, terms: MOCK_ERC20_TERMS, args: '0x' },
  { enforcer: MOCK_REDEEMER_ENFORCER, terms: MOCK_REDEEMER_TERMS, args: '0x' },
];

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
      delegate: overrides.delegate ?? MOCK_DELEGATE,
      delegator: overrides.delegator ?? MOCK_ADDRESS,
      authority: ROOT_AUTHORITY as Hex,
      caveats: [],
      salt: `0x${'42'.repeat(32)}`,
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
    delegationManager: MOCK_DELEGATION_MANAGER,
    delegatorImplAddress: '0x2222222222222222222222222222222222222222' as Hex,
    erc20TransferAmountEnforcer: MOCK_ERC20_ENFORCER,
    musdTokenAddress: MOCK_TOKEN,
    redeemerEnforcer: MOCK_REDEEMER_ENFORCER,
    valueLteEnforcer: MOCK_VALUE_LTE_ENFORCER,
    vedaVaultAdapterAddress: MOCK_VAULT_ADAPTER,
  });
}

describe('buildDelegationStep', () => {
  beforeEach(() => {
    // The term creators are overloaded over output encoding; the runtime path
    // picks the hex overload, but `jest.mocked()` picks the bytes overload, so
    // cast through `never` to satisfy both.
    mockCreateValueLteTerms.mockReturnValue(MOCK_VALUE_LTE_TERMS as never);
    mockCreateErc20Terms.mockReturnValue(MOCK_ERC20_TERMS as never);
    mockCreateRedeemerTerms.mockReturnValue(MOCK_REDEEMER_TERMS as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is named "build-delegation"', () => {
    expect(buildDelegationStep.name).toBe('build-delegation');
  });

  it('encodes each caveat with the configured enforcer addresses', async () => {
    const { messenger } = setup();

    await run(messenger);

    expect(mockCreateValueLteTerms).toHaveBeenCalledWith({ maxValue: 0n });
    expect(mockCreateErc20Terms).toHaveBeenCalledWith({
      tokenAddress: MOCK_TOKEN,
      maxAmount: 2n ** 256n - 1n,
    });
    expect(mockCreateRedeemerTerms).toHaveBeenCalledWith({
      redeemers: [MOCK_VAULT_ADAPTER],
    });
  });

  describe('when listDelegations returns a delegation matching the config', () => {
    it('returns "already-done" without building, signing, or submitting', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([makeDelegationResponse()]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mockCreateErc20Terms).not.toHaveBeenCalled();
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

    it('signs the delegation as EIP-712 V4 typed data scoped to the DelegationManager, with a fresh 32-byte salt', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.signTypedMessage).toHaveBeenCalledTimes(1);
      const [params, version] = mocks.signTypedMessage.mock.calls[0];
      expect(version).toBe(SignTypedDataVersion.V4);
      expect(params.from).toBe(MOCK_ADDRESS);
      expect(params.data.domain).toStrictEqual({
        name: 'DelegationManager',
        version: '1',
        chainId: MOCK_CHAIN_ID_DECIMAL,
        verifyingContract: MOCK_DELEGATION_MANAGER,
      });
      expect(params.data.types).toStrictEqual(SIGNABLE_DELEGATION_TYPED_DATA);
      expect(params.data.primaryType).toBe('Delegation');
      expect(params.data.message.delegate).toBe(MOCK_DELEGATE);
      expect(params.data.message.delegator).toBe(MOCK_ADDRESS);
      expect(params.data.message.authority).toBe(ROOT_AUTHORITY);
      expect(params.data.message.caveats).toStrictEqual(EXPECTED_CAVEATS);
      expect(typeof params.data.message.salt).toBe('bigint');
    });

    it('uses a fresh 32-byte salt on each call', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);
      await run(messenger);

      const saltA = mocks.signTypedMessage.mock.calls[0][0].data.message.salt;
      const saltB = mocks.signTypedMessage.mock.calls[1][0].data.message.salt;
      expect(saltA).not.toBe(saltB);
    });

    it('submits the signed delegation to ChompApiService:verifyDelegation, with hex salt', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.verifyDelegation).toHaveBeenCalledTimes(1);
      const submitted = mocks.verifyDelegation.mock.calls[0][0];
      expect(submitted.chainId).toBe(MOCK_CHAIN_ID);
      expect(submitted.signedDelegation.delegate).toBe(MOCK_DELEGATE);
      expect(submitted.signedDelegation.delegator).toBe(MOCK_ADDRESS);
      expect(submitted.signedDelegation.authority).toBe(ROOT_AUTHORITY);
      expect(submitted.signedDelegation.caveats).toStrictEqual(EXPECTED_CAVEATS);
      expect(submitted.signedDelegation.signature).toBe(MOCK_SIGNATURE);
      expect(submitted.signedDelegation.salt).toMatch(/^0x[0-9a-f]{64}$/u);
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
      expect(mockCreateErc20Terms).not.toHaveBeenCalled();
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
