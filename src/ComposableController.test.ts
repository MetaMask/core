import { stub } from 'sinon';
import type { Patch } from 'immer';
import AddressBookController from './user/AddressBookController';
import EnsController from './third-party/EnsController';
import ComposableController from './ComposableController';
import { BaseController, BaseState } from './BaseController';
import { BaseController as BaseControllerV2 } from './BaseControllerV2';
import {
  ControllerMessenger,
  RestrictedControllerMessenger,
} from './ControllerMessenger';
import PreferencesController from './user/PreferencesController';
import TokenRatesController from './assets/TokenRatesController';
import { AssetsController } from './assets/AssetsController';
import {
  NetworkController,
  NetworksChainId,
} from './network/NetworkController';
import { AssetsContractController } from './assets/AssetsContractController';
import CurrencyRateController from './assets/CurrencyRateController';

// Mock BaseControllerV2 classes

type FooControllerState = {
  foo: string;
};
type FooControllerEvent = {
  type: `FooController:stateChange`;
  payload: [FooControllerState, Patch[]];
};

const fooControllerStateMetadata = {
  foo: {
    persist: true,
    anonymous: true,
  },
};

class FooController extends BaseControllerV2<
  'FooController',
  FooControllerState
> {
  constructor(
    messagingSystem: RestrictedControllerMessenger<
      'FooController',
      never,
      FooControllerEvent,
      string,
      never
    >,
  ) {
    super({
      messenger: messagingSystem,
      metadata: fooControllerStateMetadata,
      name: 'FooController',
      state: { foo: 'foo' },
    });
  }

  updateFoo(foo: string) {
    super.update((state) => {
      state.foo = foo;
    });
  }
}

// Mock BaseController classes

interface BarControllerState extends BaseState {
  bar: string;
}
class BarController extends BaseController<never, BarControllerState> {
  defaultState = {
    bar: 'bar',
  };

  name = 'BarController';

  constructor() {
    super();
    this.initialize();
  }

  updateBar(bar: string) {
    super.update({ bar });
  }
}

