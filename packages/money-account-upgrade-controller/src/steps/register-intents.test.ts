import type {
  DelegationResponse,
  DelegationMetadata,
} from '@metamask/authenticated-user-storage';
import type { IntentEntry } from '@metamask/chomp-api-service';
import { createRedeemerTerms } from '@metamask/delegation-core';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController.js';
import { registerIntentsStep } from './register-intents.js';

jest.mock('@metamask/delegation-core', () => ({
  createRedeemerTerms: jest.fn(),
}));

const mockCreateRedeemerTerms = jest.mocked(createRedeemerTerms);

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

const MOCK_MUSD_DELEGATION_HASH: Hex = `0x${'ee'.repeat(32)}`;
const MOCK_VMUSD_DELEGATION_HASH: Hex = `0x${'ff'.repeat(32)}`;
const MAX_UINT256_HEX: Hex = `0x${'f'.repeat(64)}`;
const MOCK_REDEEMER_TERMS: Hex = '0xa3';

/**
 * Builds a `DelegationResponse` for use as a mocked `listDelegations` entry.
 * Defaults match the deposit-side delegation written by the build-delegation
 * step, including a redeemer caveat that points at the Veda vault adapter.
 * Tests override identifying fields and metadata to probe the matcher.
 *
 * @param overrides - Identifying fields and metadata to override.
 * @param overrides.delegator - The delegator address.
 * @param overrides.delegate - The delegate address.
 * @param overrides.chainIdHex - The chain ID in hex.
 * @param overrides.tokenAddress - The token address.
 * @param overrides.tokenSymbol - The token symbol.
 * @param overrides.delegationHash - The delegation hash recorded in metadata.
 * @param overrides.type - The metadata `type` field.
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
    tokenSymbol?: string;
    delegationHash?: Hex;
    type?: DelegationMetadata['type'];
    caveats?: { enforcer: Hex; terms: Hex; args: Hex }[];
  } = {},
): DelegationResponse {
  return {
    signedDelegation: {
      delegate: overrides.delegate ?? MOCK_DELEGATE,
      delegator: overrides.delegator ?? MOCK_ADDRESS,
      authority: `0x${'ff'.repeat(32)}`,
      caveats: overrides.caveats ?? [
        {
          enforcer: MOCK_REDEEMER_ENFORCER,
          terms: MOCK_REDEEMER_TERMS,
          args: '0x',
        },
      ],
      salt: `0x${'42'.repeat(32)}`,
      signature: `0x${'cd'.repeat(65)}`,
    },
    metadata: {
      delegationHash: overrides.delegationHash ?? MOCK_MUSD_DELEGATION_HASH,
      chainIdHex: overrides.chainIdHex ?? MOCK_CHAIN_ID,
      allowance: MAX_UINT256_HEX,
      tokenSymbol: overrides.tokenSymbol ?? 'mUSD',
      tokenAddress: overrides.tokenAddress ?? MOCK_MUSD,
      type: overrides.type ?? 'cash-deposit',
    },
  };
}

const depositDelegation = (): DelegationResponse =>
  makeDelegationResponse({
    tokenAddress: MOCK_MUSD,
    tokenSymbol: 'mUSD',
    delegationHash: MOCK_MUSD_DELEGATION_HASH,
    type: 'cash-deposit',
  });

const withdrawalDelegation = (): DelegationResponse =>
  makeDelegationResponse({
    tokenAddress: MOCK_BORING_VAULT,
    tokenSymbol: 'vmUSD',
    delegationHash: MOCK_VMUSD_DELEGATION_HASH,
    type: 'cash-withdrawal',
  });

/**
 * Builds an `IntentEntry` for use as a mocked `getIntentsByAddress` entry.
 * Defaults to an active deposit-side intent matching the deposit delegation.
 *
 * @param overrides - Fields to override.
 * @param overrides.delegationHash - The delegationHash this intent points at.
 * @param overrides.status - The intent status (active or revoked).
 * @returns A complete `IntentEntry`.
 */
function makeIntentEntry(
  overrides: { delegationHash?: Hex; status?: IntentEntry['status'] } = {},
): IntentEntry {
  return {
    account: MOCK_ADDRESS,
    delegationHash: overrides.delegationHash ?? MOCK_MUSD_DELEGATION_HASH,
    chainId: MOCK_CHAIN_ID,
    status: overrides.status ?? 'active',
    metadata: {
      allowance: MAX_UINT256_HEX,
      tokenAddress: MOCK_MUSD,
      tokenSymbol: 'mUSD',
      type: 'cash-deposit',
    },
  };
}

type AllActions = MessengerActions<MoneyAccountUpgradeControllerMessenger>;
type AllEvents = MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type Mocks = {
  listDelegations: jest.Mock;
  getIntentsByAddress: jest.Mock;
  createIntents: jest.Mock;
};

