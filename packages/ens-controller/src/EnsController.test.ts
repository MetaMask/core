import * as providersModule from '@ethersproject/providers';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  NetworkType,
  NetworksTicker,
  toChecksumHexAddress,
  toHex,
} from '@metamask/controller-utils';

import { EnsController, DEFAULT_ENS_NETWORK_MAP } from './EnsController';
import type { EnsControllerState } from './EnsController';

const defaultState: EnsControllerState = {
  ensEntries: {},
  ensResolutionsByAddress: {},
};

for (const [cid, address] of Object.entries(DEFAULT_ENS_NETWORK_MAP)) {
  const chainId = toHex(cid);
  defaultState.ensEntries[chainId] = {
    '.': {
      ensName: '.',
      address,
      chainId,
    },
  };
}
Object.freeze(defaultState);

jest.mock('@ethersproject/providers', () => {
  const originalModule = jest.requireActual('@ethersproject/providers');

  return {
    __esModule: true,
    ...originalModule,
  };
});

const ZERO_X_ERROR_ADDRESS = '0x';

const address1 = '0x32Be343B94f860124dC4fEe278FDCBD38C102D88';
const address2 = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
const address3 = '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359';
const name1 = 'foobarb.eth';
const name2 = 'bazbarb.eth';

const address1Checksum = toChecksumHexAddress(address1);
const address2Checksum = toChecksumHexAddress(address2);
const address3Checksum = toChecksumHexAddress(address3);

const name = 'EnsController';

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getMessenger() {
  return new ControllerMessenger().getRestricted({
    name,
    allowedActions: [],
    allowedEvents: [],
  });
}

/**
 * Creates a mock provider.
 *
 * @returns mock provider
 */
function getProvider() {
  return () => Promise.resolve(null);
}

