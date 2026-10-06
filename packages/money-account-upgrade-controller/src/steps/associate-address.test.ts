import type { AddressIdentityResponse } from '@metamask/chomp-api-service';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController.js';
import { associateAddressStep } from './associate-address.js';

const MOCK_ADDRESS = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12' as Hex;
const MOCK_ADDRESS_LOWERCASE = MOCK_ADDRESS.toLowerCase() as Hex;
const MOCK_PREDECESSOR = '0xFeDcBa0987654321FeDcBa0987654321FeDcBa09' as Hex;
const MOCK_PREDECESSOR_LOWERCASE = MOCK_PREDECESSOR.toLowerCase() as Hex;
const MOCK_OTHER_ADDRESS = '0x9999999999999999999999999999999999999999' as Hex;
const MOCK_CHAIN_ID = '0x1' as Hex;
const MOCK_DELEGATE = '0x1111111111111111111111111111111111111111' as Hex;
const MOCK_DELEGATOR_IMPL = '0x2222222222222222222222222222222222222222' as Hex;
const MOCK_TOKEN = '0x3333333333333333333333333333333333333333' as Hex;
const MOCK_VAULT_ADAPTER = '0x4444444444444444444444444444444444444444' as Hex;
const MOCK_ERC20_ENFORCER = '0x5555555555555555555555555555555555555555' as Hex;
const MOCK_REDEEMER_ENFORCER =
  '0x6666666666666666666666666666666666666666' as Hex;
const MOCK_VALUE_LTE_ENFORCER =
  '0x7777777777777777777777777777777777777777' as Hex;
const MOCK_SIGNATURE = '0xdeadbeefcafebabe';
const MOCK_CHALLENGE = {
  challengeId: '7b1e6f0c-1f3a-4d2b-9c8e-2a4b6c8d0e1f',
  message: 'chomp.example.com wants you to sign in with your Ethereum account',
  expiresAt: '2026-04-17T12:05:00.000Z',
};
const MOCK_SECOND_CHALLENGE = {
  challengeId: '0d9c8b7a-6f5e-4d3c-2b1a-0f9e8d7c6b5a',
  message: 'a second challenge message',
  expiresAt: '2026-04-17T12:06:00.000Z',
};

/**
 * Builds the error `ChompApiService` throws for a non-2xx response.
 *
 * @param httpStatus - The HTTP status of the response.
 * @param code - The CHOMP error code from the response body, if any.
 * @returns An `Error` carrying `httpStatus` and `code`, matching
 * `ChompApiError` from `@metamask/chomp-api-service`.
 */
function chompError(httpStatus: number, code?: string): Error {
  return Object.assign(
    new Error(`POST /v2/auth/address failed with status '${httpStatus}'`),
    { httpStatus, code },
  );
}

/**
 * Builds a `getDerivedIdentityByAddress` response for the account address.
 *
 * @param address - The address details.
 * @param address.role - The account address's role in the identity.
 * @param address.predecessor - The account address's active predecessor.
 * @param previousAddresses - The identity's previous addresses.
 * @returns The identity response.
 */
function identityResponse(
  {
    role,
    predecessor,
  }: Pick<AddressIdentityResponse['address'], 'role' | 'predecessor'>,
  previousAddresses: Hex[] = [],
): AddressIdentityResponse {
  return {
    identity: {
      currentAddress: MOCK_ADDRESS_LOWERCASE,
      previousAddresses,
      status: 'DONE',
      migration: null,
    },
    address: {
      address: MOCK_ADDRESS_LOWERCASE,
      role,
      predecessor,
      successor: null,
    },
  };
}

type AllActions = MessengerActions<MoneyAccountUpgradeControllerMessenger>;
type AllEvents = MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type Mocks = {
  signPersonalMessage: jest.Mock;
  createAddressChallenge: jest.Mock;
  associateAddressV2: jest.Mock;
  getAssociatedAddresses: jest.Mock;
  getDerivedIdentityByAddress: jest.Mock;
};

