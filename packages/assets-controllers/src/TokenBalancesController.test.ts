import { ControllerMessenger } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-api';
import BN from 'bn.js';

import { flushPromises } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
import type {
  AllowedActions,
  AllowedEvents,
  TokenBalancesControllerActions,
  TokenBalancesControllerEvents,
  TokenBalancesControllerMessenger,
} from './TokenBalancesController';
import { TokenBalancesController } from './TokenBalancesController';
import type { Token } from './TokenRatesController';
import {
  getDefaultTokensState,
  type TokensControllerState,
} from './TokensController';

const controllerName = 'TokenBalancesController';

/**
 * Constructs a restricted controller messenger.
 *
 * @param controllerMessenger - The controller messenger to restrict.
 * @returns A restricted controller messenger.
 */
function getMessenger(
  controllerMessenger = new ControllerMessenger<
    TokenBalancesControllerActions | AllowedActions,
    TokenBalancesControllerEvents | AllowedEvents
  >(),
): TokenBalancesControllerMessenger {
  return controllerMessenger.getRestricted({
    name: controllerName,
    allowedActions: [
      'AccountsController:getSelectedAccount',
      'AssetsContractController:getERC20BalanceOf',
    ],
    allowedEvents: ['TokensController:stateChange'],
  });
}

const setupController = ({
  config,
  mock,
}: {
  config?: Partial<ConstructorParameters<typeof TokenBalancesController>[0]>;
  mock: {
    getBalanceOf?: BN;
    selectedAccount: InternalAccount;
  };
}): {
  controller: TokenBalancesController;
  messenger: TokenBalancesControllerMessenger;
  mockSelectedAccount: jest.Mock<InternalAccount>;
  mockGetERC20BalanceOf: jest.Mock<BN>;
  triggerTokensStateChange: (state: TokensControllerState) => Promise<void>;
} => {
  const controllerMessenger = new ControllerMessenger<
    TokenBalancesControllerActions | AllowedActions,
    TokenBalancesControllerEvents | AllowedEvents
  >();
  const messenger = getMessenger(controllerMessenger);

  const mockSelectedAccount = jest.fn().mockReturnValue(mock.selectedAccount);
  const mockGetERC20BalanceOf = jest.fn().mockReturnValue(mock.getBalanceOf);

  controllerMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockSelectedAccount,
  );
  controllerMessenger.registerActionHandler(
    'AssetsContractController:getERC20BalanceOf',
    mockGetERC20BalanceOf,
  );

  const controller = new TokenBalancesController({
    messenger,
    ...config,
  });

  const triggerTokensStateChange = async (state: TokensControllerState) => {
    controllerMessenger.publish('TokensController:stateChange', state, []);
  };

  return {
    controller,
    messenger,
    mockSelectedAccount,
    mockGetERC20BalanceOf,
    triggerTokensStateChange,
  };
};

