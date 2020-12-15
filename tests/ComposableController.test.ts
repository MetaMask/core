import { stub } from 'sinon';
import AddressBookController from '../src/user/AddressBookController';
import EnsController from '../src/third-party/EnsController';
import ComposableController from '../src/ComposableController';
import TokenRatesController from '../src/assets/TokenRatesController';
import { AssetsController } from '../src/assets/AssetsController';
import { NetworkController } from '../src/network/NetworkController';
import { AssetsContractController } from '../src/assets/AssetsContractController';

describe('ComposableController', () => {
  it('should compose controller state', () => {
    const controller = new ComposableController([
      new AddressBookController(),
      new AssetsController(),
      new AssetsContractController(),
      new EnsController(),
      new NetworkController(),
      new TokenRatesController(),
    ]);
    expect(controller.state).toEqual({
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
      EnsController: {
        ensEntries: {},
      },
      NetworkController: {
        network: 'loading',
        provider: { type: 'mainnet' },
      },
      TokenRatesController: { contractExchangeRates: {} },
    });
  });

  it('should compose flat controller state', () => {
    const controller = new ComposableController([
      new AddressBookController(),
      new AssetsController(),
      new AssetsContractController(),
      new EnsController(),
      new NetworkController(),
      new TokenRatesController(),
    ]);
    expect(controller.flatState).toEqual({
      addressBook: {},
      allCollectibleContracts: {},
      allCollectibles: {},
      allTokens: {},
      collectibleContracts: [],
      collectibles: [],
      contractExchangeRates: {},
      ensEntries: {},
      ignoredCollectibles: [],
      ignoredTokens: [],
      network: 'loading',
      provider: { type: 'mainnet' },
      suggestedAssets: [],
      tokens: [],
    });
  });

  it('should expose sibling context', () => {
    const controller = new ComposableController([
      new AddressBookController(),
      new AssetsController(),
      new AssetsContractController(),
      new EnsController(),
      new NetworkController(),
      new TokenRatesController(),
    ]);
    const addressContext = controller.context.TokenRatesController.context
      .AddressBookController as AddressBookController;
    expect(addressContext).toBeDefined();
    addressContext.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    expect(controller.flatState).toEqual({
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
      allCollectibleContracts: {},
      allCollectibles: {},
      allTokens: {},
      collectibleContracts: [],
      collectibles: [],
      contractExchangeRates: {},
      ensEntries: {},
      ignoredCollectibles: [],
      ignoredTokens: [],
      network: 'loading',
      provider: { type: 'mainnet' },
      suggestedAssets: [],
      tokens: [],
    });
  });

  it('should get and set new stores', () => {
    const controller = new ComposableController();
    const addressBook = new AddressBookController();
    controller.controllers = [addressBook];
    expect(controller.controllers).toEqual([addressBook]);
  });

  it('should set initial state', () => {
    const state = {
      AddressBookController: {
        addressBook: [
          {
            1: {
              address: 'bar',
              chainId: '1',
              isEns: false,
              memo: '',
              name: 'foo',
            },
          },
        ],
      },
    };
    const controller = new ComposableController([new AddressBookController()], state);
    expect(controller.state).toEqual(state);
  });

  it('should notify listeners of nested state change', () => {
    const addressBookController = new AddressBookController();
    const controller = new ComposableController([addressBookController]);
    const listener = stub();
    controller.subscribe(listener);
    addressBookController.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    expect(listener.calledOnce).toBe(true);
    expect(listener.getCall(0).args[0]).toEqual({
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
