import { ControllerMessenger } from '@metamask/base-controller';
import { NetworkType } from '@metamask/controller-utils';
import {
  defaultState as defaultNetworkState,
  NetworkStatus,
} from '@metamask/network-controller';

import { MetamaskWallet, type WalletActions, type WalletEvents } from '.';
import { SubjectType } from '../../permission-controller/src/SubjectMetadataController';

describe('Wallet', () => {
  describe('constructor', () => {
    it('initializes with default state', () => {
      const controllerMessenger = new ControllerMessenger<
        WalletActions,
        WalletEvents
      >();
      new MetamaskWallet({ controllerMessenger });

      // This snapshot is too large for inline
      // eslint-disable-next-line jest/no-restricted-matchers
      expect(controllerMessenger.call('Wallet:getState')).toMatchSnapshot();
    });

    it('initializes with persistent state', () => {
      const controllerMessenger = new ControllerMessenger<
        WalletActions,
        WalletEvents
      >();
      new MetamaskWallet({
        controllerMessenger,
        state: {
          networkController: {
            ...defaultNetworkState,
            // This state is persisted
            selectedNetworkClientId: NetworkType.sepolia,
          },
        },
      });

      // This snapshot is too large for inline
      // eslint-disable-next-line jest/no-restricted-matchers
      expect(controllerMessenger.call('Wallet:getState')).toMatchSnapshot();
    });

    it('initializes with persistent and transient state', () => {
      const controllerMessenger = new ControllerMessenger<
        WalletActions,
        WalletEvents
      >();
      new MetamaskWallet({
        controllerMessenger,
        state: {
          // The ApprovalController state is transient
          approvalController: {
            approvalFlows: [],
            pendingApprovalCount: 1,
            pendingApprovals: {
              '123': {
                id: '123',
                origin: 'metamask.test',
                time: 1,
                type: 'Example',
                requestData: {},
                requestState: null,
                expectsResult: false,
              },
            },
          },
          networkController: {
            ...defaultNetworkState,
            // This state is persisted
            selectedNetworkClientId: NetworkType.sepolia,
          },
        },
      });

      // This snapshot is too large for inline
      // eslint-disable-next-line jest/no-restricted-matchers
      expect(controllerMessenger.call('Wallet:getState')).toMatchSnapshot();
    });
  });

  describe('initialize', () => {
    it('initializes network status', async () => {
      const controllerMessenger = new ControllerMessenger<
        WalletActions,
        WalletEvents
      >();
      const wallet = new MetamaskWallet({ controllerMessenger });

      await wallet.initialize();

      expect(
        controllerMessenger.call('Wallet:getState').networkController
          .networksMetadata[NetworkType.mainnet].status,
      ).toBe(NetworkStatus.Available);
    });
  });

  describe('resetState', () => {
    it('clears transient state', () => {
      const controllerMessenger = new ControllerMessenger<
        WalletActions,
        WalletEvents
      >();
      const wallet = new MetamaskWallet({
        controllerMessenger,
        state: {
          // The ApprovalController state is transient
          approvalController: {
            approvalFlows: [],
            pendingApprovalCount: 1,
            pendingApprovals: {
              '123': {
                id: '123',
                origin: 'metamask.test',
                time: 1,
                type: 'Example',
                requestData: {},
                requestState: null,
                expectsResult: false,
              },
            },
          },
        },
      });

      wallet.resetState();

      // This snapshot is too large for inline
      // eslint-disable-next-line jest/no-restricted-matchers
      expect(
        controllerMessenger.call('Wallet:getState').approvalController
          .pendingApprovalCount,
      ).toBe(0);
    });

    it('does not clear persistent state', () => {
      const controllerMessenger = new ControllerMessenger<
        WalletActions,
        WalletEvents
      >();
      const wallet = new MetamaskWallet({
        controllerMessenger,
        state: {
          networkController: {
            ...defaultNetworkState,
            // This state is persisted
            selectedNetworkClientId: NetworkType.sepolia,
          },
        },
      });

      wallet.resetState();

      // This snapshot is too large for inline
      // eslint-disable-next-line jest/no-restricted-matchers
      expect(
        controllerMessenger.call('Wallet:getState').networkController
          .selectedNetworkClientId,
      ).toBe(NetworkType.sepolia);
    });
  });

  describe('createProviderEngine', () => {
    it('creates working provider engine', async () => {
      const controllerMessenger = new ControllerMessenger<
        WalletActions,
        WalletEvents
      >();
      const wallet = new MetamaskWallet({
        controllerMessenger,
        state: {},
      });
      await wallet.initialize();

      const providerEngine = wallet.createProviderEngine({
        origin: 'metamask',
        subjectType: SubjectType.Internal,
      });

      const accounts = await providerEngine.handle({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_accounts',
      });
      expect(accounts).toBe(['0x1']);
    });
  });
});
