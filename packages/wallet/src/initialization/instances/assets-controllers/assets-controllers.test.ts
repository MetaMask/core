import {
  AccountTrackerController,
  AssetsContractController,
  CodefiTokenPricesServiceV2,
  CurrencyRateController,
  DeFiPositionsController,
  MultichainAssetsController,
  MultichainAssetsRatesController,
  MultichainBalancesController,
  NftController,
  NftDetectionController,
  RatesController,
  TokenBalancesController,
  TokenDetectionController,
  TokenListController,
  TokenListService,
  TokenRatesController,
  TokensController,
  TokenSearchDiscoveryDataController,
} from '@metamask/assets-controllers';
import { ConfigRegistryApiEnv } from '@metamask/config-registry-controller';
import { Messenger } from '@metamask/messenger';
import { InMemoryStorageAdapter } from '@metamask/storage-service';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WalletOptions } from '../../../types.js';
import { Wallet } from '../../../Wallet.js';
import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { AlwaysOnlineAdapter } from '../connectivity-controller/always-online-adapter.js';
import { accountTrackerController } from './account-tracker-controller.js';
import { assetsContractController } from './assets-contract-controller.js';
import { currencyRateController } from './currency-rate-controller.js';
import { deFiPositionsController } from './defi-positions-controller.js';
import { multichainAssetsController } from './multichain-assets-controller.js';
import { multichainAssetsRatesController } from './multichain-assets-rates-controller.js';
import { multichainBalancesController } from './multichain-balances-controller.js';
import { nftController } from './nft-controller.js';
import { nftDetectionController } from './nft-detection-controller.js';
import { ratesController } from './rates-controller.js';
import { tokenBalancesController } from './token-balances-controller.js';
import { tokenDetectionController } from './token-detection-controller.js';
import { tokenListController } from './token-list-controller.js';
import { tokenRatesController } from './token-rates-controller.js';
import { tokenSearchDiscoveryDataController } from './token-search-discovery-data-controller.js';
import { tokensController } from './tokens-controller.js';

const { constructorOptions, recordConstructorOptions } = vi.hoisted(() => {
  type AnyConstructor = new (options: Record<string, unknown>) => object;

  const options = new Map<string, Record<string, unknown>>();

  return {
    constructorOptions: options,
    recordConstructorOptions: (base: unknown): AnyConstructor => {
      const Base = base as AnyConstructor;
      return class extends Base {
        constructor(controllerOptions: Record<string, unknown>) {
          options.set(Base.name, controllerOptions);
          super(controllerOptions);
        }
      };
    },
  };
});

// Wraps each controller in a subclass that records the options it is
// constructed with, so the options built by `init` can be inspected.
vi.mock(import('@metamask/assets-controllers'), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    AccountTrackerController: recordConstructorOptions(
      actual.AccountTrackerController,
    ) as unknown as typeof actual.AccountTrackerController,
    AssetsContractController: recordConstructorOptions(
      actual.AssetsContractController,
    ) as unknown as typeof actual.AssetsContractController,
    CurrencyRateController: recordConstructorOptions(
      actual.CurrencyRateController,
    ) as unknown as typeof actual.CurrencyRateController,
    DeFiPositionsController: recordConstructorOptions(
      actual.DeFiPositionsController,
    ) as unknown as typeof actual.DeFiPositionsController,
    MultichainAssetsController: recordConstructorOptions(
      actual.MultichainAssetsController,
    ) as unknown as typeof actual.MultichainAssetsController,
    MultichainAssetsRatesController: recordConstructorOptions(
      actual.MultichainAssetsRatesController,
    ) as unknown as typeof actual.MultichainAssetsRatesController,
    MultichainBalancesController: recordConstructorOptions(
      actual.MultichainBalancesController,
    ) as unknown as typeof actual.MultichainBalancesController,
    NftController: recordConstructorOptions(
      actual.NftController,
    ) as unknown as typeof actual.NftController,
    NftDetectionController: recordConstructorOptions(
      actual.NftDetectionController,
    ) as unknown as typeof actual.NftDetectionController,
    RatesController: recordConstructorOptions(
      actual.RatesController,
    ) as unknown as typeof actual.RatesController,
    TokenBalancesController: recordConstructorOptions(
      actual.TokenBalancesController,
    ) as unknown as typeof actual.TokenBalancesController,
    TokenDetectionController: recordConstructorOptions(
      actual.TokenDetectionController,
    ) as unknown as typeof actual.TokenDetectionController,
    TokenListController: recordConstructorOptions(
      actual.TokenListController,
    ) as unknown as typeof actual.TokenListController,
    TokenRatesController: recordConstructorOptions(
      actual.TokenRatesController,
    ) as unknown as typeof actual.TokenRatesController,
    TokensController: recordConstructorOptions(
      actual.TokensController,
    ) as unknown as typeof actual.TokensController,
    TokenSearchDiscoveryDataController: recordConstructorOptions(
      actual.TokenSearchDiscoveryDataController,
    ) as unknown as typeof actual.TokenSearchDiscoveryDataController,
  };
});

