import { jest } from '@jest/globals';
import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import {
  ROOT_AUTHORITY,
  createERC20TransferAmountTerms,
  createRedeemerTerms,
  createValueLteTerms,
  hashDelegation,
} from '@metamask/delegation-core';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController.js';
import { buildDelegationStep } from './build-delegations.js';

jest.mock('@metamask/delegation-core', () => ({
  ROOT_AUTHORITY:
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  createERC20TransferAmountTerms: jest.fn(),
  createRedeemerTerms: jest.fn(),
  createValueLteTerms: jest.fn(),
  hashDelegation: jest.fn(),
}));

const mockCreateErc20Terms = jest.mocked(createERC20TransferAmountTerms);
const mockCreateRedeemerTerms = jest.mocked(createRedeemerTerms);
const mockCreateValueLteTerms = jest.mocked(createValueLteTerms);
const mockHashDelegation = jest.mocked(hashDelegation);

const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const MOCK_CHAIN_ID = '0xaa36a7' as Hex; // 11155111 (Sepolia)
const MOCK_DELEGATE = '0x1111111111111111111111111111111111111111' as Hex;
const MOCK_MUSD = '0x3333333333333333333333333333333333333333' as Hex;
const MOCK_BORING_VAULT = '0x7777777777777777777777777777777777777777' as Hex;
const MOCK_VAULT_ADAPTER = '0x4444444444444444444444444444444444444444' as Hex;
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
const MOCK_MUSD_ERC20_TERMS: Hex = '0xa2';
const MOCK_VMUSD_ERC20_TERMS: Hex = '0xa4';
const MOCK_REDEEMER_TERMS: Hex = '0xa3';
const MOCK_MUSD_DELEGATION_HASH: Hex = `0x${'ee'.repeat(32)}`;
const MOCK_VMUSD_DELEGATION_HASH: Hex = `0x${'ff'.repeat(32)}`;
const MAX_UINT256_HEX: Hex = `0x${'f'.repeat(64)}`;

type ExpectedCaveat = { enforcer: Hex; terms: Hex; args: '0x' };
const expectedCaveats = (erc20Terms: Hex): ExpectedCaveat[] => [
  {
    enforcer: MOCK_VALUE_LTE_ENFORCER,
    terms: MOCK_VALUE_LTE_TERMS,
    args: '0x',
  },
  { enforcer: MOCK_ERC20_ENFORCER, terms: erc20Terms, args: '0x' },
  { enforcer: MOCK_REDEEMER_ENFORCER, terms: MOCK_REDEEMER_TERMS, args: '0x' },
];

/**
 * Builds a `DelegationResponse` for use as a mocked `listDelegations` entry,
 * defaulting every identifying field to the deposit-side delegation, and
 * including a redeemer caveat that points at the Veda vault adapter. Tests
 * override one field at a time to probe the matcher.
 *
 * @param overrides - Identifying fields to override.
 * @param overrides.delegator - The delegator address.
 * @param overrides.delegate - The delegate address.
 * @param overrides.chainIdHex - The chain ID in hex.
 * @param overrides.tokenAddress - The token address.
 * @param overrides.caveats - The caveats attached to the delegation. Defaults
 * to a single redeemer caveat targeting the Veda vault adapter.
 * @returns A complete `DelegationResponse`.
 */
function makeDelegationResponse(
  overrides: {
    delegator?: Hex;
    delegate?: Hex;
    chainIdHex?: Hex;
    tokenAddress?: Hex;
    caveats?: { enforcer: Hex; terms: Hex; args: Hex }[];
  } = {},
): DelegationResponse {
  return {
    signedDelegation: {
      delegate: overrides.delegate ?? MOCK_DELEGATE,
      delegator: overrides.delegator ?? MOCK_ADDRESS,
      authority: ROOT_AUTHORITY as Hex,
      caveats: overrides.caveats ?? [
        {
          enforcer: MOCK_REDEEMER_ENFORCER,
          terms: MOCK_REDEEMER_TERMS,
          args: '0x',
        },
      ],
      salt: `0x${'42'.repeat(32)}`,
      signature: '0x' as Hex,
    },
    metadata: {
      delegationHash: `0x${'ab'.repeat(32)}`,
      chainIdHex: overrides.chainIdHex ?? MOCK_CHAIN_ID,
      allowance: '0x00',
      tokenSymbol: 'mUSD',
      tokenAddress: overrides.tokenAddress ?? MOCK_MUSD,
      type: 'lend',
    },
  };
}

type AllActions = MessengerActions<MoneyAccountUpgradeControllerMessenger>;
type AllEvents = MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type Mocks = {
  listDelegations: jest.Mock;
  signDelegation: jest.Mock;
  verifyDelegation: jest.Mock;
  createDelegation: jest.Mock;
};

