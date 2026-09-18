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

const MOCK_COVERAGE_ID = 'coverage-id-1';

type ActionHandler = (...args: unknown[]) => unknown;

type AnyMessenger = Messenger<string>;

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

function registerShieldApiServiceMocks(
  rootMessenger: RootMessenger<DefaultActions, DefaultEvents>,
): {
  checkCoverage: jest.Mock;
  checkSignatureCoverage: jest.Mock;
  logSignature: jest.Mock;
  logTransaction: jest.Mock;
} {
  const handlers = {
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
    logSignature: jest.fn().mockResolvedValue(undefined),
    logTransaction: jest.fn().mockResolvedValue(undefined),
  };

  registerActionHandler(
    rootMessenger,
    'ShieldApiService',
    'ShieldApiService:checkCoverage',
    handlers.checkCoverage,
  );
  registerActionHandler(
    rootMessenger,
    'ShieldApiService',
    'ShieldApiService:checkSignatureCoverage',
    handlers.checkSignatureCoverage,
  );
  registerActionHandler(
    rootMessenger,
    'ShieldApiService',
    'ShieldApiService:logSignature',
    handlers.logSignature,
  );
  registerActionHandler(
    rootMessenger,
    'ShieldApiService',
    'ShieldApiService:logTransaction',
    handlers.logTransaction,
  );

  return handlers;
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
    const rootMessenger = getRootMessenger();
    registerShieldApiServiceMocks(rootMessenger);
    const messenger = shieldController.getMessenger(rootMessenger);

    const instance = shieldController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(ShieldController);
    expect(instance.state).toStrictEqual(getDefaultShieldControllerState());
  });

  it('forwards the provided state to the controller', () => {
    const rootMessenger = getRootMessenger();
    registerShieldApiServiceMocks(rootMessenger);
    const messenger = shieldController.getMessenger(rootMessenger);

    const instance = shieldController.init({
      state: {
        orderedTransactionHistory: ['tx-1'],
      },
      messenger,
      options: {},
    });

    expect(instance.state.orderedTransactionHistory).toStrictEqual(['tx-1']);
  });

  it('forwards transactionHistoryLimit and coverageHistoryLimit', () => {
    const rootMessenger = getRootMessenger();
    registerShieldApiServiceMocks(rootMessenger);
    const messenger = shieldController.getMessenger(rootMessenger);

    const instance = shieldController.init({
      state: undefined,
      messenger,
      options: {
        transactionHistoryLimit: 5,
        coverageHistoryLimit: 2,
      },
    });

    expect(instance).toBeInstanceOf(ShieldController);
  });

  it('forwards normalizeSignatureRequest to the controller', async () => {
    const rootMessenger = getRootMessenger();
    const shieldApiService = registerShieldApiServiceMocks(rootMessenger);
    const messenger = shieldController.getMessenger(rootMessenger);
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
        normalizeSignatureRequest,
      },
    });

    await instance.checkSignatureCoverage(signatureRequest);

    expect(normalizeSignatureRequest).toHaveBeenCalledWith(signatureRequest);
    expect(shieldApiService.checkSignatureCoverage).toHaveBeenCalledWith({
      signatureRequest: normalizedSignatureRequest,
    });
  });

  it('delegates ShieldApiService actions and controller state-change events', () => {
    const parent = getRootMessenger();
    const delegateSpy = jest.spyOn(parent, 'delegate');
    const messenger = shieldController.getMessenger(parent);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger,
      actions: [
        'ShieldApiService:checkCoverage',
        'ShieldApiService:checkSignatureCoverage',
        'ShieldApiService:logSignature',
        'ShieldApiService:logTransaction',
      ],
      events: [
        'TransactionController:stateChange',
        'SignatureController:stateChange',
      ],
    });
  });

  it('exposes its actions through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    registerShieldApiServiceMocks(rootMessenger);
    const messenger = shieldController.getMessenger(rootMessenger);

    shieldController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(rootMessenger.call('ShieldController:getState')).toStrictEqual(
      getDefaultShieldControllerState(),
    );
  });

  it('does not auto-start on initialization', () => {
    const rootMessenger = getRootMessenger();
    const shieldApiService = registerShieldApiServiceMocks(rootMessenger);
    const messenger = shieldController.getMessenger(rootMessenger);

    shieldController.init({
      state: undefined,
      messenger,
      options: {},
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

    expect(shieldApiService.checkCoverage).not.toHaveBeenCalled();
  });
});