type ActionHandler = (...args: unknown[]) => unknown;

type AnyMessenger = Messenger<string>;

type LooseInstance = {
  state?: unknown;
  destroy?: () => void;
};

/**
 * The shape shared by every configuration under test, without the
 * controller-specific types, so the configurations can be driven from one
 * table.
 */
type LooseConfiguration = {
  name: string;
  init(args: {
    state: unknown;
    messenger: unknown;
    options: Record<string, unknown>;
  }): LooseInstance;
  getMessenger(parent: RootMessenger<DefaultActions, DefaultEvents>): unknown;
};

type ConfigurationTestCase = {
  configuration: LooseConfiguration;
  reference: abstract new (...args: never[]) => unknown;
  actions: string[];
  events: string[];
  forwardsState: boolean;
  options: Record<string, unknown>;
};

const tokenPricesService = new CodefiTokenPricesServiceV2();
const tokenListService = new TokenListService();

const TEST_CASES: ConfigurationTestCase[] = [
  {
    configuration: accountTrackerController as unknown as LooseConfiguration,
    reference: AccountTrackerController,
    actions: [
      'AccountsController:getSelectedAccount',
      'AccountsController:listAccounts',
      'AssetsContractController:getStakedBalanceForChain',
      'KeyringController:getState',
      'NetworkController:getNetworkClientById',
      'NetworkController:getState',
      'NetworkEnablementController:getState',
      'NetworkEnablementController:listPopularEvmNetworks',
      'PreferencesController:getState',
    ],
    events: [
      'AccountsController:selectedEvmAccountChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'NetworkController:networkAdded',
      'TransactionController:transactionConfirmed',
      'TransactionController:unapprovedTransactionAdded',
    ],
    forwardsState: true,
    options: { interval: 5_000, includeStakedAssets: true },
  },
  {
    configuration: assetsContractController as unknown as LooseConfiguration,
    reference: AssetsContractController,
    actions: [
      'NetworkController:getNetworkClientById',
      'NetworkController:getNetworkConfigurationByNetworkClientId',
      'NetworkController:getSelectedNetworkClient',
      'NetworkController:getState',
    ],
    events: [
      'NetworkController:networkDidChange',
      'PreferencesController:stateChange',
    ],
    forwardsState: false,
    options: { chainId: '0x5' },
  },
  {
    configuration: currencyRateController,
    reference: CurrencyRateController,
    actions: [
      'NetworkController:getNetworkClientById',
      'NetworkController:getState',
    ],
    events: [],
    forwardsState: true,
    options: { interval: 5_000, tokenPricesService },
  },
  {
    configuration: deFiPositionsController as unknown as LooseConfiguration,
    reference: DeFiPositionsController,
    actions: ['AccountTreeController:getAccountsFromSelectedAccountGroup'],
    events: [
      'AccountTreeController:selectedAccountGroupChange',
      'KeyringController:lock',
      'TransactionController:transactionConfirmed',
    ],
    forwardsState: false,
    options: { trackEvent: vi.fn() },
  },
  {
    configuration: multichainAssetsController as unknown as LooseConfiguration,
    reference: MultichainAssetsController,
    actions: [
      'AccountsController:listMultichainAccounts',
      'PermissionController:getPermissions',
      'PhishingController:bulkScanTokens',
      'SnapController:getRunnableSnaps',
      'SnapController:handleRequest',
    ],
    events: [
      'AccountsController:accountAdded',
      'AccountsController:accountAssetListUpdated',
      'AccountsController:accountRemoved',
    ],
    forwardsState: true,
    options: { blockaidTokenRescanInterval: 0 },
  },
  {
    configuration:
      multichainAssetsRatesController as unknown as LooseConfiguration,
    reference: MultichainAssetsRatesController,
    actions: [
      'AccountsController:getSelectedMultichainAccount',
      'AccountsController:listMultichainAccounts',
      'CurrencyRateController:getState',
      'MultichainAssetsController:getState',
      'SnapController:handleRequest',
    ],
    events: [
      'AccountsController:accountAdded',
      'CurrencyRateController:stateChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'MultichainAssetsController:accountAssetListUpdated',
    ],
    forwardsState: true,
    options: { interval: 5_000 },
  },
  {
    configuration:
      multichainBalancesController as unknown as LooseConfiguration,
    reference: MultichainBalancesController,
    actions: [
      'AccountsController:listMultichainAccounts',
      'KeyringController:getState',
      'MultichainAssetsController:getState',
      'SnapController:handleRequest',
    ],
    events: [
      'AccountsController:accountAdded',
      'AccountsController:accountBalancesUpdated',
      'AccountsController:accountRemoved',
      'MultichainAssetsController:accountAssetListUpdated',
    ],
    forwardsState: true,
    options: { isDeprecated: (): boolean => false },
  },
  {
    configuration: nftController as unknown as LooseConfiguration,
    reference: NftController,
    actions: [
      'AccountsController:getAccount',
      'AccountsController:getSelectedAccount',
      'ApprovalController:addRequest',
      'AssetsContractController:getERC1155TokenURI',
      'AssetsContractController:getERC721AssetName',
      'AssetsContractController:getERC721AssetSymbol',
      'AssetsContractController:getERC721TokenURI',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getNetworkClientById',
      'PhishingController:bulkScanUrls',
    ],
    events: [
      'AccountsController:selectedEvmAccountChange',
      'PreferencesController:stateChange',
    ],
    forwardsState: true,
    options: { displayNftMedia: true },
  },
  {
    configuration: nftDetectionController as unknown as LooseConfiguration,
    reference: NftDetectionController,
    actions: [
      'AccountsController:getSelectedAccount',
      'ApprovalController:addRequest',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getNetworkClientById',
      'NetworkController:getState',
      'NftController:addNfts',
      'NftController:getState',
      'NftController:removeNft',
      'PreferencesController:getState',
    ],
    events: [
      'NetworkController:stateChange',
      'PreferencesController:stateChange',
    ],
    forwardsState: false,
    options: { disabled: true },
  },
  {
    configuration: ratesController as unknown as LooseConfiguration,
    reference: RatesController,
    actions: [],
    events: [],
    forwardsState: true,
    options: { includeUsdRate: true },
  },
  {
    configuration: tokenBalancesController,
    reference: TokenBalancesController,
    actions: [
      'AccountTrackerController:getState',
      'AccountTrackerController:updateNativeBalances',
      'AccountTrackerController:updateStakedBalances',
      'AccountsController:getSelectedAccount',
      'AccountsController:listAccounts',
      'AuthenticationController:getBearerToken',
      'KeyringController:getState',
      'NetworkController:getNetworkClientById',
      'NetworkController:getState',
      'PreferencesController:getState',
      'TokenDetectionController:addDetectedTokensViaPolling',
      'TokenDetectionController:addDetectedTokensViaWs',
      'TokenDetectionController:detectTokens',
      'TokensController:getState',
    ],
    events: [
      'AccountActivityService:balanceUpdated',
      'AccountActivityService:statusChanged',
      'AccountsController:selectedEvmAccountChange',
      'KeyringController:accountRemoved',
      'KeyringController:lock',
      'KeyringController:unlock',
      'NetworkController:stateChange',
      'PreferencesController:stateChange',
      'TokensController:stateChange',
      'TransactionController:transactionConfirmed',
    ],
    forwardsState: true,
    options: { platform: 'mobile' },
  },
  {
    configuration: tokenDetectionController as unknown as LooseConfiguration,
    reference: TokenDetectionController,
    actions: [
      'AccountsController:getAccount',
      'AccountsController:getSelectedAccount',
      'AssetsContractController:getBalancesInSingleCall',
      'AuthenticationController:getBearerToken',
      'KeyringController:getState',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getNetworkClientById',
      'NetworkController:getNetworkConfigurationByNetworkClientId',
      'NetworkController:getState',
      'PreferencesController:getState',
      'TokensController:addDetectedTokens',
      'TokensController:addTokens',
      'TokensController:getState',
    ],
    events: [
      'AccountsController:selectedEvmAccountChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'NetworkController:networkDidChange',
      'PreferencesController:stateChange',
      'TransactionController:transactionConfirmed',
    ],
    forwardsState: false,
    options: { tokenListService, trackMetaMetricsEvent: vi.fn() },
  },
  {
    configuration: tokenListController,
    reference: TokenListController,
    actions: [
      'NetworkController:getNetworkClientById',
      'StorageService:getAllKeys',
      'StorageService:getItem',
      'StorageService:setItem',
    ],
    events: ['NetworkController:stateChange'],
    forwardsState: true,
    options: { chainId: '0x5' },
  },
  {
    configuration: tokenRatesController as unknown as LooseConfiguration,
    reference: TokenRatesController,
    actions: [
      'NetworkController:getState',
      'NetworkEnablementController:getState',
      'TokensController:getState',
    ],
    events: [
      'NetworkController:stateChange',
      'NetworkEnablementController:stateChange',
      'TokensController:stateChange',
    ],
    forwardsState: true,
    options: { interval: 5_000, tokenPricesService },
  },
  {
    configuration: tokensController as unknown as LooseConfiguration,
    reference: TokensController,
    actions: [
      'AccountsController:getAccount',
      'AccountsController:getSelectedAccount',
      'AccountsController:listAccounts',
      'ApprovalController:addRequest',
      'NetworkController:getNetworkClientById',
      'NetworkController:getSelectedNetworkClient',
    ],
    events: [
      'AccountsController:selectedEvmAccountChange',
      'KeyringController:accountRemoved',
      'NetworkController:networkDidChange',
      'NetworkController:stateChange',
    ],
    forwardsState: true,
    options: { tokenListService },
  },
  {
    configuration:
      tokenSearchDiscoveryDataController as unknown as LooseConfiguration,
    reference: TokenSearchDiscoveryDataController,
    actions: ['CurrencyRateController:getState'],
    events: [],
    forwardsState: true,
    options: { tokenPricesService },
  },
];

