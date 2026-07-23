import { Messenger } from '@metamask/messenger';
import {
  getDefaultShieldControllerState,
  ShieldController,
} from '@metamask/shield-controller';
import type { TransactionControllerState } from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { shieldController } from './shield-controller.js';
import type { ShieldBackend } from './types.js';

const MOCK_COVERAGE_ID = 'coverage-id-1';
const SHIELD_BASE_URL = 'https://rule-engine.metamask.io';

type ActionHandler = (...args: unknown[]) => unknown;

type AnyMessenger = Messenger<string>;

const SHIELD_OPTIONS = {
  baseUrl: SHIELD_BASE_URL,
  fetchFunction: globalThis.fetch,
};

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

function registerActionHandler(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  namespace: string,
  actionType: string,
  handler: ActionHandler,
): void {
  const messenger = new Messenger({
    namespace,
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      registerActionHandler(type: string, handler: ActionHandler): void;
    }
  ).registerActionHandler(actionType, handler);
}

function createMockBackend(): jest.Mocked<ShieldBackend> {
  return {
    checkCoverage: jest.fn().mockResolvedValue({
      coverageId: MOCK_COVERAGE_ID,
      status: 'covered',
      metrics: {},
    }),
    checkSignatureCoverage: jest.fn().mockResolvedValue({
      coverageId: MOCK_COVERAGE_ID,
      status: 'covered',
      metrics: {},
    }),
    logSignature: jest.fn(),
    logTransaction: jest.fn(),
  };
}

function createMockSignatureRequest(): Parameters<
  ShieldController['checkSignatureCoverage']
>[0] {
  return {
    chainId: '0x1',
    id: 'signature-request-1',
    type: 'personal_sign',
    messageParams: {
      data: '0x00',
      from: '0x0000000000000000000000000000000000000000',
    },
    networkClientId: 'mainnet',
    status: 'unapproved',
    time: Date.now(),
  };
}

