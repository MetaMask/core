import { encode } from '@metamask/abi-utils';
import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import type {
  AddressIdentityResponse,
  ChompApiServiceCreateIntentsV2Action,
  MigrationStep,
} from '@metamask/chomp-api-service';
import {
  ROOT_AUTHORITY,
  createAllowedCalldataTerms,
  createAllowedTargetsTerms,
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
import { bytesToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3';
import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController.js';
import { registerMigrationIntentsStep } from './register-migration-intents.js';
import type { StepContext } from './step.js';

const PREDECESSOR = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const SUCCESSOR = '0x5555555555555555555555555555555555555555' as Hex;
const OTHER_SUCCESSOR = '0x6666666666666666666666666666666666666666' as Hex;
const CHAIN_ID = '0x1' as Hex;
const DELEGATE = '0x1111111111111111111111111111111111111111' as Hex;
const MUSD = '0x3333333333333333333333333333333333333333' as Hex;
const VMUSD = '0x7777777777777777777777777777777777777777' as Hex;
const PVMUSD = '0x8888888888888888888888888888888888888888' as Hex;
const VAULT_ADAPTER = '0x4444444444444444444444444444444444444444' as Hex;
const PREMIUM_VAULT_ADAPTER =
  '0x4545454545454545454545454545454545454545' as Hex;
const HELPER = '0x9999999999999999999999999999999999999999' as Hex;
const ALLOWED_CALLDATA_ENFORCER =
  '0xdddddddddddddddddddddddddddddddddddddddd' as Hex;
const ALLOWED_TARGETS_ENFORCER =
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Hex;
const REDEEMER_ENFORCER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
const VALUE_LTE_ENFORCER = '0xcccccccccccccccccccccccccccccccccccccccc' as Hex;
const ANY_BENEFICIARY = '0x0000000000000000000000000000000000000a11' as Hex;
const MAX_UINT256_HEX: Hex = `0x${'f'.repeat(64)}`;
const SIGNATURE: Hex = `0x${'cd'.repeat(65)}`;
const USER_SIGNATURE: Hex = `0x${'ab'.repeat(65)}`;

const STANDARD_STEPS: MigrationStep[] = [
  'SUCCESSOR_DEPOSIT_INTENT',
  'SUCCESSOR_WITHDRAWAL_INTENT',
  'SUCCESSOR_MONITORED',
  'ROOT_DELEGATION',
  'TRANSFER_INTENT_MUSD',
  'TRANSFER_INTENT_VMUSD',
  'FUNDS_TRANSFERRED',
];

const PREMIUM_STEPS: MigrationStep[] = [
  ...STANDARD_STEPS.slice(0, 2),
  'SUCCESSOR_SUBSCRIPTION_INTENT',
  ...STANDARD_STEPS.slice(2, 6),
  'TRANSFER_INTENT_PVMUSD',
  'FUNDS_TRANSFERRED',
];

/**
 * Builds the CHOMP identity response for `PREDECESSOR` while it migrates.
 *
 * @param options - The options.
 * @param options.steps - The required steps of the migration.
 * @param options.completed - The steps that are already complete.
 * @param options.from - The predecessor of the migration.
 * @param options.to - The successor of the migration.
 * @returns The identity response.
 */
function migratingIdentity({
  steps = STANDARD_STEPS,
  completed = [],
  from = PREDECESSOR,
  to = SUCCESSOR,
}: {
  steps?: MigrationStep[];
  completed?: MigrationStep[];
  from?: Hex;
  to?: Hex;
} = {}): AddressIdentityResponse {
  return {
    identity: {
      currentAddress: from,
      previousAddresses: [],
      status: 'MIGRATING',
      migration: {
        from,
        to,
        steps: steps.map((step) => ({
          step,
          completed: completed.includes(step),
        })),
        transfer: null,
        premiumTransfer: null,
      },
    },
    address: {
      address: PREDECESSOR,
      role: 'CURRENT',
      predecessor: null,
      successor: to,
    },
  };
}

const transferCalldata = (recipient: Hex): Hex =>
  createAllowedCalldataTerms({
    startIndex: 0,
    value: `0xa9059cbb${'0'.repeat(24)}${recipient.slice(2)}`,
  });

const transferCaveats = (
  token: Hex,
  recipient: Hex = SUCCESSOR,
): DelegationResponse['signedDelegation']['caveats'] => [
  {
    enforcer: ALLOWED_TARGETS_ENFORCER,
    terms: createAllowedTargetsTerms({ targets: [token] }),
    args: '0x',
  },
  {
    enforcer: ALLOWED_CALLDATA_ENFORCER,
    terms: transferCalldata(recipient),
    args: '0x',
  },
  {
    enforcer: VALUE_LTE_ENFORCER,
    terms: createValueLteTerms({ maxValue: 0n }),
    args: '0x',
  },
];

const rootCaveats = (
  successor: Hex = SUCCESSOR,
): DelegationResponse['signedDelegation']['caveats'] => [
  {
    enforcer: REDEEMER_ENFORCER,
    terms: createRedeemerTerms({ redeemers: [successor] }),
    args: '0x',
  },
];

const premiumTransferCaveats =
  (): DelegationResponse['signedDelegation']['caveats'] => [
    {
      enforcer: REDEEMER_ENFORCER,
      terms: createRedeemerTerms({ redeemers: [HELPER] }),
      args: '0x',
    },
    {
      enforcer: ALLOWED_CALLDATA_ENFORCER,
      terms: transferCalldata(HELPER),
      args: '0x',
    },
    {
      enforcer: ALLOWED_TARGETS_ENFORCER,
      terms: createAllowedTargetsTerms({ targets: [PVMUSD] }),
      args: '0x',
    },
  ];

/**
 * Builds a stored migration delegation from `PREDECESSOR`.
 *
 * @param overrides - The fields to override.
 * @param overrides.delegate - The delegate.
 * @param overrides.caveats - The caveats.
 * @param overrides.tokenAddress - The metadata token address.
 * @param overrides.tokenSymbol - The metadata token symbol.
 * @param overrides.type - The metadata type.
 * @param overrides.delegationHash - The metadata delegation hash.
 * @param overrides.chainIdHex - The metadata chain.
 * @param overrides.delegator - The delegator.
 * @returns The stored delegation.
 */
function storedDelegation(overrides: {
  delegate: Hex;
  caveats: DelegationResponse['signedDelegation']['caveats'];
  tokenAddress: Hex;
  tokenSymbol: string;
  type: string;
  delegationHash: Hex;
  chainIdHex?: Hex;
  delegator?: Hex;
}): DelegationResponse {
  return {
    signedDelegation: {
      delegate: overrides.delegate,
      delegator: overrides.delegator ?? PREDECESSOR,
      authority: ROOT_AUTHORITY,
      caveats: overrides.caveats,
      salt: `0x${'42'.repeat(32)}`,
      signature: SIGNATURE,
    },
    metadata: {
      delegationHash: overrides.delegationHash,
      chainIdHex: overrides.chainIdHex ?? CHAIN_ID,
      allowance: MAX_UINT256_HEX,
      tokenSymbol: overrides.tokenSymbol,
      tokenAddress: overrides.tokenAddress,
      type: overrides.type,
    },
  };
}

const STORED_ROOT_HASH: Hex = `0x${'01'.repeat(32)}`;
const STORED_MUSD_HASH: Hex = `0x${'02'.repeat(32)}`;
const STORED_PREMIUM_HASH: Hex = `0x${'03'.repeat(32)}`;

const storedRootDelegation = (delegate: Hex = SUCCESSOR): DelegationResponse =>
  storedDelegation({
    delegate,
    caveats: rootCaveats(delegate.toLowerCase() as Hex),
    tokenAddress: MUSD,
    tokenSymbol: 'mUSD',
    type: 'cash-migration-root',
    delegationHash: STORED_ROOT_HASH,
  });

const storedMusdTransferDelegation = (
  recipient: Hex = SUCCESSOR,
): DelegationResponse =>
  storedDelegation({
    delegate: ANY_BENEFICIARY,
    caveats: transferCaveats(MUSD, recipient),
    tokenAddress: MUSD,
    tokenSymbol: 'mUSD',
    type: 'cash-migration-transfer',
    delegationHash: STORED_MUSD_HASH,
  });

type AllActions = MessengerActions<MoneyAccountUpgradeControllerMessenger>;
type AllEvents = MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type Mocks = {
  getDerivedIdentityByAddress: Mock;
  listDelegations: Mock;
  signDelegation: Mock;
  createDelegation: Mock;
  signPersonalMessage: Mock;
  createIntentsV2: Mock<ChompApiServiceCreateIntentsV2Action['handler']>;
  getServiceDetails: Mock;
};

const serviceDetails = (chain: Record<string, unknown> = {}): unknown => ({
  auth: { message: 'message' },
  chains: {
    [CHAIN_ID]: {
      autoDepositDelegate: DELEGATE,
      vaultMigrationHelperAddress: HELPER,
      ...chain,
    },
  },
});

function setup(
  identity: AddressIdentityResponse | null = migratingIdentity(),
): {
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  const mocks: Mocks = {
    getDerivedIdentityByAddress: vi.fn().mockResolvedValue(identity),
    listDelegations: vi.fn().mockResolvedValue([]),
    signDelegation: vi.fn().mockResolvedValue(SIGNATURE),
    createDelegation: vi.fn().mockResolvedValue(undefined),
    signPersonalMessage: vi.fn().mockResolvedValue(USER_SIGNATURE),
    createIntentsV2: vi
      .fn<ChompApiServiceCreateIntentsV2Action['handler']>()
      .mockResolvedValue([]),
    getServiceDetails: vi.fn().mockResolvedValue(serviceDetails()),
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'ChompApiService:getDerivedIdentityByAddress',
    mocks.getDerivedIdentityByAddress,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:listDelegations',
    mocks.listDelegations,
  );
  rootMessenger.registerActionHandler(
    'DelegationController:signDelegation',
    mocks.signDelegation,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:createDelegation',
    mocks.createDelegation,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:signPersonalMessage',
    mocks.signPersonalMessage,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:createIntentsV2',
    mocks.createIntentsV2,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:getServiceDetails',
    mocks.getServiceDetails,
  );

  const messenger: MoneyAccountUpgradeControllerMessenger = new Messenger({
    namespace: 'MoneyAccountUpgradeController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'ChompApiService:getDerivedIdentityByAddress',
      'AuthenticatedUserStorageService:listDelegations',
      'DelegationController:signDelegation',
      'AuthenticatedUserStorageService:createDelegation',
      'KeyringController:signPersonalMessage',
      'ChompApiService:createIntentsV2',
      'ChompApiService:getServiceDetails',
    ],
    events: [],
    messenger,
  });

  return { messenger, mocks };
}

async function run(
  messenger: MoneyAccountUpgradeControllerMessenger,
  overrides: Partial<StepContext> = {},
): ReturnType<typeof registerMigrationIntentsStep.run> {
  return registerMigrationIntentsStep.run({
    messenger,
    address: PREDECESSOR,
    chainId: CHAIN_ID,
    boringVaultAddress: VMUSD,
    delegateAddress: DELEGATE,
    delegatorImplAddress: '0x2222222222222222222222222222222222222222',
    allowedCalldataEnforcer: ALLOWED_CALLDATA_ENFORCER,
    allowedTargetsEnforcer: ALLOWED_TARGETS_ENFORCER,
    erc20TransferAmountEnforcer: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    musdTokenAddress: MUSD,
    redeemerEnforcer: REDEEMER_ENFORCER,
    valueLteEnforcer: VALUE_LTE_ENFORCER,
    vedaVaultAdapterAddress: VAULT_ADAPTER,
    ...overrides,
  });
}

const PREMIUM_CONTEXT: Partial<StepContext> = {
  premiumVault: {
    boringVaultAddress: PVMUSD,
    vedaVaultAdapterAddress: PREMIUM_VAULT_ADAPTER,
  },
};

type SignedDelegationArg = {
  delegation: {
    delegate: Hex;
    delegator: Hex;
    authority: Hex;
    caveats: DelegationResponse['signedDelegation']['caveats'];
    salt: Hex;
  };
  chainId: Hex;
};

const signedDelegations = (mocks: Mocks): SignedDelegationArg[] =>
  mocks.signDelegation.mock.calls.map(
    ([argument]) => argument as SignedDelegationArg,
  );

const hashOf = ({ delegation }: SignedDelegationArg): Hex =>
  hashDelegation({
    ...delegation,
    salt: BigInt(delegation.salt),
    signature: SIGNATURE,
  });

describe('registerMigrationIntentsStep', () => {
  it('reads the identity of the predecessor from CHOMP', async () => {
    const { messenger, mocks } = setup();

    await run(messenger);

    expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledWith(PREDECESSOR);
  });

  it('throws when the address is not in a Money Account identity', async () => {
    const { messenger, mocks } = setup(null);

    await expect(run(messenger)).rejects.toThrow(
      `${PREDECESSOR} is not the predecessor of a Money Account migration`,
    );
    expect(mocks.signDelegation).not.toHaveBeenCalled();
  });

  it('throws when the identity is not migrating', async () => {
    const identity = migratingIdentity();
    const { messenger, mocks } = setup({
      ...identity,
      identity: { ...identity.identity, status: 'DONE', migration: null },
    });

    await expect(run(messenger)).rejects.toThrow(
      `${PREDECESSOR} is not the predecessor of a Money Account migration`,
    );
    expect(mocks.signDelegation).not.toHaveBeenCalled();
  });

  it('throws when the address is not the predecessor of the migration', async () => {
    const { messenger, mocks } = setup(
      migratingIdentity({ from: OTHER_SUCCESSOR }),
    );

    await expect(run(messenger)).rejects.toThrow(
      `${PREDECESSOR} is not the predecessor of a Money Account migration`,
    );
    expect(mocks.signDelegation).not.toHaveBeenCalled();
  });

  it('matches the predecessor case-insensitively', async () => {
    const { messenger, mocks } = setup(
      migratingIdentity({ from: PREDECESSOR.toUpperCase() as Hex }),
    );

    expect(await run(messenger)).toBe('completed');
    expect(mocks.createIntentsV2).toHaveBeenCalled();
  });

  it('returns already-done when no predecessor step is missing', async () => {
    const { messenger, mocks } = setup(
      migratingIdentity({
        completed: [
          'ROOT_DELEGATION',
          'TRANSFER_INTENT_MUSD',
          'TRANSFER_INTENT_VMUSD',
        ],
      }),
    );

    expect(await run(messenger)).toBe('already-done');
    expect(mocks.listDelegations).not.toHaveBeenCalled();
    expect(mocks.signDelegation).not.toHaveBeenCalled();
    expect(mocks.createIntentsV2).not.toHaveBeenCalled();
  });

  describe('for a standard migration', () => {
    it('signs the root delegation from the predecessor to the successor, redeemable only by the successor', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(signedDelegations(mocks)[0]).toStrictEqual({
        delegation: {
          delegate: SUCCESSOR,
          delegator: PREDECESSOR,
          authority: ROOT_AUTHORITY,
          caveats: rootCaveats(),
          salt: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
        },
        chainId: CHAIN_ID,
      });
    });

    it('signs an open mUSD and vmUSD transfer to the successor', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      const [, musd, vmusd] = signedDelegations(mocks);
      expect(musd.delegation).toMatchObject({
        delegate: ANY_BENEFICIARY,
        delegator: PREDECESSOR,
        authority: ROOT_AUTHORITY,
        caveats: transferCaveats(MUSD),
      });
      expect(vmusd.delegation).toMatchObject({
        delegate: ANY_BENEFICIARY,
        delegator: PREDECESSOR,
        authority: ROOT_AUTHORITY,
        caveats: transferCaveats(VMUSD),
      });
    });

    it('uses a fresh salt for every delegation', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      const salts = signedDelegations(mocks).map(
        ({ delegation }) => delegation.salt,
      );
      expect(new Set(salts).size).toBe(3);
    });

    it('stores every signed delegation with its migration intent type', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      const [root, musd, vmusd] = signedDelegations(mocks);
      expect(mocks.createDelegation.mock.calls).toStrictEqual([
        [
          {
            signedDelegation: { ...root.delegation, signature: SIGNATURE },
            metadata: {
              delegationHash: hashOf(root),
              chainIdHex: CHAIN_ID,
              allowance: MAX_UINT256_HEX,
              tokenSymbol: 'mUSD',
              tokenAddress: MUSD,
              type: 'cash-migration-root',
            },
          },
        ],
        [
          {
            signedDelegation: { ...musd.delegation, signature: SIGNATURE },
            metadata: {
              delegationHash: hashOf(musd),
              chainIdHex: CHAIN_ID,
              allowance: MAX_UINT256_HEX,
              tokenSymbol: 'mUSD',
              tokenAddress: MUSD,
              type: 'cash-migration-transfer',
            },
          },
        ],
        [
          {
            signedDelegation: { ...vmusd.delegation, signature: SIGNATURE },
            metadata: {
              delegationHash: hashOf(vmusd),
              chainIdHex: CHAIN_ID,
              allowance: MAX_UINT256_HEX,
              tokenSymbol: 'vmUSD',
              tokenAddress: VMUSD,
              type: 'cash-migration-transfer',
            },
          },
        ],
      ]);
    });

    it('registers every intent for the predecessor in one request', async () => {
      const { messenger, mocks } = setup();

      expect(await run(messenger)).toBe('completed');

      const [root, musd, vmusd] = signedDelegations(mocks);
      const intent = (
        delegationHash: Hex,
        type: 'cash-migration-root' | 'cash-migration-transfer',
        tokenSymbol: string,
        tokenAddress: Hex,
      ): Parameters<ChompApiServiceCreateIntentsV2Action['handler']>[0][0] => ({
        account: PREDECESSOR,
        delegationHash,
        chainId: CHAIN_ID,
        intent: {
          type,
          data: { allowance: MAX_UINT256_HEX, tokenSymbol, tokenAddress },
        },
      });
      expect(mocks.createIntentsV2).toHaveBeenCalledTimes(1);
      expect(mocks.createIntentsV2).toHaveBeenCalledWith([
        intent(hashOf(root), 'cash-migration-root', 'mUSD', MUSD),
        intent(hashOf(musd), 'cash-migration-transfer', 'mUSD', MUSD),
        intent(hashOf(vmusd), 'cash-migration-transfer', 'vmUSD', VMUSD),
      ]);
    });

    it('stores every delegation before registering any intent', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      const lastStore = Math.max(
        ...mocks.createDelegation.mock.invocationCallOrder,
      );
      expect(mocks.createIntentsV2.mock.invocationCallOrder[0]).toBeGreaterThan(
        lastStore,
      );
    });

    it('only handles the steps that are missing', async () => {
      const { messenger, mocks } = setup(
        migratingIdentity({
          completed: ['ROOT_DELEGATION', 'TRANSFER_INTENT_MUSD'],
        }),
      );

      await run(messenger);

      expect(signedDelegations(mocks)).toHaveLength(1);
      expect(signedDelegations(mocks)[0].delegation.caveats).toStrictEqual(
        transferCaveats(VMUSD),
      );
      expect(mocks.createIntentsV2).toHaveBeenCalledWith([
        expect.objectContaining({
          intent: expect.objectContaining({
            data: expect.objectContaining({ tokenAddress: VMUSD }),
          }),
        }),
      ]);
    });

    it('ignores the steps signed by the successor or completed by CHOMP', async () => {
      const { messenger, mocks } = setup(
        migratingIdentity({
          completed: [
            'ROOT_DELEGATION',
            'TRANSFER_INTENT_MUSD',
            'TRANSFER_INTENT_VMUSD',
          ],
        }),
      );

      expect(await run(messenger)).toBe('already-done');
      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
    });

    it('registers stored delegations again instead of signing new ones', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        storedRootDelegation(),
        storedMusdTransferDelegation(),
      ]);

      await run(messenger);

      expect(signedDelegations(mocks)).toHaveLength(1);
      expect(mocks.createDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.createIntentsV2).toHaveBeenCalledWith([
        expect.objectContaining({ delegationHash: STORED_ROOT_HASH }),
        expect.objectContaining({ delegationHash: STORED_MUSD_HASH }),
        expect.objectContaining({
          delegationHash: hashOf(signedDelegations(mocks)[0]),
        }),
      ]);
    });

    it('matches stored delegations case-insensitively', async () => {
      const { messenger, mocks } = setup();
      const root = storedRootDelegation(SUCCESSOR.toUpperCase() as Hex);
      mocks.listDelegations.mockResolvedValue([
        {
          ...root,
          signedDelegation: {
            ...root.signedDelegation,
            delegator: PREDECESSOR.toUpperCase() as Hex,
          },
        },
      ]);

      await run(messenger);

      expect(mocks.createIntentsV2).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ delegationHash: STORED_ROOT_HASH }),
        ]),
      );
    });

    it('does not reuse delegations made for another successor', async () => {
      const { messenger, mocks } = setup();
      mocks.listDelegations.mockResolvedValue([
        storedRootDelegation(OTHER_SUCCESSOR),
        storedMusdTransferDelegation(OTHER_SUCCESSOR),
      ]);

      await run(messenger);

      expect(signedDelegations(mocks)).toHaveLength(3);
    });

    it('does not reuse delegations that differ in any other way', async () => {
      const { messenger, mocks } = setup(
        migratingIdentity({
          completed: ['ROOT_DELEGATION', 'TRANSFER_INTENT_VMUSD'],
        }),
      );
      const musd = storedMusdTransferDelegation();
      mocks.listDelegations.mockResolvedValue([
        storedDelegation({
          ...musd.metadata,
          ...musd.signedDelegation,
          delegator: SUCCESSOR,
        }),
        storedDelegation({
          ...musd.metadata,
          ...musd.signedDelegation,
          chainIdHex: '0xaa36a7',
        }),
        storedDelegation({
          ...musd.metadata,
          ...musd.signedDelegation,
          type: 'cash-deposit',
        }),
        storedDelegation({
          ...musd.metadata,
          ...musd.signedDelegation,
          tokenAddress: VMUSD,
        }),
        storedDelegation({
          ...musd.metadata,
          ...musd.signedDelegation,
          delegate: DELEGATE,
        }),
        storedDelegation({
          ...musd.metadata,
          ...musd.signedDelegation,
          caveats: musd.signedDelegation.caveats.slice(1),
        }),
        storedDelegation({
          ...musd.metadata,
          ...musd.signedDelegation,
          caveats: [
            ...musd.signedDelegation.caveats.slice(1),
            { ...musd.signedDelegation.caveats[0], enforcer: DELEGATE },
          ],
        }),
      ]);

      await run(messenger);

      expect(signedDelegations(mocks)).toHaveLength(1);
    });

    it('reuses a stored root delegation signed for the checksummed successor', async () => {
      const successor = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01' as Hex;
      const { messenger, mocks } = setup(
        migratingIdentity({
          to: successor.toLowerCase() as Hex,
          completed: ['TRANSFER_INTENT_MUSD', 'TRANSFER_INTENT_VMUSD'],
        }),
      );
      const root = storedRootDelegation();
      mocks.listDelegations.mockResolvedValue([
        storedDelegation({
          ...root.metadata,
          ...root.signedDelegation,
          delegate: successor,
          caveats: rootCaveats(successor),
        }),
      ]);

      await run(messenger);

      expect(mocks.signDelegation).not.toHaveBeenCalled();
      expect(mocks.createIntentsV2).toHaveBeenCalledWith([
        expect.objectContaining({ delegationHash: STORED_ROOT_HASH }),
      ]);
    });

    it('does not reuse a stored root delegation without caveats', async () => {
      const { messenger, mocks } = setup(
        migratingIdentity({
          completed: ['TRANSFER_INTENT_MUSD', 'TRANSFER_INTENT_VMUSD'],
        }),
      );
      const root = storedRootDelegation();
      mocks.listDelegations.mockResolvedValue([
        storedDelegation({
          ...root.metadata,
          ...root.signedDelegation,
          caveats: [],
        }),
      ]);

      await run(messenger);

      expect(signedDelegations(mocks)).toStrictEqual([
        expect.objectContaining({
          delegation: expect.objectContaining({ caveats: rootCaveats() }),
        }),
      ]);
    });

    it('reuses a stored delegation whatever the order of its caveats', async () => {
      const { messenger, mocks } = setup(
        migratingIdentity({
          completed: ['ROOT_DELEGATION', 'TRANSFER_INTENT_VMUSD'],
        }),
      );
      const musd = storedMusdTransferDelegation();
      mocks.listDelegations.mockResolvedValue([
        {
          ...musd,
          signedDelegation: {
            ...musd.signedDelegation,
            caveats: [...musd.signedDelegation.caveats].reverse(),
          },
        },
      ]);

      await run(messenger);

      expect(mocks.signDelegation).not.toHaveBeenCalled();
      expect(mocks.createIntentsV2).toHaveBeenCalledWith([
        expect.objectContaining({ delegationHash: STORED_MUSD_HASH }),
      ]);
    });

    it('does not register intents when signing fails', async () => {
      const { messenger, mocks } = setup();
      mocks.signDelegation
        .mockResolvedValueOnce(SIGNATURE)
        .mockRejectedValueOnce(new Error('User rejected'));

      await expect(run(messenger)).rejects.toThrow('User rejected');
      expect(mocks.createIntentsV2).not.toHaveBeenCalled();
    });
  });

  describe('for a premium migration', () => {
    const premiumIdentity = (): AddressIdentityResponse =>
      migratingIdentity({
        steps: PREMIUM_STEPS,
        completed: [
          'ROOT_DELEGATION',
          'TRANSFER_INTENT_MUSD',
          'TRANSFER_INTENT_VMUSD',
        ],
      });

    it('signs a pvmUSD transfer from the predecessor to CHOMP, redeemed by the vault migration helper', async () => {
      const { messenger, mocks } = setup(premiumIdentity());

      await run(messenger, PREMIUM_CONTEXT);

      expect(signedDelegations(mocks)).toStrictEqual([
        {
          delegation: {
            delegate: DELEGATE,
            delegator: PREDECESSOR,
            authority: ROOT_AUTHORITY,
            caveats: premiumTransferCaveats(),
            salt: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
          },
          chainId: CHAIN_ID,
        },
      ]);
      expect(mocks.createDelegation).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tokenSymbol: 'pvmUSD',
            tokenAddress: PVMUSD,
            type: 'cash-migration-premium-transfer',
          }),
        }),
      );
    });

    it('has the predecessor sign the destination of the pvmUSD transfer', async () => {
      const { messenger, mocks } = setup(premiumIdentity());

      await run(messenger, PREMIUM_CONTEXT);

      const delegationHash = hashOf(signedDelegations(mocks)[0]);
      const digest = keccak256(
        encode(
          ['address', 'uint256', 'address', 'address', 'bytes32'],
          [HELPER, 1n, PREDECESSOR, SUCCESSOR, delegationHash],
        ),
      );
      expect(mocks.signPersonalMessage).toHaveBeenCalledWith({
        data: bytesToHex(digest),
        from: PREDECESSOR,
      });
      expect(mocks.createIntentsV2).toHaveBeenCalledWith([
        {
          account: PREDECESSOR,
          delegationHash,
          chainId: CHAIN_ID,
          intent: {
            type: 'cash-migration-premium-transfer',
            data: {
              allowance: MAX_UINT256_HEX,
              tokenSymbol: 'pvmUSD',
              tokenAddress: PVMUSD,
              userSignature: USER_SIGNATURE,
            },
          },
        },
      ]);
    });

    it('signs the destination again for a stored pvmUSD transfer', async () => {
      const { messenger, mocks } = setup(premiumIdentity());
      mocks.listDelegations.mockResolvedValue([
        storedDelegation({
          delegate: DELEGATE,
          caveats: premiumTransferCaveats(),
          tokenAddress: PVMUSD,
          tokenSymbol: 'pvmUSD',
          type: 'cash-migration-premium-transfer',
          delegationHash: STORED_PREMIUM_HASH,
        }),
      ]);

      await run(messenger, PREMIUM_CONTEXT);

      expect(mocks.signDelegation).not.toHaveBeenCalled();
      expect(mocks.signPersonalMessage).toHaveBeenCalledWith({
        data: bytesToHex(
          keccak256(
            encode(
              ['address', 'uint256', 'address', 'address', 'bytes32'],
              [HELPER, 1n, PREDECESSOR, SUCCESSOR, STORED_PREMIUM_HASH],
            ),
          ),
        ),
        from: PREDECESSOR,
      });
    });

    it('registers the pvmUSD transfer with the other missing intents', async () => {
      const { messenger, mocks } = setup(
        migratingIdentity({ steps: PREMIUM_STEPS }),
      );

      await run(messenger, PREMIUM_CONTEXT);

      expect(signedDelegations(mocks)).toHaveLength(4);
      expect(mocks.createIntentsV2).toHaveBeenCalledTimes(1);
      expect(mocks.createIntentsV2.mock.calls[0][0]).toHaveLength(4);
    });

    it('reads the vault migration helper from the CHOMP service details of the chain', async () => {
      const { messenger, mocks } = setup(premiumIdentity());

      await run(messenger, PREMIUM_CONTEXT);

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);
      expect(mocks.getServiceDetails).toHaveBeenCalledWith([CHAIN_ID]);
    });

    it.each<{
      missing: string;
      context: Partial<StepContext>;
      details: unknown;
    }>([
      { missing: 'the premium vault', context: {}, details: serviceDetails() },
      {
        missing: 'the vault migration helper',
        context: PREMIUM_CONTEXT,
        details: serviceDetails({ vaultMigrationHelperAddress: undefined }),
      },
      {
        missing: 'service details for the chain',
        context: PREMIUM_CONTEXT,
        details: { auth: { message: 'message' }, chains: {} },
      },
    ])(
      'throws before signing anything without $missing',
      async ({ context, details }) => {
        const { messenger, mocks } = setup(
          migratingIdentity({ steps: PREMIUM_STEPS }),
        );
        mocks.getServiceDetails.mockResolvedValue(details);

        await expect(run(messenger, context)).rejects.toThrow(
          'A premium Money Account migration requires the premium vault and the vault migration helper',
        );
        expect(mocks.signDelegation).not.toHaveBeenCalled();
        expect(mocks.createIntentsV2).not.toHaveBeenCalled();
      },
    );

    it('does not need the premium config or the service details for a standard migration', async () => {
      const { messenger, mocks } = setup();

      expect(await run(messenger)).toBe('completed');
      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
    });
  });
});