describe('EnsController', () => {
  it('should set default state', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.state).toStrictEqual(defaultState);
  });

  it('should return registry address for `.`', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.get('0x1', '.')).toStrictEqual({
      ensName: '.',
      address: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
      chainId: '0x1',
    });
  });

  it('should not return registry address for unrecognized chains', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.get('0x666', '.')).toBeNull();
  });

  it('should add a new ENS entry and return true', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.state.ensEntries['0x1'][name1]).toStrictEqual({
      address: address1Checksum,
      chainId: '0x1',
      ensName: name1,
    });
  });

  it('should clear ensResolutionsByAddress state propery when resetState is called', async () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
      state: {
        ensResolutionsByAddress: {
          [address1Checksum]: 'peaksignal.eth',
        },
      },
    });

    expect(controller.state.ensResolutionsByAddress[address1Checksum]).toBe(
      'peaksignal.eth',
    );

    controller.resetState();

    expect(controller.state.ensResolutionsByAddress).toStrictEqual({});
  });

  it('should clear ensResolutionsByAddress state propery on networkDidChange', async () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
      state: {
        ensResolutionsByAddress: {
          [address1Checksum]: 'peaksignal.eth',
        },
      },
      provider: getProvider(),
      onNetworkDidChange: (listener) => {
        listener({
          providerConfig: {
            chainId: '0x1',
            type: NetworkType.mainnet,
            ticker: NetworksTicker.mainnet,
          },
        });
      },
    });

    expect(controller.state.ensResolutionsByAddress).toStrictEqual({});
  });

  it('should add a new ENS entry with null address and return true', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, null)).toBe(true);
    expect(controller.state.ensEntries['0x1'][name1]).toStrictEqual({
      address: null,
      chainId: '0x1',
      ensName: name1,
    });
  });

  it('should update an ENS entry and return true', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.set('0x1', name1, address2)).toBe(true);
    expect(controller.state.ensEntries['0x1'][name1]).toStrictEqual({
      address: address2Checksum,
      chainId: '0x1',
      ensName: name1,
    });
  });

  it('should update an ENS entry with null address and return true', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.set('0x1', name1, null)).toBe(true);
    expect(controller.state.ensEntries['0x1'][name1]).toStrictEqual({
      address: null,
      chainId: '0x1',
      ensName: name1,
    });
  });

  it('should not update an ENS entry if the address is the same (valid address) and return false', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.set('0x1', name1, address1)).toBe(false);
    expect(controller.state.ensEntries['0x1'][name1]).toStrictEqual({
      address: address1Checksum,
      chainId: '0x1',
      ensName: name1,
    });
  });

  it('should not update an ENS entry if the address is the same (null) and return false', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, null)).toBe(true);
    expect(controller.set('0x1', name1, null)).toBe(false);
    expect(controller.state.ensEntries['0x1'][name1]).toStrictEqual({
      address: null,
      chainId: '0x1',
      ensName: name1,
    });
  });

  it('should add multiple ENS entries and update without side effects', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.set('0x1', name2, address2)).toBe(true);
    expect(controller.set(toHex(2), name1, address1)).toBe(true);
    expect(controller.set('0x1', name1, address3)).toBe(true);
    expect(controller.state.ensEntries['0x1'][name1]).toStrictEqual({
      address: address3Checksum,
      chainId: '0x1',
      ensName: name1,
    });
    expect(controller.state.ensEntries['0x1'][name2]).toStrictEqual({
      address: address2Checksum,
      chainId: '0x1',
      ensName: name2,
    });
    expect(controller.state.ensEntries['0x2'][name1]).toStrictEqual({
      address: address1Checksum,
      chainId: toHex(2),
      ensName: name1,
    });
  });

  it('should get ENS default registry by chainId when asking for `.`', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.get('0x1', name1)).toStrictEqual({
      address: address1Checksum,
      chainId: '0x1',
      ensName: name1,
    });
  });

  it('should get ENS entry by chainId and ensName', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.get('0x1', name1)).toStrictEqual({
      address: address1Checksum,
      chainId: '0x1',
      ensName: name1,
    });
  });

  it('should return null when getting nonexistent name', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.get('0x1', name2)).toBeNull();
  });

  it('should return null when getting nonexistent chainId', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.get(toHex(2), name1)).toBeNull();
  });

  it('should throw on attempt to set invalid ENS entry: chainId', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(() => {
      // @ts-expect-error Intentionally invalid chain ID
      controller.set('a', name1, address1);
    }).toThrow(
      'Invalid ENS entry: { chainId:a, ensName:foobarb.eth, address:0x32Be343B94f860124dC4fEe278FDCBD38C102D88}',
    );
    expect(controller.state).toStrictEqual(defaultState);
  });

  it('should throw on attempt to set invalid ENS entry: ENS name', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(() => {
      controller.set('0x1', 'foo.eth', address1);
    }).toThrow('Invalid ENS name: foo.eth');
    expect(controller.state).toStrictEqual(defaultState);
  });

  it('should throw on attempt to set invalid ENS entry: address', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(() => {
      controller.set('0x1', name1, 'foo');
    }).toThrow(
      'Invalid ENS entry: { chainId:0x1, ensName:foobarb.eth, address:foo}',
    );
    expect(controller.state).toStrictEqual(defaultState);
  });

  it('should remove an ENS entry and return true', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.delete('0x1', name1)).toBe(true);
    expect(controller.state).toStrictEqual(defaultState);
  });

  it('should remove chain entries completely when all entries are removed', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.delete('0x1', '.')).toBe(true);
    expect(controller.state.ensEntries['0x1'][name1].address).toBe(
      address1Checksum,
    );
    expect(controller.delete('0x1', name1)).toBe(true);
    expect(controller.state.ensEntries['0x1']).toBeUndefined();
  });

  it('should return false if an ENS entry was NOT deleted', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    controller.set('0x1', name1, address1);
    expect(controller.delete('0x1', 'bar')).toBe(false);
    expect(controller.delete(toHex(2), 'bar')).toBe(false);
    expect(controller.state.ensEntries['0x1'][name1]).toStrictEqual({
      address: address1Checksum,
      chainId: '0x1',
      ensName: name1,
    });
  });

  it('should add multiple ENS entries and remove without side effects', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.set('0x1', name2, address2)).toBe(true);
    expect(controller.set(toHex(2), name1, address1)).toBe(true);
    expect(controller.delete('0x1', name1)).toBe(true);
    expect(controller.state.ensEntries['0x1'][name2]).toStrictEqual({
      address: address2Checksum,
      chainId: '0x1',
      ensName: name2,
    });
    expect(controller.state.ensEntries['0x2'][name1]).toStrictEqual({
      address: address1Checksum,
      chainId: toHex(2),
      ensName: name1,
    });
  });

  it('should clear all ENS entries', () => {
    const messenger = getMessenger();
    const controller = new EnsController({
      messenger,
    });
    expect(controller.set('0x1', name1, address1)).toBe(true);
    expect(controller.set('0x1', name2, address2)).toBe(true);
    expect(controller.set(toHex(2), name1, address1)).toBe(true);
    controller.clear();
    expect(controller.state).toStrictEqual({
      ensEntries: {},
      ensResolutionsByAddress: {},
    });
  });

  describe('reverseResolveName', () => {
    it('should return undefined when eth provider is not defined', async () => {
      const messenger = getMessenger();
      const ens = new EnsController({
        messenger,
      });
      expect(await ens.reverseResolveAddress(address1)).toBeUndefined();
    });

    it('should return undefined when network is loading', async function () {
      const messenger = getMessenger();
      const ens = new EnsController({
        messenger,
        provider: getProvider(),
        onNetworkDidChange: (listener) => {
          listener({
            providerConfig: {
              chainId: '0x1',
              type: NetworkType.mainnet,
              ticker: NetworksTicker.mainnet,
            },
          });
        },
      });
      expect(await ens.reverseResolveAddress(address1)).toBeUndefined();
    });

    it('should return undefined when network is not ens supported', async function () {
      const messenger = getMessenger();
      const ens = new EnsController({
        messenger,
        provider: getProvider(),
        onNetworkDidChange: (listener) => {
          listener({
            providerConfig: {
              chainId: toHex(0),
              type: NetworkType.mainnet,
              ticker: NetworksTicker.mainnet,
            },
          });
        },
      });
      expect(await ens.reverseResolveAddress(address1)).toBeUndefined();
    });

    it('should only resolve an ENS name once', async () => {
      const messenger = getMessenger();
      const ethProvider = new providersModule.Web3Provider(getProvider());
      jest.spyOn(ethProvider, 'resolveName').mockResolvedValue(address1);
      jest
        .spyOn(ethProvider, 'lookupAddress')
        .mockResolvedValue('peaksignal.eth');
      jest.spyOn(providersModule, 'Web3Provider').mockReturnValue(ethProvider);

      const ens = new EnsController({
        messenger,
        provider: getProvider(),
        onNetworkDidChange: (listener) => {
          listener({
            providerConfig: {
              chainId: '0x1',
              type: NetworkType.mainnet,
              ticker: NetworksTicker.mainnet,
            },
          });
        },
      });

      expect(await ens.reverseResolveAddress(address1)).toBe('peaksignal.eth');
      expect(await ens.reverseResolveAddress(address1)).toBe('peaksignal.eth');
    });

    it('should fail if lookupAddress through an error', async () => {
      const messenger = getMessenger();
      const ethProvider = new providersModule.Web3Provider(getProvider());
      jest.spyOn(ethProvider, 'lookupAddress').mockRejectedValue('error');
      jest.spyOn(providersModule, 'Web3Provider').mockReturnValue(ethProvider);
      const ens = new EnsController({
        messenger,
        provider: getProvider(),
        onNetworkDidChange: (listener) => {
          listener({
            providerConfig: {
              chainId: '0x1',
              type: NetworkType.mainnet,
              ticker: NetworksTicker.mainnet,
            },
          });
        },
      });

      expect(await ens.reverseResolveAddress(address1)).toBeUndefined();
    });

    it('should fail if lookupAddress returns a null value', async () => {
      const messenger = getMessenger();
      const ethProvider = new providersModule.Web3Provider(getProvider());
      jest.spyOn(ethProvider, 'lookupAddress').mockResolvedValue(null);
      jest.spyOn(providersModule, 'Web3Provider').mockReturnValue(ethProvider);
      const ens = new EnsController({
        messenger,
        provider: getProvider(),
        onNetworkDidChange: (listener) => {
          listener({
            providerConfig: {
              chainId: '0x1',
              type: NetworkType.mainnet,
              ticker: NetworksTicker.mainnet,
            },
          });
        },
      });

      expect(await ens.reverseResolveAddress(address1)).toBeUndefined();
    });

    it('should fail if resolveName through an error', async () => {
      const messenger = getMessenger();
      const ethProvider = new providersModule.Web3Provider(getProvider());
      jest
        .spyOn(ethProvider, 'lookupAddress')
        .mockResolvedValue('peaksignal.eth');
      jest.spyOn(ethProvider, 'resolveName').mockRejectedValue('error');
      jest.spyOn(providersModule, 'Web3Provider').mockReturnValue(ethProvider);
      const ens = new EnsController({
        messenger,
        provider: getProvider(),
        onNetworkDidChange: (listener) => {
          listener({
            providerConfig: {
              chainId: '0x1',
              type: NetworkType.mainnet,
              ticker: NetworksTicker.mainnet,
            },
          });
        },
      });

      expect(await ens.reverseResolveAddress(address1)).toBeUndefined();
    });

    it('should fail if resolveName returns a null value', async () => {
      const messenger = getMessenger();
      const ethProvider = new providersModule.Web3Provider(getProvider());
      jest.spyOn(ethProvider, 'resolveName').mockResolvedValue(null);
      jest
        .spyOn(ethProvider, 'lookupAddress')
        .mockResolvedValue('peaksignal.eth');
      jest.spyOn(providersModule, 'Web3Provider').mockReturnValue(ethProvider);
      const ens = new EnsController({
        messenger,
        provider: getProvider(),
        onNetworkDidChange: (listener) => {
          listener({
            providerConfig: {
              chainId: '0x1',
              type: NetworkType.mainnet,
              ticker: NetworksTicker.mainnet,
            },
          });
        },
      });

      expect(await ens.reverseResolveAddress(address1)).toBeUndefined();
    });

    it('should fail if registred address is zero x error address', async () => {
      const messenger = getMessenger();
      const ethProvider = new providersModule.Web3Provider(getProvider());
      jest
        .spyOn(ethProvider, 'resolveName')
        .mockResolvedValue(ZERO_X_ERROR_ADDRESS);
      jest
        .spyOn(ethProvider, 'lookupAddress')
        .mockResolvedValue('peaksignal.eth');
      jest.spyOn(providersModule, 'Web3Provider').mockReturnValue(ethProvider);
      const ens = new EnsController({
        messenger,
        provider: getProvider(),
        onNetworkDidChange: (listener) => {
          listener({
            providerConfig: {
              chainId: '0x1',
              type: NetworkType.mainnet,
              ticker: NetworksTicker.mainnet,
            },
          });
        },
      });

      expect(await ens.reverseResolveAddress(address1)).toBeUndefined();
    });

    it('should fail if the name is registered to a different address than the reverse resolved', async () => {
      const messenger = getMessenger();

      const ethProvider = new providersModule.Web3Provider(getProvider());
      jest.spyOn(ethProvider, 'resolveName').mockResolvedValue(address2);
      jest
        .spyOn(ethProvider, 'lookupAddress')
        .mockResolvedValue('peaksignal.eth');
      jest.spyOn(providersModule, 'Web3Provider').mockReturnValue(ethProvider);
      const ens = new EnsController({
        messenger,
        provider: getProvider(),
        onNetworkDidChange: (listener) => {
          listener({
            providerConfig: {
              chainId: '0x1',
              type: NetworkType.mainnet,
              ticker: NetworksTicker.mainnet,
            },
          });
        },
      });

      expect(await ens.reverseResolveAddress(address1)).toBeUndefined();
    });
  });
});