describe('TokenBalancesController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should set default state', () => {
    const { controller } = setupController({
      mock: {
        selectedAccount: createMockInternalAccount({ address: '0x1234' }),
      },
    });

    expect(controller.state).toStrictEqual({ contractBalances: {} });
  });

  it('should poll and update balances in the right interval', async () => {
    const updateBalancesSpy = jest.spyOn(
      TokenBalancesController.prototype,
      'updateBalances',
    );

    new TokenBalancesController({
      interval: 10,
      messenger: getMessenger(new ControllerMessenger()),
    });
    await flushPromises();

    expect(updateBalancesSpy).toHaveBeenCalled();
    expect(updateBalancesSpy).not.toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(15);

    expect(updateBalancesSpy).toHaveBeenCalledTimes(2);
  });

  it('should update balances if enabled', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const { controller } = setupController({
      config: {
        disabled: false,
        tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
        interval: 10,
      },
      mock: {
        getBalanceOf: new BN(1),
        selectedAccount: createMockInternalAccount({ address: '0x1234' }),
      },
    });

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });
  });

  it('should not update balances if disabled', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const { controller } = setupController({
      config: {
        disabled: true,
        tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
        interval: 10,
      },
      mock: {
        selectedAccount: createMockInternalAccount({ address: '0x1234' }),
        getBalanceOf: new BN(1),
      },
    });

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({});
  });

  it('should update balances if controller is manually enabled', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const { controller } = setupController({
      config: {
        disabled: true,
        tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
        interval: 10,
      },
      mock: {
        selectedAccount: createMockInternalAccount({ address: '0x1234' }),
        getBalanceOf: new BN(1),
      },
    });

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({});

    controller.enable();
    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });
  });

  it('should not update balances if controller is manually disabled', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const { controller } = setupController({
      config: {
        disabled: false,
        tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
        interval: 10,
      },
      mock: {
        selectedAccount: createMockInternalAccount({ address: '0x1234' }),
        getBalanceOf: new BN(1),
      },
    });

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });

    controller.disable();
    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });
  });

  it('should update balances if tokens change and controller is manually enabled', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const { controller, triggerTokensStateChange } = setupController({
      config: {
        disabled: true,
        tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
        interval: 10,
      },
      mock: {
        selectedAccount: createMockInternalAccount({ address: '0x1234' }),
        getBalanceOf: new BN(1),
      },
    });

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({});

    controller.enable();
    await triggerTokensStateChange({
      ...getDefaultTokensState(),
      tokens: [
        {
          address: '0x00',
          symbol: 'FOO',
          decimals: 18,
        },
      ],
    });

    expect(controller.state.contractBalances).toStrictEqual({
      '0x00': toHex(new BN(1)),
    });
  });

  it('should not update balances if tokens change and controller is manually disabled', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const { controller, triggerTokensStateChange } = setupController({
      config: {
        disabled: false,
        tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
        interval: 10,
      },
      mock: {
        selectedAccount: createMockInternalAccount({ address: '0x1234' }),
        getBalanceOf: new BN(1),
      },
    });

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });

    controller.disable();
    await triggerTokensStateChange({
      ...getDefaultTokensState(),
      tokens: [
        {
          address: '0x00',
          symbol: 'FOO',
          decimals: 18,
        },
      ],
    });

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });
  });

  it('should clear previous interval', async () => {
    const { controller } = setupController({
      config: {
        interval: 1337,
      },
      mock: {
        selectedAccount: createMockInternalAccount({ address: '0x1234' }),
        getBalanceOf: new BN(1),
      },
    });

    const mockClearTimeout = jest.spyOn(global, 'clearTimeout');

    await controller.poll(1338);

    jest.advanceTimersByTime(1339);

    expect(mockClearTimeout).toHaveBeenCalled();
  });

  it('should update all balances', async () => {
    const selectedAddress = '0x0000000000000000000000000000000000000001';
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const tokens: Token[] = [
      {
        address,
        decimals: 18,
        symbol: 'EOS',
        aggregators: [],
      },
    ];
    const { controller } = setupController({
      config: {
        interval: 1337,
        tokens,
      },
      mock: {
        selectedAccount: createMockInternalAccount({
          address: selectedAddress,
        }),
        getBalanceOf: new BN(1),
      },
    });

    expect(controller.state.contractBalances).toStrictEqual({});

    await controller.updateBalances();

    expect(tokens[0].hasBalanceError).toBe(false);
    expect(Object.keys(controller.state.contractBalances)).toContain(address);
    expect(controller.state.contractBalances[address]).not.toBe(toHex(0));
  });

  it('should handle `getERC20BalanceOf` error case', async () => {
    const errorMsg = 'Failed to get balance';
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const tokens: Token[] = [
      {
        address,
        decimals: 18,
        symbol: 'EOS',
        aggregators: [],
      },
    ];

    const { controller, mockGetERC20BalanceOf } = setupController({
      config: {
        interval: 1337,
        tokens,
      },
      mock: {
        selectedAccount: createMockInternalAccount({
          address,
        }),
      },
    });

    // @ts-expect-error Testing error case
    mockGetERC20BalanceOf.mockReturnValueOnce(new Error(errorMsg));

    expect(controller.state.contractBalances).toStrictEqual({});

    await controller.updateBalances();

    expect(tokens[0].hasBalanceError).toBe(true);
    expect(controller.state.contractBalances[address]).toBe(toHex(0));

    mockGetERC20BalanceOf.mockReturnValueOnce(new BN(1));
    await controller.updateBalances();

    expect(tokens[0].hasBalanceError).toBe(false);
    expect(Object.keys(controller.state.contractBalances)).toContain(address);
    expect(controller.state.contractBalances[address]).not.toBe(0);
  });

  it('should update balances when tokens change', async () => {
    const { controller, triggerTokensStateChange } = setupController({
      config: {
        interval: 1337,
      },
      mock: {
        selectedAccount: createMockInternalAccount({
          address: '0x1234',
        }),
        getBalanceOf: new BN(1),
      },
    });

    const updateBalancesSpy = jest.spyOn(controller, 'updateBalances');

    await triggerTokensStateChange({
      ...getDefaultTokensState(),
      tokens: [
        {
          address: '0x00',
          symbol: 'FOO',
          decimals: 18,
        },
      ],
    });

    expect(updateBalancesSpy).toHaveBeenCalled();
  });

  it('should update token balances when detected tokens are added', async () => {
    const { controller, triggerTokensStateChange } = setupController({
      config: {
        interval: 1337,
      },
      mock: {
        selectedAccount: createMockInternalAccount({
          address: '0x1234',
        }),
        getBalanceOf: new BN(1),
      },
    });

    expect(controller.state.contractBalances).toStrictEqual({});

    await triggerTokensStateChange({
      ...getDefaultTokensState(),
      detectedTokens: [
        {
          address: '0x02',
          decimals: 18,
          image: undefined,
          symbol: 'bar',
          isERC721: false,
        },
      ],
      tokens: [],
    });

    expect(controller.state.contractBalances).toStrictEqual({
      '0x02': toHex(new BN(1)),
    });
  });
});
