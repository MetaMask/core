import { stub } from 'sinon';
import type { Patch } from 'immer';
import { TokensController } from './assets/TokensController';
import { CollectiblesController } from './assets/CollectiblesController';
import { AddressBookController } from './user/AddressBookController';
import { EnsController } from './third-party/EnsController';
import { ComposableController } from './ComposableController';
import { BaseController, BaseState } from './BaseController';
import { BaseController as BaseControllerV2 } from './BaseControllerV2';
import {
  ControllerMessenger,
  RestrictedControllerMessenger,
} from './ControllerMessenger';
import { PreferencesController } from './user/PreferencesController';
import {
  NetworkController,
  NetworksChainId,
} from './network/NetworkController';
import { AssetsContractController } from './assets/AssetsContractController';

// Mock BaseControllerV2 classes

type FooControllerState = {
  foo: string;
};
type FooControllerEvent = {
  type: `FooController:stateChange`;
  payload: [FooControllerState, Patch[]];
};

type FooMessenger = RestrictedControllerMessenger<
  'FooController',
  never,
  FooControllerEvent,
  string,
  never
>;

const fooControllerStateMetadata = {
  foo: {
    persist: true,
    anonymous: true,
  },
};

class FooController extends BaseControllerV2<
  'FooController',
  FooControllerState,
  FooMessenger
> {
  constructor(messagingSystem: FooMessenger) {
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
      const collectiblesController = new CollectiblesController({
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
        getOwnerOf: assetContractController.getOwnerOf.bind(
          assetContractController,
        ),
        balanceOfERC1155Collectible: assetContractController.balanceOfERC1155Collectible.bind(
          assetContractController,
        ),
      });
      const tokensController = new TokensController({
        onPreferencesStateChange: (listener) =>
          preferencesController.subscribe(listener),
        onNetworkStateChange: (listener) =>
          networkController.subscribe(listener),
      });
      const controller = new ComposableController([
        new AddressBookController(),
        collectiblesController,
        assetContractController,
        new EnsController(),
        networkController,
        preferencesController,
        tokensController,
      ]);
      expect(controller.state).toStrictEqual({
        AddressBookController: { addressBook: {} },
        AssetsContractController: {},
        CollectiblesController: {
          allCollectibleContracts: {},
          allCollectibles: {},
          collectibleContracts: [],
          collectibles: [],
          ignoredCollectibles: [],
        },
        TokensController: {
          allTokens: {},
          ignoredTokens: [],
          allIgnoredTokens: {},
          suggestedAssets: [],
          tokens: [],
        },
        EnsController: {
          ensEntries: {},
        },
        NetworkController: {
          network: 'loading',
          isCustomNetwork: false,
          properties: { isEIP1559Compatible: false },
          provider: { type: 'mainnet', chainId: NetworksChainId.mainnet },
        },
        PreferencesController: {
          featureFlags: {},
          frequentRpcList: [],
          identities: {},
          ipfsGateway: 'https://ipfs.io/ipfs/',
          lostIdentities: {},
          selectedAddress: '',
          useStaticTokenList: false,
        },
      });
    });

    it('should compose flat controller state', () => {
      const preferencesController = new PreferencesController();
      const networkController = new NetworkController();
      const assetContractController = new AssetsContractController();
      const collectiblesController = new CollectiblesController({
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
        getOwnerOf: assetContractController.getOwnerOf.bind(
          assetContractController,
        ),
        balanceOfERC1155Collectible: assetContractController.balanceOfERC1155Collectible.bind(
          assetContractController,
        ),
      });
      const tokensController = new TokensController({
        onPreferencesStateChange: (listener) =>
          preferencesController.subscribe(listener),
        onNetworkStateChange: (listener) =>
          networkController.subscribe(listener),
      });
      const controller = new ComposableController([
        new AddressBookController(),
        collectiblesController,
        assetContractController,
        new EnsController(),
        networkController,
        preferencesController,
        tokensController,
      ]);
      expect(controller.flatState).toStrictEqual({
        addressBook: {},
        allCollectibleContracts: {},
        allCollectibles: {},
        allTokens: {},
        collectibleContracts: [],
        collectibles: [],
        ensEntries: {},
        featureFlags: {},
        frequentRpcList: [],
        identities: {},
        ignoredCollectibles: [],
        ignoredTokens: [],
        allIgnoredTokens: {},
        ipfsGateway: 'https://ipfs.io/ipfs/',
        lostIdentities: {},
        network: 'loading',
        isCustomNetwork: false,
        properties: { isEIP1559Compatible: false },
        provider: { type: 'mainnet', chainId: NetworksChainId.mainnet },
        selectedAddress: '',
        useStaticTokenList: false,
        suggestedAssets: [],
        tokens: [],
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