function setup(): {
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  const mocks: Mocks = {
    listDelegations: jest
      .fn()
      .mockResolvedValue([depositDelegation(), withdrawalDelegation()]),
    getIntentsByAddress: jest.fn().mockResolvedValue([]),
    createIntents: jest.fn().mockResolvedValue([]),
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:listDelegations',
    mocks.listDelegations,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:getIntentsByAddress',
    mocks.getIntentsByAddress,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:createIntents',
    mocks.createIntents,
  );

  const messenger: MoneyAccountUpgradeControllerMessenger = new Messenger({
    namespace: 'MoneyAccountUpgradeController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'AuthenticatedUserStorageService:listDelegations',
      'ChompApiService:getIntentsByAddress',
      'ChompApiService:createIntents',
    ],
    events: [],
    messenger,
  });

  return { messenger, mocks };
}

async function run(
  messenger: MoneyAccountUpgradeControllerMessenger,
): ReturnType<typeof registerIntentsStep.run> {
  return registerIntentsStep.run({
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

describe('registerIntentsStep', () => {
  beforeEach(() => {
    // The terms factory is overloaded over output encoding; the runtime path
    // picks the hex overload, but `jest.mocked()` picks the bytes overload, so
    // cast through `never` to satisfy both.
    mockCreateRedeemerTerms.mockReturnValue(MOCK_REDEEMER_TERMS as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is named "register-intents"', () => {
    expect(registerIntentsStep.name).toBe('register-intents');
  });

  describe('when no intents exist for the account', () => {
    it('submits an intent for each stored delegation and returns "completed"', async () => {
      const { messenger, mocks } = setup();

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.createIntents).toHaveBeenCalledTimes(1);

      const [submitted] = mocks.createIntents.mock.calls[0];
      expect(submitted).toStrictEqual([
        {
          account: MOCK_ADDRESS,
          delegationHash: MOCK_MUSD_DELEGATION_HASH,
          chainId: MOCK_CHAIN_ID,
          metadata: {
            allowance: MAX_UINT256_HEX,
            tokenSymbol: 'mUSD',
            tokenAddress: MOCK_MUSD,
            type: 'cash-deposit',
          },
        },
        {
          account: MOCK_ADDRESS,
          delegationHash: MOCK_VMUSD_DELEGATION_HASH,
          chainId: MOCK_CHAIN_ID,
          metadata: {
            allowance: MAX_UINT256_HEX,
            tokenSymbol: 'vmUSD',
            tokenAddress: MOCK_BORING_VAULT,
            type: 'cash-withdrawal',
          },
        },
      ]);
    });
  });

  describe('when an active intent already exists for one delegation', () => {
    it('submits only the missing intent', async () => {
      const { messenger, mocks } = setup();
      mocks.getIntentsByAddress.mockResolvedValue([
        makeIntentEntry({ delegationHash: MOCK_MUSD_DELEGATION_HASH }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.createIntents).toHaveBeenCalledTimes(1);
      const [submitted] = mocks.createIntents.mock.calls[0];
      expect(submitted).toHaveLength(1);
      expect(submitted[0].delegationHash).toBe(MOCK_VMUSD_DELEGATION_HASH);
      expect(submitted[0].metadata.type).toBe('cash-withdrawal');
    });

    it('matches delegationHash case-insensitively', async () => {
      const { messenger, mocks } = setup();
      mocks.getIntentsByAddress.mockResolvedValue([
        makeIntentEntry({
          delegationHash: MOCK_MUSD_DELEGATION_HASH.toUpperCase() as Hex,
        }),
        makeIntentEntry({
          delegationHash: MOCK_VMUSD_DELEGATION_HASH.toUpperCase() as Hex,
        }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });
  });

  describe('when active intents already exist for both delegations', () => {
    it('returns "already-done" without calling createIntents', async () => {
      const { messenger, mocks } = setup();
      mocks.getIntentsByAddress.mockResolvedValue([
        makeIntentEntry({ delegationHash: MOCK_MUSD_DELEGATION_HASH }),
        makeIntentEntry({ delegationHash: MOCK_VMUSD_DELEGATION_HASH }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });
  });

  describe('when an intent exists but is revoked', () => {
    it('re-registers the revoked intent', async () => {
      const { messenger, mocks } = setup();
      mocks.getIntentsByAddress.mockResolvedValue([
        makeIntentEntry({
          delegationHash: MOCK_MUSD_DELEGATION_HASH,
          status: 'revoked',
        }),
        makeIntentEntry({
          delegationHash: MOCK_VMUSD_DELEGATION_HASH,
          status: 'active',
        }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.createIntents).toHaveBeenCalledTimes(1);
      const [submitted] = mocks.createIntents.mock.calls[0];
      expect(submitted).toHaveLength(1);
      expect(submitted[0].delegationHash).toBe(MOCK_MUSD_DELEGATION_HASH);
    });
  });

  describe('filtering stored delegations', () => {
    it('ignores delegations from a different delegator', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({
          delegator: OTHER_ADDRESS,
          delegationHash: `0x${'01'.repeat(32)}`,
        }),
        depositDelegation(),
        withdrawalDelegation(),
      ]);

      await run(messenger);

      const [submitted] = mocks.createIntents.mock.calls[0];
      expect(submitted).toHaveLength(2);
      expect(
        submitted.map(
          (intent: { delegationHash: Hex }) => intent.delegationHash,
        ),
      ).toStrictEqual([MOCK_MUSD_DELEGATION_HASH, MOCK_VMUSD_DELEGATION_HASH]);
    });

    it('ignores delegations to a different delegate', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({
          delegate: OTHER_ADDRESS,
          delegationHash: `0x${'02'.repeat(32)}`,
        }),
        depositDelegation(),
        withdrawalDelegation(),
      ]);

      await run(messenger);

      const [submitted] = mocks.createIntents.mock.calls[0];
      expect(submitted).toHaveLength(2);
    });

    it('ignores delegations on a different chain', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({
          chainIdHex: OTHER_CHAIN_ID,
          delegationHash: `0x${'03'.repeat(32)}`,
        }),
        depositDelegation(),
        withdrawalDelegation(),
      ]);

      await run(messenger);

      const [submitted] = mocks.createIntents.mock.calls[0];
      expect(submitted).toHaveLength(2);
    });

    it('matches identifying fields case-insensitively', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({
          delegator: MOCK_ADDRESS.toUpperCase() as Hex,
          delegate: MOCK_DELEGATE.toUpperCase() as Hex,
          chainIdHex: MOCK_CHAIN_ID.toUpperCase() as Hex,
          tokenAddress: MOCK_MUSD,
          tokenSymbol: 'mUSD',
          delegationHash: MOCK_MUSD_DELEGATION_HASH,
          type: 'cash-deposit',
        }),
        withdrawalDelegation(),
      ]);

      const result = await run(messenger);

      expect(result).toBe('completed');
      const [submitted] = mocks.createIntents.mock.calls[0];
      expect(submitted).toHaveLength(2);
    });

    it('returns "already-done" when no delegations match the filter', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({
          delegator: OTHER_ADDRESS,
          tokenAddress: OTHER_TOKEN,
        }),
      ]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });

    it('ignores delegations for a token address that is no longer configured', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        // Stale withdrawal delegation left over from a previous config (e.g. a
        // dev boring vault address) that still carries the current redeemer
        // caveat. It must not be registered against the current configuration.
        makeDelegationResponse({
          tokenAddress: OTHER_TOKEN,
          tokenSymbol: 'vmUSD',
          delegationHash: `0x${'04'.repeat(32)}`,
          type: 'cash-withdrawal',
        }),
        depositDelegation(),
        withdrawalDelegation(),
      ]);

      const result = await run(messenger);

      expect(result).toBe('completed');
      const [submitted] = mocks.createIntents.mock.calls[0];
      expect(submitted).toHaveLength(2);
      expect(
        submitted.map(
          (intent: { delegationHash: Hex }) => intent.delegationHash,
        ),
      ).toStrictEqual([MOCK_MUSD_DELEGATION_HASH, MOCK_VMUSD_DELEGATION_HASH]);
    });

    it('ignores delegations whose caveats do not include a redeemer caveat targeting the Veda vault adapter', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        // No caveats at all.
        makeDelegationResponse({
          tokenAddress: MOCK_MUSD,
          delegationHash: MOCK_MUSD_DELEGATION_HASH,
          caveats: [],
        }),
        // Right enforcer, wrong terms (different redeemer encoded).
        makeDelegationResponse({
          tokenAddress: MOCK_BORING_VAULT,
          tokenSymbol: 'vmUSD',
          delegationHash: MOCK_VMUSD_DELEGATION_HASH,
          type: 'cash-withdrawal',
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

      expect(result).toBe('already-done');
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });
  });

  describe('when a stored delegation has an unrecognized metadata type', () => {
    it('throws rather than coercing into a CHOMP intent', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        makeDelegationResponse({
          tokenAddress: MOCK_MUSD,
          delegationHash: MOCK_MUSD_DELEGATION_HASH,
          type: 'lend',
        }),
      ]);

      await expect(run(messenger)).rejects.toThrow(
        'Expected delegation type to be "cash-deposit" or "cash-withdrawal", got "lend"',
      );
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });
  });

  describe('error propagation', () => {
    it('propagates errors from listDelegations and does not call createIntents', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockRejectedValue(new Error('storage failed'));

      await expect(run(messenger)).rejects.toThrow('storage failed');
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });

    it('propagates errors from getIntentsByAddress and does not call createIntents', async () => {
      const { messenger, mocks } = setup();
      mocks.getIntentsByAddress.mockRejectedValue(new Error('chomp failed'));

      await expect(run(messenger)).rejects.toThrow('chomp failed');
      expect(mocks.createIntents).not.toHaveBeenCalled();
    });

    it('propagates errors from createIntents', async () => {
      const { messenger, mocks } = setup();
      mocks.createIntents.mockRejectedValue(new Error('submit failed'));

      await expect(run(messenger)).rejects.toThrow('submit failed');
    });
  });
});