function setup(): {
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  const mocks: Mocks = {
    listDelegations: jest.fn().mockResolvedValue([]),
    signDelegation: jest.fn().mockResolvedValue(MOCK_SIGNATURE),
    verifyDelegation: jest.fn().mockResolvedValue({ valid: true }),
    createDelegation: jest.fn().mockResolvedValue(undefined),
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:listDelegations',
    mocks.listDelegations,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:createDelegation',
    mocks.createDelegation,
  );
  rootMessenger.registerActionHandler(
    'DelegationController:signDelegation',
    mocks.signDelegation,
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
      'AuthenticatedUserStorageService:createDelegation',
      'DelegationController:signDelegation',
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
    boringVaultAddress: MOCK_BORING_VAULT,
    delegateAddress: MOCK_DELEGATE,
    delegatorImplAddress: '0x2222222222222222222222222222222222222222' as Hex,
    erc20TransferAmountEnforcer: MOCK_ERC20_ENFORCER,
    musdTokenAddress: MOCK_MUSD,
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
    mockCreateRedeemerTerms.mockReturnValue(MOCK_REDEEMER_TERMS as never);
    // Return a different ERC20 terms blob per token so tests can tell which
    // delegation was signed when.
    mockCreateErc20Terms.mockImplementation((({
      tokenAddress,
    }: {
      tokenAddress: Hex;
    }) =>
      tokenAddress === MOCK_MUSD
        ? MOCK_MUSD_ERC20_TERMS
        : MOCK_VMUSD_ERC20_TERMS) as never);
    // Distinguish the two delegations by call order — the run loop signs
    // mUSD first, then vmUSD, so the first hashDelegation call corresponds to
    // mUSD.
    mockHashDelegation
      .mockReturnValueOnce(MOCK_MUSD_DELEGATION_HASH as never)
      .mockReturnValueOnce(MOCK_VMUSD_DELEGATION_HASH as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is named "build-delegation"', () => {
    expect(buildDelegationStep.name).toBe('build-delegation');
  });

  describe('when neither delegation exists in storage', () => {
    it('signs and submits both delegations, deposit (mUSD) before withdrawal (vmUSD)', async () => {
      const { messenger, mocks } = setup();

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.signDelegation).toHaveBeenCalledTimes(2);
      expect(mocks.verifyDelegation).toHaveBeenCalledTimes(2);

      const signedTokens = mocks.signDelegation.mock.calls.map(
        ([{ delegation }]) => delegation.caveats[1].terms,
      );
      expect(signedTokens).toStrictEqual([
        MOCK_MUSD_ERC20_TERMS,
        MOCK_VMUSD_ERC20_TERMS,
      ]);
    });

    it('encodes each caveat against the right enforcer addresses for each token', async () => {
      const { messenger } = setup();

      await run(messenger);

      // valueLte and redeemer share configuration across both delegations.
      expect(mockCreateValueLteTerms).toHaveBeenCalledWith({ maxValue: 0n });
      expect(mockCreateRedeemerTerms).toHaveBeenCalledWith({
        redeemers: [MOCK_VAULT_ADAPTER],
      });
      // erc20TransferAmount is per-token.
      expect(mockCreateErc20Terms).toHaveBeenCalledWith({
        tokenAddress: MOCK_MUSD,
        maxAmount: 2n ** 256n - 1n,
      });
      expect(mockCreateErc20Terms).toHaveBeenCalledWith({
        tokenAddress: MOCK_BORING_VAULT,
        maxAmount: 2n ** 256n - 1n,
      });
    });

    it('hands each unsigned delegation to DelegationController:signDelegation, scoped to the chain, with a fresh 32-byte salt', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      const [first, second] = mocks.signDelegation.mock.calls.map(
        ([params]) => params,
      );

      for (const { chainId, delegation } of [first, second]) {
        expect(chainId).toBe(MOCK_CHAIN_ID);
        expect(delegation.delegate).toBe(MOCK_DELEGATE);
        expect(delegation.delegator).toBe(MOCK_ADDRESS);
        expect(delegation.authority).toBe(ROOT_AUTHORITY);
        expect(delegation.salt).toMatch(/^0x[0-9a-f]{64}$/u);
        expect(delegation).not.toHaveProperty('signature');
      }

      expect(first.delegation.caveats).toStrictEqual(
        expectedCaveats(MOCK_MUSD_ERC20_TERMS),
      );
      expect(second.delegation.caveats).toStrictEqual(
        expectedCaveats(MOCK_VMUSD_ERC20_TERMS),
      );
      // Salts are independent per delegation.
      expect(first.delegation.salt).not.toBe(second.delegation.salt);
    });

    it('submits each signed delegation to ChompApiService:verifyDelegation', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      const [first, second] = mocks.verifyDelegation.mock.calls.map(
        ([params]) => params,
      );

      for (const { chainId, signedDelegation } of [first, second]) {
        expect(chainId).toBe(MOCK_CHAIN_ID);
        expect(signedDelegation.delegate).toBe(MOCK_DELEGATE);
        expect(signedDelegation.delegator).toBe(MOCK_ADDRESS);
        expect(signedDelegation.authority).toBe(ROOT_AUTHORITY);
        expect(signedDelegation.signature).toBe(MOCK_SIGNATURE);
        expect(signedDelegation.salt).toMatch(/^0x[0-9a-f]{64}$/u);
      }

      expect(first.signedDelegation.caveats).toStrictEqual(
        expectedCaveats(MOCK_MUSD_ERC20_TERMS),
      );
      expect(second.signedDelegation.caveats).toStrictEqual(
        expectedCaveats(MOCK_VMUSD_ERC20_TERMS),
      );
    });

    it('persists each delegation via AuthenticatedUserStorageService:createDelegation, with deposit/withdrawal metadata', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.createDelegation).toHaveBeenCalledTimes(2);
      const [first, second] = mocks.createDelegation.mock.calls.map(
        ([submission]) => submission,
      );

      // Each submission carries the same signed-delegation as the
      // corresponding verifyDelegation call.
      expect(first.signedDelegation.caveats).toStrictEqual(
        expectedCaveats(MOCK_MUSD_ERC20_TERMS),
      );
      expect(first.signedDelegation.signature).toBe(MOCK_SIGNATURE);
      expect(second.signedDelegation.caveats).toStrictEqual(
        expectedCaveats(MOCK_VMUSD_ERC20_TERMS),
      );
      expect(second.signedDelegation.signature).toBe(MOCK_SIGNATURE);

      expect(first.metadata).toStrictEqual({
        delegationHash: MOCK_MUSD_DELEGATION_HASH,
        chainIdHex: MOCK_CHAIN_ID,
        allowance: MAX_UINT256_HEX,
        tokenSymbol: 'mUSD',
        tokenAddress: MOCK_MUSD,
        type: 'cash-deposit',
      });
      expect(second.metadata).toStrictEqual({
        delegationHash: MOCK_VMUSD_DELEGATION_HASH,
        chainIdHex: MOCK_CHAIN_ID,
        allowance: MAX_UINT256_HEX,
        tokenSymbol: 'vmUSD',
        tokenAddress: MOCK_BORING_VAULT,
        type: 'cash-withdrawal',
      });
    });

    it('hashes each signed delegation (with bigint salt) before persisting it', async () => {
      const { messenger } = setup();

      await run(messenger);

      expect(mockHashDelegation).toHaveBeenCalledTimes(2);
      // Each hashDelegation call should receive a delegation whose salt is a
      // bigint (delegation-core's expectation), not a hex string.
      for (const [delegationStruct] of mockHashDelegation.mock.calls) {
        expect(typeof delegationStruct.salt).toBe('bigint');
        expect(delegationStruct.signature).toBe(MOCK_SIGNATURE);
      }
    });
  });

  describe('when only one delegation already exists', () => {
    it('signs, submits, and persists only the missing withdrawal delegation when the deposit one already exists', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({ tokenAddress: MOCK_MUSD }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
      const { delegation } = mocks.signDelegation.mock.calls[0][0];
      expect(delegation.caveats[1].terms).toBe(MOCK_VMUSD_ERC20_TERMS);

      expect(mocks.createDelegation).toHaveBeenCalledTimes(1);
      const [submission] = mocks.createDelegation.mock.calls[0];
      expect(submission.metadata.tokenAddress).toBe(MOCK_BORING_VAULT);
      expect(submission.metadata.type).toBe('cash-withdrawal');
    });

    it('signs, submits, and persists only the missing deposit delegation when the withdrawal one already exists', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({ tokenAddress: MOCK_BORING_VAULT }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
      const { delegation } = mocks.signDelegation.mock.calls[0][0];
      expect(delegation.caveats[1].terms).toBe(MOCK_MUSD_ERC20_TERMS);

      expect(mocks.createDelegation).toHaveBeenCalledTimes(1);
      const [submission] = mocks.createDelegation.mock.calls[0];
      expect(submission.metadata.tokenAddress).toBe(MOCK_MUSD);
      expect(submission.metadata.type).toBe('cash-deposit');
    });
  });

  describe('when both delegations already exist', () => {
    it('returns "already-done" without signing, submitting, or persisting', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({ tokenAddress: MOCK_MUSD }),
        makeDelegationResponse({ tokenAddress: MOCK_BORING_VAULT }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mocks.signDelegation).not.toHaveBeenCalled();
      expect(mocks.verifyDelegation).not.toHaveBeenCalled();
      expect(mocks.createDelegation).not.toHaveBeenCalled();
    });

    it('matches addresses, chainId, and tokenAddress case-insensitively', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({
          delegator: MOCK_ADDRESS.toUpperCase() as Hex,
          delegate: MOCK_DELEGATE.toUpperCase() as Hex,
          chainIdHex: MOCK_CHAIN_ID.toUpperCase() as Hex,
          tokenAddress: MOCK_MUSD.toUpperCase() as Hex,
        }),
        makeDelegationResponse({
          tokenAddress: MOCK_BORING_VAULT.toUpperCase() as Hex,
        }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
    });

    it('ignores entries that differ on any identifying field', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        // Same token but wrong delegator/delegate/chain.
        makeDelegationResponse({
          tokenAddress: MOCK_MUSD,
          delegator: OTHER_ADDRESS,
        }),
        makeDelegationResponse({
          tokenAddress: MOCK_MUSD,
          delegate: OTHER_ADDRESS,
        }),
        makeDelegationResponse({
          tokenAddress: MOCK_MUSD,
          chainIdHex: OTHER_CHAIN_ID,
        }),
        // Unrelated token.
        makeDelegationResponse({ tokenAddress: OTHER_TOKEN }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.signDelegation).toHaveBeenCalledTimes(2);
    });

    it('ignores entries that do not carry a redeemer caveat targeting the Veda vault adapter', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        // No caveats at all.
        makeDelegationResponse({ tokenAddress: MOCK_MUSD, caveats: [] }),
        // Right enforcer, wrong terms (different redeemer encoded).
        makeDelegationResponse({
          tokenAddress: MOCK_BORING_VAULT,
          caveats: [
            {
              enforcer: MOCK_REDEEMER_ENFORCER,
              terms: '0xdeadbeef',
              args: '0x',
            },
          ],
        }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.signDelegation).toHaveBeenCalledTimes(2);
    });
  });

  describe('when CHOMP rejects a delegation', () => {
    it('throws with the joined error list', async () => {
      const { messenger, mocks } = setup();
      mocks.verifyDelegation.mockResolvedValue({
        valid: false,
        errors: ['caveat mismatch', 'unknown enforcer'],
      });

      await expect(run(messenger)).rejects.toThrow(
        'CHOMP rejected delegation: caveat mismatch, unknown enforcer',
      );
    });

    it('throws with a default message when CHOMP returns no errors', async () => {
      const { messenger, mocks } = setup();
      mocks.verifyDelegation.mockResolvedValue({ valid: false });

      await expect(run(messenger)).rejects.toThrow(
        'CHOMP rejected delegation: unknown error',
      );
    });

    it('does not attempt the second delegation, and does not persist, if the first one is rejected', async () => {
      const { messenger, mocks } = setup();
      mocks.verifyDelegation.mockResolvedValueOnce({
        valid: false,
        errors: ['nope'],
      });

      await expect(run(messenger)).rejects.toThrow(
        'CHOMP rejected delegation: nope',
      );
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.createDelegation).not.toHaveBeenCalled();
    });
  });

  describe('error propagation', () => {
    it('propagates errors from listDelegations and does not sign or submit anything', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockRejectedValue(new Error('storage failed'));

      await expect(run(messenger)).rejects.toThrow('storage failed');
      expect(mocks.signDelegation).not.toHaveBeenCalled();
      expect(mocks.verifyDelegation).not.toHaveBeenCalled();
    });

    it('propagates errors from signing and stops the sequence', async () => {
      const { messenger, mocks } = setup();
      mocks.signDelegation.mockRejectedValue(new Error('signing failed'));

      await expect(run(messenger)).rejects.toThrow('signing failed');
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.verifyDelegation).not.toHaveBeenCalled();
    });

    it('propagates errors from verifyDelegation and stops the sequence', async () => {
      const { messenger, mocks } = setup();
      mocks.verifyDelegation.mockRejectedValue(new Error('chomp failed'));

      await expect(run(messenger)).rejects.toThrow('chomp failed');
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.verifyDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.createDelegation).not.toHaveBeenCalled();
    });

    it('propagates errors from createDelegation and stops the sequence', async () => {
      const { messenger, mocks } = setup();
      mocks.createDelegation.mockRejectedValue(new Error('storage failed'));

      await expect(run(messenger)).rejects.toThrow('storage failed');
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.verifyDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.createDelegation).toHaveBeenCalledTimes(1);
    });
  });
});