describe('shieldController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(shieldController);
  });

  it('initializes a ShieldController with default state', () => {
    const messenger = shieldController.getMessenger(getRootMessenger());

    const instance = shieldController.init({
      state: undefined,
      messenger,
      options: SHIELD_OPTIONS,
    });

    expect(instance).toBeInstanceOf(ShieldController);
    expect(instance.state).toStrictEqual(getDefaultShieldControllerState());
  });

  it('forwards the provided state to the controller', () => {
    const messenger = shieldController.getMessenger(getRootMessenger());

    const instance = shieldController.init({
      state: {
        orderedTransactionHistory: ['tx-1'],
      },
      messenger,
      options: SHIELD_OPTIONS,
    });

    expect(instance.state.orderedTransactionHistory).toStrictEqual(['tx-1']);
  });

  it('uses a provided backend override', () => {
    const messenger = shieldController.getMessenger(getRootMessenger());
    const mockBackend = createMockBackend();

    const instance = shieldController.init({
      state: undefined,
      messenger,
      options: {
        ...SHIELD_OPTIONS,
        backend: mockBackend,
      },
    });

    expect(instance).toBeInstanceOf(ShieldController);
  });

  it('forwards transactionHistoryLimit and coverageHistoryLimit', () => {
    const messenger = shieldController.getMessenger(getRootMessenger());
    const mockBackend = createMockBackend();

    const instance = shieldController.init({
      state: undefined,
      messenger,
      options: {
        ...SHIELD_OPTIONS,
        backend: mockBackend,
        transactionHistoryLimit: 5,
        coverageHistoryLimit: 2,
      },
    });

    expect(instance).toBeInstanceOf(ShieldController);
  });

  it('forwards normalizeSignatureRequest to the controller', async () => {
    const rootMessenger = getRootMessenger();
    const messenger = shieldController.getMessenger(rootMessenger);
    const mockBackend = createMockBackend();
    const signatureRequest = createMockSignatureRequest();
    const normalizedSignatureRequest = {
      ...signatureRequest,
      messageParams: {
        ...signatureRequest.messageParams,
        data: 'normalized data',
      },
    };
    const normalizeSignatureRequest = jest
      .fn()
      .mockReturnValue(normalizedSignatureRequest);

    const instance = shieldController.init({
      state: undefined,
      messenger,
      options: {
        ...SHIELD_OPTIONS,
        backend: mockBackend,
        normalizeSignatureRequest,
      },
    });

    await instance.checkSignatureCoverage(signatureRequest);

    expect(normalizeSignatureRequest).toHaveBeenCalledWith(signatureRequest);
    expect(mockBackend.checkSignatureCoverage).toHaveBeenCalledWith({
      signatureRequest: normalizedSignatureRequest,
    });
  });

  it('wires default getAccessToken to AuthenticationController:getBearerToken', async () => {
    const rootMessenger = getRootMessenger();
    registerActionHandler(
      rootMessenger,
      'AuthenticationController',
      'AuthenticationController:getBearerToken',
      async () => 'test-bearer-token',
    );
    const messenger = shieldController.getMessenger(rootMessenger);
    const fetchFunction = jest.fn(async () => {
      const callCount = fetchFunction.mock.calls.length;
      if (callCount === 1) {
        return new globalThis.Response(
          JSON.stringify({ coverageId: MOCK_COVERAGE_ID }),
          { status: 200 },
        );
      }

      return new globalThis.Response(
        JSON.stringify({
          status: 'covered',
          metrics: {},
        }),
        { status: 200 },
      );
    });

    const instance = shieldController.init({
      state: undefined,
      messenger,
      options: {
        baseUrl: SHIELD_BASE_URL,
        fetchFunction,
      },
    });

    await instance.checkCoverage({
      id: 'tx-1',
      chainId: '0x1',
      status: TransactionStatus.Unapproved,
      time: Date.now(),
      txParams: {
        from: '0x0000000000000000000000000000000000000000',
      },
    } as never);

    expect(fetchFunction).toHaveBeenCalled();
    const firstCall = fetchFunction.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const [, requestInit] = firstCall;
    const headers = new globalThis.Headers(requestInit.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-bearer-token');
  });

  it('uses a provided getAccessToken override', async () => {
    const rootMessenger = getRootMessenger();
    const messenger = shieldController.getMessenger(rootMessenger);
    const fetchFunction = jest.fn(async () => {
      const callCount = fetchFunction.mock.calls.length;
      if (callCount === 1) {
        return new globalThis.Response(
          JSON.stringify({ coverageId: MOCK_COVERAGE_ID }),
          { status: 200 },
        );
      }

      return new globalThis.Response(
        JSON.stringify({
          status: 'covered',
          metrics: {},
        }),
        { status: 200 },
      );
    });
    const getAccessToken = jest.fn().mockResolvedValue('override-token');

    const instance = shieldController.init({
      state: undefined,
      messenger,
      options: {
        baseUrl: SHIELD_BASE_URL,
        fetchFunction,
        getAccessToken,
      },
    });

    await instance.checkCoverage({
      id: 'tx-1',
      chainId: '0x1',
      status: TransactionStatus.Unapproved,
      time: Date.now(),
      txParams: {
        from: '0x0000000000000000000000000000000000000000',
      },
    } as never);

    expect(getAccessToken).toHaveBeenCalled();
    const firstCall = fetchFunction.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const [, requestInit] = firstCall;
    const headers = new globalThis.Headers(requestInit.headers);
    expect(headers.get('Authorization')).toBe('Bearer override-token');
  });

  it('delegates AuthenticationController:getBearerToken and controller state-change events', () => {
    const parent = getRootMessenger();
    const delegateSpy = jest.spyOn(parent, 'delegate');
    const messenger = shieldController.getMessenger(parent);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger,
      actions: ['AuthenticationController:getBearerToken'],
      events: [
        'TransactionController:stateChange',
        'SignatureController:stateChange',
      ],
    });
  });

  it('exposes its actions through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = shieldController.getMessenger(rootMessenger);

    shieldController.init({
      state: undefined,
      messenger,
      options: {
        ...SHIELD_OPTIONS,
        backend: createMockBackend(),
      },
    });

    expect(rootMessenger.call('ShieldController:getState')).toStrictEqual(
      getDefaultShieldControllerState(),
    );
  });

  it('does not auto-start on initialization', () => {
    const rootMessenger = getRootMessenger();
    const messenger = shieldController.getMessenger(rootMessenger);
    const mockBackend = createMockBackend();

    shieldController.init({
      state: undefined,
      messenger,
      options: {
        ...SHIELD_OPTIONS,
        backend: mockBackend,
      },
    });

    const transactionMessenger = new Messenger({
      namespace: 'TransactionController',
      parent: rootMessenger as unknown as AnyMessenger,
    });

    transactionMessenger.publish(
      'TransactionController:stateChange',
      {
        transactions: [
          {
            id: 'tx-1',
            chainId: '0x1',
            status: TransactionStatus.Unapproved,
            time: Date.now(),
            txParams: {
              from: '0x0000000000000000000000000000000000000000',
            },
          },
        ],
      } as TransactionControllerState,
      undefined as never,
    );

    expect(mockBackend.checkCoverage).not.toHaveBeenCalled();
  });
});