describe('ComposableController', () => {
  describe('BaseController', () => {
    it('should compose controller state', () => {
      const preferencesController = new PreferencesController();
      const networkController = new NetworkController();
      const assetContractController = new AssetsContractController();
      const assetController = new AssetsController({
        onPreferencesStateChange: (listener) =>
          preferencesController.subscribe(listener),
        onNetworkStateChange: (listener) =>
          networkController.subscribe(listener),
        getAssetName: assetContractController.getAssetName.bind(
          assetContractController,
        ),
        getAssetSymbol: assetContractController.getAssetSymbol.bind(
          assetContractController,
        ),
        getCollectibleTokenURI: assetContractController.getCollectibleTokenURI.bind(
          assetContractController,
        ),
      });
      const currencyRateController = new CurrencyRateController();
      const controller = new ComposableController([
        new AddressBookController(),
        assetController,
        assetContractController,
        new EnsController(),
        currencyRateController,
        networkController,
        preferencesController,
        new TokenRatesController({
          onAssetsStateChange: (listener) =>
            assetController.subscribe(listener),
          onCurrencyRateStateChange: (listener) =>
            currencyRateController.subscribe(listener),
        }),
      ]);
      expect(controller.state).toStrictEqual({
        AddressBookController: { addressBook: {} },
        AssetsContractController: {},
        AssetsController: {
          allCollectibleContracts: {},
          allCollectibles: {},
          allTokens: {},
          collectibleContracts: [],
          collectibles: [],
          ignoredCollectibles: [],
          ignoredTokens: [],
          suggestedAssets: [],
          tokens: [],
        },
        CurrencyRateController: {
          conversionDate: 0,
          conversionRate: 0,
          currentCurrency: 'usd',
          nativeCurrency: 'ETH',
          usdConversionRate: 0,
        },
        EnsController: {
          ensEntries: {},
        },
        NetworkController: {
          network: 'loading',
          provider: { type: 'mainnet', chainId: NetworksChainId.mainnet },
        },
        PreferencesController: {
          featureFlags: {},
          frequentRpcList: [],
          identities: {},
          ipfsGateway: 'https://ipfs.io/ipfs/',
          lostIdentities: {},
          selectedAddress: '',
        },
        TokenRatesController: { contractExchangeRates: {} },
      });
    });

    it('should compose flat controller state', () => {
      const preferencesController = new PreferencesController();
      const networkController = new NetworkController();
      const assetContractController = new AssetsContractController();
      const assetController = new AssetsController({
        onPreferencesStateChange: (listener) =>
          preferencesController.subscribe(listener),
        onNetworkStateChange: (listener) =>
          networkController.subscribe(listener),
        getAssetName: assetContractController.getAssetName.bind(
          assetContractController,
        ),
        getAssetSymbol: assetContractController.getAssetSymbol.bind(
          assetContractController,
        ),
        getCollectibleTokenURI: assetContractController.getCollectibleTokenURI.bind(
          assetContractController,
        ),
      });
      const currencyRateController = new CurrencyRateController();
      const controller = new ComposableController([
        new AddressBookController(),
        assetController,
        assetContractController,
        new EnsController(),
        currencyRateController,
        networkController,
        preferencesController,
        new TokenRatesController({
          onAssetsStateChange: (listener) =>
            assetController.subscribe(listener),
          onCurrencyRateStateChange: (listener) =>
            currencyRateController.subscribe(listener),
        }),
      ]);
      expect(controller.flatState).toStrictEqual({
        addressBook: {},
        allCollectibleContracts: {},
        allCollectibles: {},
        allTokens: {},
        collectibleContracts: [],
        collectibles: [],
        contractExchangeRates: {},
        conversionDate: 0,
        conversionRate: 0,
        currentCurrency: 'usd',
        ensEntries: {},
        featureFlags: {},
        frequentRpcList: [],
        identities: {},
        ignoredCollectibles: [],
        ignoredTokens: [],
        ipfsGateway: 'https://ipfs.io/ipfs/',
        lostIdentities: {},
        nativeCurrency: 'ETH',
        network: 'loading',
        provider: { type: 'mainnet', chainId: NetworksChainId.mainnet },
        selectedAddress: '',
        suggestedAssets: [],
        tokens: [],
        usdConversionRate: 0,
      });
    });

    it('should set initial state', () => {
      const state = {
        addressBook: {
          '0x1': {
            '0x1234': {
              address: 'bar',
              chainId: '1',
              isEns: false,
              memo: '',
              name: 'foo',
            },
          },
        },
      };
      const controller = new ComposableController([
        new AddressBookController(undefined, state),
      ]);
      expect(controller.state).toStrictEqual({ AddressBookController: state });
    });

    it('should notify listeners of nested state change', () => {
      const addressBookController = new AddressBookController();
      const controller = new ComposableController([addressBookController]);
      const listener = stub();
      controller.subscribe(listener);
      addressBookController.set(
        '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
        'foo',
      );
      expect(listener.calledOnce).toBe(true);
      expect(listener.getCall(0).args[0]).toStrictEqual({
        AddressBookController: {
          addressBook: {
            1: {
              '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
                address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
                chainId: '1',
                isEns: false,
                memo: '',
                name: 'foo',
              },
            },
          },
        },
      });
    });
  });

  describe('BaseControllerV2', () => {
    it('should compose controller state', () => {
      const controllerMessenger = new ControllerMessenger<
        never,
        FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted<
        'FooController',
        never,
        never
      >({
        name: 'FooController',
      });
      const fooController = new FooController(fooControllerMessenger);

      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        'FooController:stateChange'
      >({
        name: 'ComposableController',
        allowedEvents: ['FooController:stateChange'],
      });
      const composableController = new ComposableController(
        [fooController],
        composableControllerMessenger,
      );
      expect(composableController.state).toStrictEqual({
        FooController: { foo: 'foo' },
      });
    });

    it('should compose flat controller state', () => {
      const controllerMessenger = new ControllerMessenger<
        never,
        FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted<
        'FooController',
        never,
        never
      >({
        name: 'FooController',
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        'FooController:stateChange'
      >({
        name: 'ComposableController',
        allowedEvents: ['FooController:stateChange'],
      });
      const composableController = new ComposableController(
        [fooController],
        composableControllerMessenger,
      );
      expect(composableController.flatState).toStrictEqual({
        foo: 'foo',
      });
    });

    it('should notify listeners of nested state change', () => {
      const controllerMessenger = new ControllerMessenger<
        never,
        FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted<
        'FooController',
        never,
        never
      >({
        name: 'FooController',
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        'FooController:stateChange'
      >({
        name: 'ComposableController',
        allowedEvents: ['FooController:stateChange'],
      });
      const composableController = new ComposableController(
        [fooController],
        composableControllerMessenger,
      );

      const listener = stub();
      composableController.subscribe(listener);
      fooController.updateFoo('bar');

      expect(listener.calledOnce).toBe(true);
      expect(listener.getCall(0).args[0]).toStrictEqual({
        FooController: {
          foo: 'bar',
        },
      });
    });
  });

  describe('Mixed BaseController and BaseControllerV2', () => {
    it('should compose controller state', () => {
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted<
        'FooController',
        never,
        never
      >({
        name: 'FooController',
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        'FooController:stateChange'
      >({
        name: 'ComposableController',
        allowedEvents: ['FooController:stateChange'],
      });
      const composableController = new ComposableController(
        [barController, fooController],
        composableControllerMessenger,
      );
      expect(composableController.state).toStrictEqual({
        BarController: { bar: 'bar' },
        FooController: { foo: 'foo' },
      });
    });

    it('should compose flat controller state', () => {
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted<
        'FooController',
        never,
        never
      >({
        name: 'FooController',
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        'FooController:stateChange'
      >({
        name: 'ComposableController',
        allowedEvents: ['FooController:stateChange'],
      });
      const composableController = new ComposableController(
        [barController, fooController],
        composableControllerMessenger,
      );
      expect(composableController.flatState).toStrictEqual({
        bar: 'bar',
        foo: 'foo',
      });
    });

    it('should notify listeners of BaseController state change', () => {
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted<
        'FooController',
        never,
        never
      >({
        name: 'FooController',
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        'FooController:stateChange'
      >({
        name: 'ComposableController',
        allowedEvents: ['FooController:stateChange'],
      });
      const composableController = new ComposableController(
        [barController, fooController],
        composableControllerMessenger,
      );

      const listener = stub();
      composableController.subscribe(listener);
      barController.updateBar('foo');

      expect(listener.calledOnce).toBe(true);
      expect(listener.getCall(0).args[0]).toStrictEqual({
        BarController: {
          bar: 'foo',
        },
        FooController: {
          foo: 'foo',
        },
      });
    });

    it('should notify listeners of BaseControllerV2 state change', () => {
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted<
        'FooController',
        never,
        never
      >({
        name: 'FooController',
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        'FooController:stateChange'
      >({
        name: 'ComposableController',
        allowedEvents: ['FooController:stateChange'],
      });
      const composableController = new ComposableController(
        [barController, fooController],
        composableControllerMessenger,
      );

      const listener = stub();
      composableController.subscribe(listener);
      fooController.updateFoo('bar');

      expect(listener.calledOnce).toBe(true);
      expect(listener.getCall(0).args[0]).toStrictEqual({
        BarController: {
          bar: 'bar',
        },
        FooController: {
          foo: 'bar',
        },
      });
    });

    it('should throw if controller messenger not provided', () => {
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted<
        'FooController',
        never,
        never
      >({
        name: 'FooController',
      });
      const fooController = new FooController(fooControllerMessenger);
      expect(
        () => new ComposableController([barController, fooController]),
      ).toThrow(
        'Messaging system required if any BaseControllerV2 controllers are used',
      );
    });
  });
});
