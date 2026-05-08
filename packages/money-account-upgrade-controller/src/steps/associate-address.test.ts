import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController';
import { associateAddressStep } from './associate-address';

const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
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
const MOCK_NOW = new Date('2026-04-17T12:00:00.000Z').getTime();

type AllActions = MessengerActions<MoneyAccountUpgradeControllerMessenger>;
type AllEvents = MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type Mocks = {
  signPersonalMessage: jest.Mock;
  associateAddress: jest.Mock;
};

function setup(): {
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  const mocks: Mocks = {
    signPersonalMessage: jest.fn().mockResolvedValue(MOCK_SIGNATURE),
    associateAddress: jest.fn().mockResolvedValue({
      profileId: 'profile-1',
      address: MOCK_ADDRESS,
      status: 'created',
    }),
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'KeyringController:signPersonalMessage',
    mocks.signPersonalMessage,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:associateAddress',
    mocks.associateAddress,
  );

  const messenger: MoneyAccountUpgradeControllerMessenger = new Messenger({
    namespace: 'MoneyAccountUpgradeController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'KeyringController:signPersonalMessage',
      'ChompApiService:associateAddress',
    ],
    events: [],
    messenger,
  });

  return { messenger, mocks };
}

async function run(
  messenger: MoneyAccountUpgradeControllerMessenger,
): ReturnType<typeof associateAddressStep.run> {
  return associateAddressStep.run({
    messenger,
    address: MOCK_ADDRESS,
    chainId: MOCK_CHAIN_ID,
    boringVaultAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Hex,
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
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(MOCK_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is named "associate-address"', () => {
    expect(associateAddressStep.name).toBe('associate-address');
  });

  it('signs the CHOMP Authentication message with the given address', async () => {
    const { messenger, mocks } = setup();

    await run(messenger);

    expect(mocks.signPersonalMessage).toHaveBeenCalledWith({
      data: `CHOMP Authentication ${MOCK_NOW}`,
      from: MOCK_ADDRESS,
    });
  });

  it('submits the signature, timestamp, and address to the CHOMP API', async () => {
    const { messenger, mocks } = setup();

    await run(messenger);

    expect(mocks.associateAddress).toHaveBeenCalledWith({
      signature: MOCK_SIGNATURE,
      timestamp: MOCK_NOW,
      address: MOCK_ADDRESS,
    });
  });

  it('returns "completed" when CHOMP creates the association', async () => {
    const { messenger } = setup();

    const result = await run(messenger);

    expect(result).toBe('completed');
  });

  it('returns "already-done" when CHOMP responds with active (409)', async () => {
    const { messenger, mocks } = setup();
    mocks.associateAddress.mockResolvedValue({
      address: MOCK_ADDRESS,
      status: 'active',
    });

    const result = await run(messenger);

    expect(result).toBe('already-done');
  });

  it('propagates errors from signing and does not submit to the API', async () => {
    const { messenger, mocks } = setup();
    mocks.signPersonalMessage.mockRejectedValue(new Error('signing failed'));

    await expect(run(messenger)).rejects.toThrow('signing failed');
    expect(mocks.associateAddress).not.toHaveBeenCalled();
  });

  it('propagates errors from the CHOMP API', async () => {
    const { messenger, mocks } = setup();
    mocks.associateAddress.mockRejectedValue(new Error('api failed'));

    await expect(run(messenger)).rejects.toThrow('api failed');
  });
});