function setup(): {
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  const mocks: Mocks = {
    signPersonalMessage: jest.fn().mockResolvedValue(MOCK_SIGNATURE),
    createAddressChallenge: jest.fn().mockResolvedValue(MOCK_CHALLENGE),
    associateAddressV2: jest.fn().mockResolvedValue({
      profileId: 'profile-1',
      address: MOCK_ADDRESS_LOWERCASE,
      status: 'created',
    }),
    getAssociatedAddresses: jest.fn().mockResolvedValue([]),
    getDerivedIdentityByAddress: jest.fn().mockResolvedValue(null),
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'KeyringController:signPersonalMessage',
    mocks.signPersonalMessage,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:createAddressChallenge',
    mocks.createAddressChallenge,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:associateAddressV2',
    mocks.associateAddressV2,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:getAssociatedAddresses',
    mocks.getAssociatedAddresses,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:getDerivedIdentityByAddress',
    mocks.getDerivedIdentityByAddress,
  );

  const messenger: MoneyAccountUpgradeControllerMessenger = new Messenger({
    namespace: 'MoneyAccountUpgradeController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'KeyringController:signPersonalMessage',
      'ChompApiService:createAddressChallenge',
      'ChompApiService:associateAddressV2',
      'ChompApiService:getAssociatedAddresses',
      'ChompApiService:getDerivedIdentityByAddress',
    ],
    events: [],
    messenger,
  });

  return { messenger, mocks };
}

async function run(
  messenger: MoneyAccountUpgradeControllerMessenger,
  predecessorAddress?: Hex,
): ReturnType<typeof associateAddressStep.run> {
  return associateAddressStep.run({
    messenger,
    address: MOCK_ADDRESS,
    ...(predecessorAddress ? { predecessorAddress } : {}),
    chainId: MOCK_CHAIN_ID,
    boringVaultAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    delegateAddress: MOCK_DELEGATE,
    delegatorImplAddress: MOCK_DELEGATOR_IMPL,
    erc20TransferAmountEnforcer: MOCK_ERC20_ENFORCER,
    musdTokenAddress: MOCK_TOKEN,
    redeemerEnforcer: MOCK_REDEEMER_ENFORCER,
    valueLteEnforcer: MOCK_VALUE_LTE_ENFORCER,
    vedaVaultAdapterAddress: MOCK_VAULT_ADAPTER,
  });
}