const wallets: Wallet[] = [];
const instances: LooseInstance[] = [];

describe('assets-controllers configurations', () => {
  afterEach(async () => {
    for (const instance of instances.splice(0)) {
      instance.destroy?.();
    }
    await Promise.all(
      wallets.splice(0).map(async (wallet) => wallet.destroy()),
    );
    constructorOptions.clear();
  });

  describe.each(TEST_CASES)(
    '$configuration.name configuration',
    ({ configuration, reference, actions, events, forwardsState, options }) => {
      it('is registered as a default initialization configuration', () => {
        expect(Object.values(defaultConfigurations)).toContain(configuration);
      });

      it('constructs without calling controllers that are not registered', () => {
        const instance = initConfiguration(configuration, getRootMessenger());

        expect(instance).toBeInstanceOf(reference);
      });

      it('forwards the provided options to the controller', () => {
        initConfiguration(configuration, getRootMessenger(), { options });

        expect(constructorOptions.get(configuration.name)).toStrictEqual(
          expect.objectContaining(options),
        );
      });

      const state = { persisted: true };
      const expectedState = forwardsState ? state : undefined;
      const stateBehavior = forwardsState ? 'forwards' : 'does not forward';

      it(`${stateBehavior} the provided state`, () => {
        initConfiguration(configuration, getRootMessenger(), { state });

        expect(constructorOptions.get(configuration.name)?.state).toBe(
          expectedState,
        );
      });

      it.each(actions)('delegates the %s action', (actionType) => {
        const rootMessenger = getRootMessenger();
        const handler = vi.fn().mockReturnValue('result');
        registerActionHandler(rootMessenger, actionType, handler);
        const messenger = configuration.getMessenger(rootMessenger);

        const result = (messenger as { call(type: string): unknown }).call(
          actionType,
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(result).toBe('result');
      });

      it.each(events)('delegates the %s event', (eventType) => {
        const rootMessenger = getRootMessenger();
        const messenger = configuration.getMessenger(rootMessenger);
        const listener = vi.fn();
        (
          messenger as {
            subscribe(type: string, handler: ActionHandler): void;
          }
        ).subscribe(eventType, listener);

        publishEvent(rootMessenger, eventType, 'payload');

        expect(listener).toHaveBeenCalledWith('payload');
      });
    },
  );

  describe('assets-controllers configuration defaults', () => {
    it.each([
      currencyRateController,
      tokenRatesController,
      tokenSearchDiscoveryDataController,
    ] as unknown as LooseConfiguration[])(
      'defaults $name tokenPricesService to a CodefiTokenPricesServiceV2',
      (configuration) => {
        initConfiguration(configuration, getRootMessenger());

        expect(
          constructorOptions.get(configuration.name)?.tokenPricesService,
        ).toBeInstanceOf(CodefiTokenPricesServiceV2);
      },
    );

    it.each([
      tokensController,
      tokenDetectionController,
    ] as unknown as LooseConfiguration[])(
      'defaults $name tokenListService to a TokenListService',
      (configuration) => {
        initConfiguration(configuration, getRootMessenger());

        expect(
          constructorOptions.get(configuration.name)?.tokenListService,
        ).toBeInstanceOf(TokenListService);
      },
    );

    it.each([
      assetsContractController,
      tokenListController,
    ] as unknown as LooseConfiguration[])(
      'defaults $name chainId to Ethereum mainnet',
      (configuration) => {
        initConfiguration(configuration, getRootMessenger());

        expect(constructorOptions.get(configuration.name)?.chainId).toBe('0x1');
      },
    );

    it('defaults RatesController includeUsdRate to false', () => {
      initConfiguration(
        ratesController as unknown as LooseConfiguration,
        getRootMessenger(),
      );

      expect(constructorOptions.get('RatesController')?.includeUsdRate).toBe(
        false,
      );
    });

    it('defaults NftDetectionController disabled to false', () => {
      initConfiguration(
        nftDetectionController as unknown as LooseConfiguration,
        getRootMessenger(),
      );

      expect(constructorOptions.get('NftDetectionController')?.disabled).toBe(
        false,
      );
    });

    it('defaults TokenDetectionController trackMetaMetricsEvent to a no-op', () => {
      initConfiguration(
        tokenDetectionController as unknown as LooseConfiguration,
        getRootMessenger(),
      );

      const { trackMetaMetricsEvent } = constructorOptions.get(
        'TokenDetectionController',
      ) as { trackMetaMetricsEvent: (event: unknown) => unknown };

      expect(
        trackMetaMetricsEvent({ event: 'Token Detected' }),
      ).toBeUndefined();
    });
  });

  describe('assets-controllers messenger-backed callbacks', () => {
    it('builds AccountTrackerController getStakedBalanceForChain from AssetsContractController', async () => {
      const rootMessenger = getRootMessenger();
      const handler = vi.fn().mockResolvedValue({ '0x1': '0x0' });
      registerActionHandler(
        rootMessenger,
        'AssetsContractController:getStakedBalanceForChain',
        handler,
      );
      initConfiguration(
        accountTrackerController as unknown as LooseConfiguration,
        rootMessenger,
      );

      const { getStakedBalanceForChain } = constructorOptions.get(
        'AccountTrackerController',
      ) as { getStakedBalanceForChain: ActionHandler };

      expect(await getStakedBalanceForChain(['0x1'], 'mainnet')).toStrictEqual({
        '0x1': '0x0',
      });
      expect(handler).toHaveBeenCalledWith(['0x1'], 'mainnet');
    });

    it('builds TokenDetectionController getBalancesInSingleCall from AssetsContractController', async () => {
      const rootMessenger = getRootMessenger();
      const handler = vi.fn().mockResolvedValue({ '0x2': '0x1' });
      registerActionHandler(
        rootMessenger,
        'AssetsContractController:getBalancesInSingleCall',
        handler,
      );
      initConfiguration(
        tokenDetectionController as unknown as LooseConfiguration,
        rootMessenger,
      );

      const { getBalancesInSingleCall } = constructorOptions.get(
        'TokenDetectionController',
      ) as { getBalancesInSingleCall: ActionHandler };

      expect(
        await getBalancesInSingleCall('0x1', ['0x2'], 'mainnet'),
      ).toStrictEqual({ '0x2': '0x1' });
      expect(handler).toHaveBeenCalledWith('0x1', ['0x2'], 'mainnet');
    });

    it('builds the NftDetectionController callbacks from NftController', async () => {
      const rootMessenger = getRootMessenger();
      const addNfts = vi.fn().mockResolvedValue(undefined);
      const removeNft = vi.fn();
      const nftState = { allNfts: {} };
      const getState = vi.fn().mockReturnValue(nftState);
      registerActionHandler(rootMessenger, 'NftController:addNfts', addNfts);
      registerActionHandler(
        rootMessenger,
        'NftController:removeNft',
        removeNft,
      );
      registerActionHandler(rootMessenger, 'NftController:getState', getState);
      initConfiguration(
        nftDetectionController as unknown as LooseConfiguration,
        rootMessenger,
      );

      const callbacks = constructorOptions.get('NftDetectionController') as {
        addNfts: ActionHandler;
        removeNft: ActionHandler;
        getNftState: ActionHandler;
      };
      await callbacks.addNfts([], '0x1', 'mainnet');
      callbacks.removeNft('0x3', '1', 'mainnet');

      expect(callbacks.getNftState()).toBe(nftState);
      expect(addNfts).toHaveBeenCalledWith([], '0x1', 'mainnet');
      expect(removeNft).toHaveBeenCalledWith('0x3', '1', 'mainnet');
    });
  });

  describe('assets-controllers in the default Wallet', () => {
    it('constructs every controller without PreferencesController, SnapController or AccountTreeController', () => {
      const wallet = createWallet();

      for (const { configuration, reference } of TEST_CASES) {
        expect(
          wallet.getInstance(configuration.name as 'TokensController'),
        ).toBeInstanceOf(reference);
      }
    });

    it('runs the controllers init from wallet.init(), which fulfills without the client-registered controllers', async () => {
      const references = [
        AccountTrackerController,
        MultichainAssetsController,
        MultichainAssetsRatesController,
        MultichainBalancesController,
        NftController,
        TokenBalancesController,
        TokenDetectionController,
        TokenListController,
        TokenRatesController,
        TokensController,
      ];
      const spies = references.map((reference) =>
        vi.spyOn(reference.prototype, 'init'),
      );
      const wallet = createWallet();

      await wallet.init();

      for (const spy of spies) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
      const results = await Promise.allSettled(
        spies.map(async (spy): Promise<unknown> => spy.mock.results[0]?.value),
      );
      expect(results.map(({ status }) => status)).toStrictEqual(
        references.map(() => 'fulfilled'),
      );
    });

    it('destroys the controllers when the wallet is destroyed', async () => {
      const spies = TEST_CASES.map(({ reference }) => reference)
        .filter((reference) => 'destroy' in reference.prototype)
        .map((reference) =>
          vi.spyOn(reference.prototype as { destroy: () => void }, 'destroy'),
        );
      const wallet = createWallet();

      await wallet.destroy();

      expect(spies).toHaveLength(15);
      for (const spy of spies) {
        expect(spy).toHaveBeenCalled();
      }
    });
  });
});

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

/**
 * Builds a configuration's messenger on `rootMessenger` and initializes its
 * controller.
 *
 * @param configuration - The configuration to initialize.
 * @param rootMessenger - The root messenger.
 * @param args - The state and options to pass to `init`.
 * @param args.state - The state.
 * @param args.options - The instance options.
 * @returns The controller.
 */
function initConfiguration(
  configuration: LooseConfiguration,
  rootMessenger: RootMessenger<DefaultActions, DefaultEvents>,
  {
    state,
    options = {},
  }: { state?: unknown; options?: Record<string, unknown> } = {},
): LooseInstance {
  const instance = configuration.init({
    state,
    messenger: configuration.getMessenger(rootMessenger),
    options,
  });
  instances.push(instance);
  return instance;
}

/**
 * Creates a `Wallet` with the default configurations.
 *
 * @returns The wallet.
 */
function createWallet(): Wallet {
  const wallet = new Wallet({ instanceOptions: getInstanceOptions() });
  wallets.push(wallet);
  return wallet;
}

/**
 * Builds the instance options that the default Wallet requires.
 *
 * @returns The instance options.
 */
function getInstanceOptions(): WalletOptions['instanceOptions'] {
  return {
    analyticsController: {
      platformAdapter: {
        track: vi.fn(),
        identify: vi.fn(),
        view: vi.fn(),
        onSetupCompleted: vi.fn(),
      },
      analyticsId: '11111111-1111-4111-8111-111111111111',
    },
    configRegistryApiService: {
      env: ConfigRegistryApiEnv.DEV,
    },
    connectivityController: {
      connectivityAdapter: new AlwaysOnlineAdapter(),
    },
    gasFeeController: {
      clientId: 'test',
    },
    networkController: {
      infuraProjectId: 'test-infura-project-id',
    },
    remoteFeatureFlagController: {
      clientConfigApiService: {
        fetchRemoteFeatureFlags: async (): Promise<{
          remoteFeatureFlags: Record<string, boolean>;
          cacheTimestamp: number;
        }> => ({ remoteFeatureFlags: {}, cacheTimestamp: Date.now() }),
      },
    },
    selectedNetworkController: {
      domainProxyMap: new Map(),
    },
    storageService: {
      storage: new InMemoryStorageAdapter(),
    },
  };
}

/**
 * Registers an action handler on `parent` under the action's namespace.
 *
 * @param parent - The root messenger.
 * @param actionType - The action to register.
 * @param handler - The handler.
 */
function registerActionHandler(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  actionType: string,
  handler: ActionHandler,
): void {
  const messenger = new Messenger({
    namespace: actionType.split(':')[0],
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      registerActionHandler(type: string, handler: ActionHandler): void;
    }
  ).registerActionHandler(actionType, handler);
}

/**
 * Publishes an event on `parent` under the event's namespace.
 *
 * @param parent - The root messenger.
 * @param eventType - The event to publish.
 * @param payload - The event payload.
 */
function publishEvent(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  eventType: string,
  ...payload: unknown[]
): void {
  const messenger = new Messenger({
    namespace: eventType.split(':')[0],
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      publish(type: string, ...payload: unknown[]): void;
    }
  ).publish(eventType, ...payload);
}