describe('associateAddressStep', () => {
  it('is named "associate-address"', () => {
    expect(associateAddressStep.name).toBe('associate-address');
  });

  describe('without a predecessor', () => {
    it('checks the associated addresses before signing anything', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.getAssociatedAddresses).toHaveBeenCalledTimes(1);
      expect(
        mocks.getAssociatedAddresses.mock.invocationCallOrder[0],
      ).toBeLessThan(mocks.signPersonalMessage.mock.invocationCallOrder[0]);
      expect(mocks.getDerivedIdentityByAddress).not.toHaveBeenCalled();
    });

    it('returns "already-done" without signing or submitting when the address is already associated', async () => {
      const { messenger, mocks } = setup();
      // CHOMP lowercases stored addresses; the step receives a checksummed
      // one, so this also covers the case-insensitive match.
      mocks.getAssociatedAddresses.mockResolvedValue([
        {
          profileId: 'profile-1',
          address: MOCK_ADDRESS_LOWERCASE,
          status: 'active',
        },
      ]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mocks.createAddressChallenge).not.toHaveBeenCalled();
      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
      expect(mocks.associateAddressV2).not.toHaveBeenCalled();
    });

    it('proceeds with association when only other addresses are associated', async () => {
      const { messenger, mocks } = setup();
      mocks.getAssociatedAddresses.mockResolvedValue([
        {
          profileId: 'profile-1',
          address: MOCK_OTHER_ADDRESS,
          status: 'active',
        },
      ]);

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.associateAddressV2).toHaveBeenCalled();
    });

    it('requests an ASSOCIATE challenge for the address', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.createAddressChallenge).toHaveBeenCalledWith({
        address: MOCK_ADDRESS,
        purpose: 'ASSOCIATE',
      });
    });

    it('signs the challenge message exactly as returned, with the given address', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.signPersonalMessage).toHaveBeenCalledWith({
        data: MOCK_CHALLENGE.message,
        from: MOCK_ADDRESS,
      });
    });

    it('submits the challenge ID and signature to the CHOMP API', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.associateAddressV2).toHaveBeenCalledWith({
        challengeId: MOCK_CHALLENGE.challengeId,
        signature: MOCK_SIGNATURE,
      });
    });

    it('returns "completed" when CHOMP creates the association', async () => {
      const { messenger } = setup();

      const result = await run(messenger);

      expect(result).toBe('completed');
    });

    it('returns "already-done" when the association was created concurrently', async () => {
      const { messenger, mocks } = setup();
      mocks.associateAddressV2.mockResolvedValue({
        address: MOCK_ADDRESS_LOWERCASE,
        status: 'active',
      });

      const result = await run(messenger);

      expect(result).toBe('already-done');
    });

    it('falls through to sign-and-submit when the lookup fails', async () => {
      const { messenger, mocks } = setup();
      mocks.getAssociatedAddresses.mockRejectedValue(
        new Error('lookup failed'),
      );

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.signPersonalMessage).toHaveBeenCalled();
      expect(mocks.associateAddressV2).toHaveBeenCalled();
    });

    it('signs a fresh challenge once when the first is invalid or expired', async () => {
      const { messenger, mocks } = setup();
      mocks.createAddressChallenge
        .mockResolvedValueOnce(MOCK_CHALLENGE)
        .mockResolvedValueOnce(MOCK_SECOND_CHALLENGE);
      mocks.associateAddressV2.mockRejectedValueOnce(
        chompError(400, 'CHALLENGE_INVALID_OR_EXPIRED'),
      );

      const result = await run(messenger);

      expect(result).toBe('completed');
      expect(mocks.signPersonalMessage).toHaveBeenLastCalledWith({
        data: MOCK_SECOND_CHALLENGE.message,
        from: MOCK_ADDRESS,
      });
      expect(mocks.associateAddressV2).toHaveBeenLastCalledWith({
        challengeId: MOCK_SECOND_CHALLENGE.challengeId,
        signature: MOCK_SIGNATURE,
      });
    });

    it('throws a non-terminal error when the fresh challenge is also invalid', async () => {
      const { messenger, mocks } = setup();
      mocks.associateAddressV2.mockRejectedValue(
        chompError(400, 'CHALLENGE_INVALID_OR_EXPIRED'),
      );

      const error = await run(messenger).catch((thrown: unknown) => thrown);

      expect(error).toMatchObject({ code: 'CHALLENGE_INVALID_OR_EXPIRED' });
      expect(error).not.toMatchObject({ terminal: true });
      expect(mocks.createAddressChallenge).toHaveBeenCalledTimes(2);
    });

    it('returns "already-done" when a conflict turns out to be a same-profile race', async () => {
      const { messenger, mocks } = setup();
      mocks.associateAddressV2.mockRejectedValue(chompError(409));
      // First lookup (pre-check) misses; second (disambiguation) finds it.
      mocks.getAssociatedAddresses
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            profileId: 'profile-1',
            address: MOCK_ADDRESS_LOWERCASE,
            status: 'active',
          },
        ]);

      const result = await run(messenger);

      expect(result).toBe('already-done');
    });

    it('throws a terminal error when the address belongs to another profile', async () => {
      const { messenger, mocks } = setup();
      mocks.associateAddressV2.mockRejectedValue(chompError(409));

      const error = await run(messenger).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        `Address ${MOCK_ADDRESS} is associated with a different CHOMP profile.`,
      );
      expect(error).toMatchObject({ terminal: true });
    });

    it('rethrows the original, non-terminal conflict when the disambiguating lookup also fails', async () => {
      const { messenger, mocks } = setup();
      mocks.associateAddressV2.mockRejectedValue(chompError(409));
      mocks.getAssociatedAddresses
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('lookup failed'));

      const error = await run(messenger).catch((thrown: unknown) => thrown);

      expect((error as Error).message).toBe(
        "POST /v2/auth/address failed with status '409'",
      );
      expect(error).not.toMatchObject({ terminal: true });
    });

    it('propagates errors from requesting the challenge and does not sign', async () => {
      const { messenger, mocks } = setup();
      mocks.createAddressChallenge.mockRejectedValue(
        new Error('challenge failed'),
      );

      await expect(run(messenger)).rejects.toThrow('challenge failed');
      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
    });

    it('propagates errors from signing and does not submit to the API', async () => {
      const { messenger, mocks } = setup();
      mocks.signPersonalMessage.mockRejectedValue(new Error('signing failed'));

      await expect(run(messenger)).rejects.toThrow('signing failed');
      expect(mocks.associateAddressV2).not.toHaveBeenCalled();
    });

    it('propagates errors from the CHOMP API', async () => {
      const { messenger, mocks } = setup();
      mocks.associateAddressV2.mockRejectedValue(new Error('api failed'));

      await expect(run(messenger)).rejects.toThrow('api failed');
    });
  });

  describe('with a predecessor', () => {
    it('looks up the address identity before signing anything', async () => {
      const { messenger, mocks } = setup();

      await run(messenger, MOCK_PREDECESSOR);

      expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledWith(
        MOCK_ADDRESS,
      );
      expect(
        mocks.getDerivedIdentityByAddress.mock.invocationCallOrder[0],
      ).toBeLessThan(mocks.signPersonalMessage.mock.invocationCallOrder[0]);
      expect(mocks.getAssociatedAddresses).not.toHaveBeenCalled();
    });

    it('returns "already-done" when the address is already the pending successor of the predecessor', async () => {
      const { messenger, mocks } = setup();
      mocks.getDerivedIdentityByAddress.mockResolvedValue(
        identityResponse({
          role: 'PENDING_SUCCESSOR',
          predecessor: MOCK_PREDECESSOR_LOWERCASE,
        }),
      );

      const result = await run(messenger, MOCK_PREDECESSOR);

      expect(result).toBe('already-done');
      expect(mocks.createAddressChallenge).not.toHaveBeenCalled();
      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
    });

    it('returns "already-done" when the migration from the predecessor has completed', async () => {
      const { messenger, mocks } = setup();
      mocks.getDerivedIdentityByAddress.mockResolvedValue(
        identityResponse({ role: 'CURRENT', predecessor: null }, [
          MOCK_PREDECESSOR_LOWERCASE,
        ]),
      );

      const result = await run(messenger, MOCK_PREDECESSOR);

      expect(result).toBe('already-done');
      expect(mocks.createAddressChallenge).not.toHaveBeenCalled();
    });

    it.each([
      {
        description: 'already a Money Account of its own',
        response: identityResponse({ role: 'CURRENT', predecessor: null }),
      },
      {
        description: 'a previous address of a Money Account',
        response: identityResponse({ role: 'PREVIOUS', predecessor: null }),
      },
      {
        description: 'the pending successor of another address',
        response: identityResponse({
          role: 'PENDING_SUCCESSOR',
          predecessor: MOCK_OTHER_ADDRESS,
        }),
      },
    ])(
      'throws a terminal error without signing when the address is $description',
      async ({ response }) => {
        const { messenger, mocks } = setup();
        mocks.getDerivedIdentityByAddress.mockResolvedValue(response);

        const error = await run(messenger, MOCK_PREDECESSOR).catch(
          (thrown: unknown) => thrown,
        );

        expect((error as Error).message).toBe(
          `Address ${MOCK_ADDRESS} is already part of a Money Account and cannot be linked as the successor of ${MOCK_PREDECESSOR}.`,
        );
        expect(error).toMatchObject({ terminal: true });
        expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
      },
    );

    it('requests an ASSOCIATE_SUCCESSOR challenge with the predecessor address', async () => {
      const { messenger, mocks } = setup();

      await run(messenger, MOCK_PREDECESSOR);

      expect(mocks.createAddressChallenge).toHaveBeenCalledWith({
        address: MOCK_ADDRESS,
        purpose: 'ASSOCIATE_SUCCESSOR',
        predecessorAddress: MOCK_PREDECESSOR,
      });
    });

    it('signs and submits the challenge, returning "completed" when CHOMP creates the link', async () => {
      const { messenger, mocks } = setup();

      const result = await run(messenger, MOCK_PREDECESSOR);

      expect(result).toBe('completed');
      expect(mocks.signPersonalMessage).toHaveBeenCalledWith({
        data: MOCK_CHALLENGE.message,
        from: MOCK_ADDRESS,
      });
      expect(mocks.associateAddressV2).toHaveBeenCalledWith({
        challengeId: MOCK_CHALLENGE.challengeId,
        signature: MOCK_SIGNATURE,
      });
    });

    it('returns "already-done" when CHOMP reports the link already existed', async () => {
      const { messenger, mocks } = setup();
      mocks.associateAddressV2.mockResolvedValue({
        address: MOCK_ADDRESS_LOWERCASE,
        status: 'active',
      });

      const result = await run(messenger, MOCK_PREDECESSOR);

      expect(result).toBe('already-done');
    });

    it('falls through to sign-and-submit when the lookup fails', async () => {
      const { messenger, mocks } = setup();
      mocks.getDerivedIdentityByAddress.mockRejectedValue(
        new Error('lookup failed'),
      );

      const result = await run(messenger, MOCK_PREDECESSOR);

      expect(result).toBe('completed');
      expect(mocks.associateAddressV2).toHaveBeenCalled();
    });

    it('signs a fresh challenge once when the first is invalid or expired', async () => {
      const { messenger, mocks } = setup();
      mocks.createAddressChallenge
        .mockResolvedValueOnce(MOCK_CHALLENGE)
        .mockResolvedValueOnce(MOCK_SECOND_CHALLENGE);
      mocks.associateAddressV2.mockRejectedValueOnce(
        chompError(400, 'CHALLENGE_INVALID_OR_EXPIRED'),
      );

      const result = await run(messenger, MOCK_PREDECESSOR);

      expect(result).toBe('completed');
      expect(mocks.createAddressChallenge).toHaveBeenCalledTimes(2);
      expect(mocks.createAddressChallenge).toHaveBeenLastCalledWith({
        address: MOCK_ADDRESS,
        purpose: 'ASSOCIATE_SUCCESSOR',
        predecessorAddress: MOCK_PREDECESSOR,
      });
    });

    it.each([
      { httpStatus: 400, code: 'PREDECESSOR_NOT_ASSOCIATED' },
      { httpStatus: 400, code: 'PREDECESSOR_NOT_MONEY_ACCOUNT' },
      { httpStatus: 409, code: 'PREDECESSOR_ALREADY_LINKED' },
      { httpStatus: 409, code: 'SUCCESSOR_ALREADY_LINKED' },
      { httpStatus: 409, code: 'SUCCESSOR_ALREADY_MONEY_ACCOUNT' },
      { httpStatus: 409, code: 'LINK_CYCLE' },
    ])(
      'throws a terminal error when CHOMP rejects the link with $code',
      async ({ httpStatus, code }) => {
        const { messenger, mocks } = setup();
        mocks.associateAddressV2.mockRejectedValue(
          chompError(httpStatus, code),
        );

        const error = await run(messenger, MOCK_PREDECESSOR).catch(
          (thrown: unknown) => thrown,
        );

        expect((error as Error).message).toBe(
          `CHOMP rejected linking ${MOCK_ADDRESS} as the successor of ${MOCK_PREDECESSOR}: ${code}`,
        );
        expect(error).toMatchObject({ terminal: true });
      },
    );

    it('rethrows a non-terminal error while the predecessor has open withdrawals', async () => {
      const { messenger, mocks } = setup();
      const openWithdrawals = chompError(
        409,
        'PREDECESSOR_HAS_OPEN_WITHDRAWALS',
      );
      mocks.associateAddressV2.mockRejectedValue(openWithdrawals);

      const error = await run(messenger, MOCK_PREDECESSOR).catch(
        (thrown: unknown) => thrown,
      );

      expect(error).toBe(openWithdrawals);
      expect(error).not.toMatchObject({ terminal: true });
    });

    it('returns "already-done" when a conflict turns out to be a same-profile race', async () => {
      const { messenger, mocks } = setup();
      mocks.associateAddressV2.mockRejectedValue(chompError(409));
      mocks.getDerivedIdentityByAddress
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          identityResponse({
            role: 'PENDING_SUCCESSOR',
            predecessor: MOCK_PREDECESSOR_LOWERCASE,
          }),
        );

      const result = await run(messenger, MOCK_PREDECESSOR);

      expect(result).toBe('already-done');
    });

    it('throws a terminal error when a conflict reveals the address is now part of another Money Account', async () => {
      const { messenger, mocks } = setup();
      mocks.associateAddressV2.mockRejectedValue(chompError(409));
      mocks.getDerivedIdentityByAddress
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          identityResponse({ role: 'CURRENT', predecessor: null }),
        );

      const error = await run(messenger, MOCK_PREDECESSOR).catch(
        (thrown: unknown) => thrown,
      );

      expect((error as Error).message).toBe(
        `Address ${MOCK_ADDRESS} is already part of a Money Account and cannot be linked as the successor of ${MOCK_PREDECESSOR}.`,
      );
      expect(error).toMatchObject({ terminal: true });
    });

    it('throws a terminal error when the address belongs to another profile', async () => {
      const { messenger, mocks } = setup();
      mocks.associateAddressV2.mockRejectedValue(chompError(409));

      const error = await run(messenger, MOCK_PREDECESSOR).catch(
        (thrown: unknown) => thrown,
      );

      expect((error as Error).message).toBe(
        `Address ${MOCK_ADDRESS} is associated with a different CHOMP profile.`,
      );
      expect(error).toMatchObject({ terminal: true });
    });
  });
});
