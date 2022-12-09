import type { PreferencesState } from '@metamask/preferences-controller';
import { buildFakeProvider } from '../tests/helpers';
import * as getCurrentNetworkIdModule from './get-current-network-id';
import { AddressBookController } from './AddressBookController';

type OnPreferencesStateChangeCallback = (
  preferencesState: PreferencesState,
  previousPreferencesState: PreferencesState,
) => Promise<void> | void;

describe('AddressBookController', () => {
  it('should set default state', () => {
    const controller = new AddressBookController();
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should add a contact entry', () => {
    const controller = new AddressBookController();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    expect(controller.state).toStrictEqual({
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
    });
  });

  it('should add a contact entry with chainId and memo', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      '1',
      'account 1',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: 'account 1',
            name: 'foo',
          },
        },
      },
    });
  });

  it('should add multiple contact entries with different chainIds', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      '1',
      'account 2',
    );

    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      '2',
      'account 2',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: 'account 2',
            name: 'foo',
          },
        },
        2: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '2',
            isEns: false,
            memo: 'account 2',
            name: 'foo',
          },
        },
      },
    });
  });

  it('should update a contact entry', () => {
    const controller = new AddressBookController();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'bar');
    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'bar',
          },
        },
      },
    });
  });

  it('should not add invalid contact entry', () => {
    const controller = new AddressBookController();
    controller.set('0x01', 'foo');
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should remove one contact entry', () => {
    const controller = new AddressBookController();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    controller.delete('1', '0x32Be343B94f860124dC4fEe278FDCBD38C102D88');

    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should remove only one contact entry', () => {
    const controller = new AddressBookController();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');
    controller.delete('1', '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d');

    expect(controller.state).toStrictEqual({
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
    });
  });

  it('should add two contact entries with the same chainId', () => {
    const controller = new AddressBookController();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'foo',
          },
          '0xC38bF1aD06ef69F0c04E29DBeB4152B4175f0A8D': {
            address: '0xC38bF1aD06ef69F0c04E29DBeB4152B4175f0A8D',
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'bar',
          },
        },
      },
    });
  });

  it('should correctly mark ens entries', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'metamask.eth',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: true,
            memo: '',
            name: 'metamask.eth',
          },
        },
      },
    });
  });

  it('should clear all contact entries', () => {
    const controller = new AddressBookController();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');
    controller.clear();
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should return true to indicate an address book entry has been added', () => {
    const controller = new AddressBookController();
    expect(
      controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo'),
    ).toStrictEqual(true);
  });

  it('should return false to indicate an address book entry has NOT been added', () => {
    const controller = new AddressBookController();
    expect(controller.set('0x00', 'foo')).toStrictEqual(false);
  });

  it('should return true to indicate an address book entry has been deleted', () => {
    const controller = new AddressBookController();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    expect(
      controller.delete('1', '0x32Be343B94f860124dC4fEe278FDCBD38C102D88'),
    ).toStrictEqual(true);
  });

  it('should return false to indicate an address book entry has NOT been deleted', () => {
    const controller = new AddressBookController();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', '0x00');
    expect(controller.delete('1', '0x01')).toStrictEqual(false);
  });

  it('should normalize addresses so adding and removing entries work across casings', () => {
    const controller = new AddressBookController();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');

    controller.delete('1', '0xC38BF1AD06EF69F0C04E29DBEB4152B4175F0A8D');
    expect(controller.state).toStrictEqual({
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
    });
  });

  describe('when syncWithRpcChanges is true', () => {
    it('should detect changes to RPC entry chain IDs and reassign all of the addresses associated with old chain IDs to new chain IDs', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      const controller = new AddressBookController(
        {
          syncWithRpcChanges: true,
          onPreferencesStateChange: (callback) => {
            callbacks.onPreferencesStateChangeCallback = callback;
          },
          getProvider: () => {
            return buildFakeProvider();
          },
        },
        {
          addressBook: {
            '100': {
              '0x100': {
                address: '0x100',
                chainId: '100',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: '100',
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
          },
        },
      );

      await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 200,
            },
          ],
        }),
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 100,
            },
          ],
        }),
      );

      expect(controller.state).toStrictEqual({
        addressBook: {
          '200': {
            '0x100': {
              address: '0x100',
              chainId: '200',
              isEns: false,
              memo: 'memo for account 1',
              name: 'foo',
            },
            '0x200': {
              address: '0x200',
              chainId: '200',
              isEns: true,
              memo: 'memo for account 2',
              name: 'bar',
            },
          },
        },
      });
    });

    it('should use the current network ID as the original chain ID if the changed RPC entry did not have a chain ID, then gained one', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      const controller = new AddressBookController(
        {
          syncWithRpcChanges: true,
          onPreferencesStateChange: (callback) => {
            callbacks.onPreferencesStateChangeCallback = callback;
          },
          getProvider: () => {
            return buildFakeProvider([
              {
                request: {
                  method: 'net_version',
                  params: [],
                },
                response: {
                  result: '100',
                },
              },
            ]);
          },
        },
        {
          addressBook: {
            '100': {
              '0x100': {
                address: '0x100',
                chainId: '100',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: '100',
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
          },
        },
      );

      await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 200,
            },
          ],
        }),
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
            },
          ],
        }),
      );

      expect(controller.state).toStrictEqual({
        addressBook: {
          '200': {
            '0x100': {
              address: '0x100',
              chainId: '200',
              isEns: false,
              memo: 'memo for account 1',
              name: 'foo',
            },
            '0x200': {
              address: '0x200',
              chainId: '200',
              isEns: true,
              memo: 'memo for account 2',
              name: 'bar',
            },
          },
        },
      });
    });

    it('should not migrate addresses for a changed RPC entry if did not have a chain ID, then gained one, but the current network ID cannot be determined', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      const controller = new AddressBookController(
        {
          syncWithRpcChanges: true,
          onPreferencesStateChange: (callback) => {
            callbacks.onPreferencesStateChangeCallback = callback;
          },
          getProvider: () => {
            return buildFakeProvider([
              {
                request: {
                  method: 'net_version',
                  params: [],
                },
                response: {
                  error: 'some error',
                },
              },
            ]);
          },
        },
        {
          addressBook: {
            '100': {
              '0x100': {
                address: '0x100',
                chainId: '100',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: '100',
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
          },
        },
      );

      await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 200,
            },
          ],
        }),
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
            },
          ],
        }),
      );

      expect(controller.state).toStrictEqual({
        addressBook: {
          '100': {
            '0x100': {
              address: '0x100',
              chainId: '100',
              isEns: false,
              memo: 'memo for account 1',
              name: 'foo',
            },
            '0x200': {
              address: '0x200',
              chainId: '100',
              isEns: true,
              memo: 'memo for account 2',
              name: 'bar',
            },
          },
        },
      });
    });

    it('should not remove addresses for an RPC entry if its chain ID was unset', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      const controller = new AddressBookController(
        {
          syncWithRpcChanges: true,
          onPreferencesStateChange: (callback) => {
            callbacks.onPreferencesStateChangeCallback = callback;
          },
        },
        {
          addressBook: {
            '100': {
              '0x100': {
                address: '0x100',
                chainId: '100',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
            },
          },
        },
      );

      await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
            },
          ],
        }),
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 100,
            },
          ],
        }),
      );

      expect(controller.state).toStrictEqual({
        addressBook: {
          '100': {
            '0x100': {
              address: '0x100',
              chainId: '100',
              isEns: false,
              memo: 'memo for account 1',
              name: 'foo',
            },
          },
        },
      });
    });

    it('should not remove addresses for a removed RPC entry', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      const controller = new AddressBookController(
        {
          syncWithRpcChanges: true,
          onPreferencesStateChange: (callback) => {
            callbacks.onPreferencesStateChangeCallback = callback;
          },
          getProvider: () => {
            return buildFakeProvider();
          },
        },
        {
          addressBook: {
            '100': {
              '0x100': {
                address: '0x100',
                chainId: '100',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: '100',
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
          },
        },
      );

      await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState({
          frequentRpcList: [],
        }),
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 100,
            },
          ],
        }),
      );

      expect(controller.state).toStrictEqual({
        addressBook: {
          '100': {
            '0x100': {
              address: '0x100',
              chainId: '100',
              isEns: false,
              memo: 'memo for account 1',
              name: 'foo',
            },
            '0x200': {
              address: '0x200',
              chainId: '100',
              isEns: true,
              memo: 'memo for account 2',
              name: 'bar',
            },
          },
        },
      });
    });

    it('should not reassign addresses for an RPC entry if anything but its chain ID was changed', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      const controller = new AddressBookController(
        {
          syncWithRpcChanges: true,
          onPreferencesStateChange: (callback) => {
            callbacks.onPreferencesStateChangeCallback = callback;
          },
          getProvider: () => {
            return buildFakeProvider();
          },
        },
        {
          addressBook: {
            '100': {
              '0x100': {
                address: '0x100',
                chainId: '100',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: '100',
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
          },
        },
      );

      await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 100,
              ticker: 'BAT',
            },
          ],
        }),
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 100,
              ticker: 'ETH',
            },
          ],
        }),
      );

      expect(controller.state).toStrictEqual({
        addressBook: {
          '100': {
            '0x100': {
              address: '0x100',
              chainId: '100',
              isEns: false,
              memo: 'memo for account 1',
              name: 'foo',
            },
            '0x200': {
              address: '0x200',
              chainId: '100',
              isEns: true,
              memo: 'memo for account 2',
              name: 'bar',
            },
          },
        },
      });
    });

    it('should not remove addresses for an RPC entry whose chain ID changed if other RPC entries existed at the time of change which used the same chain ID', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      const controller = new AddressBookController(
        {
          syncWithRpcChanges: true,
          onPreferencesStateChange: (callback) => {
            callbacks.onPreferencesStateChangeCallback = callback;
          },
          getProvider: () => {
            return buildFakeProvider();
          },
        },
        {
          addressBook: {
            '100': {
              '0x100': {
                address: '0x100',
                chainId: '100',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: '100',
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
          },
        },
      );

      await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 200,
            },
            {
              rpcUrl: 'http://bar.com',
              chainId: 100,
            },
          ],
        }),
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 100,
            },
            {
              rpcUrl: 'http://bar.com',
              chainId: 100,
            },
          ],
        }),
      );

      expect(controller.state).toStrictEqual({
        addressBook: {
          '100': {
            '0x100': {
              address: '0x100',
              chainId: '100',
              isEns: false,
              memo: 'memo for account 1',
              name: 'foo',
            },
            '0x200': {
              address: '0x200',
              chainId: '100',
              isEns: true,
              memo: 'memo for account 2',
              name: 'bar',
            },
          },
          '200': {
            '0x100': {
              address: '0x100',
              chainId: '200',
              isEns: false,
              memo: 'memo for account 1',
              name: 'foo',
            },
            '0x200': {
              address: '0x200',
              chainId: '200',
              isEns: true,
              memo: 'memo for account 2',
              name: 'bar',
            },
          },
        },
      });
    });

    [1, 5, 1337, 11155111].forEach((defaultChainId) => {
      it(`should not remove addresses for an RPC entry whose chain ID was changed from ${defaultChainId} if it referred to a default network`, async () => {
        const callbacks: {
          onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
        } = {};
        const controller = new AddressBookController(
          {
            syncWithRpcChanges: true,
            onPreferencesStateChange: (callback) => {
              callbacks.onPreferencesStateChangeCallback = callback;
            },
            getProvider: () => {
              return buildFakeProvider([
                {
                  request: {
                    method: 'net_version',
                    params: [],
                  },
                  response: {
                    result: defaultChainId.toString(),
                  },
                },
              ]);
            },
          },
          {
            addressBook: {
              [defaultChainId]: {
                '0x100': {
                  address: '0x100',
                  chainId: defaultChainId.toString(),
                  isEns: false,
                  memo: 'memo for account 1',
                  name: 'foo',
                },
                '0x200': {
                  address: '0x200',
                  chainId: defaultChainId.toString(),
                  isEns: true,
                  memo: 'memo for account 2',
                  name: 'bar',
                },
              },
            },
          },
        );

        await callbacks.onPreferencesStateChangeCallback?.(
          buildPreferencesState({
            frequentRpcList: [
              {
                rpcUrl: 'http://foo.com',
                chainId: 100,
              },
            ],
          }),
          buildPreferencesState({
            frequentRpcList: [
              {
                rpcUrl: 'http://foo.com',
                chainId: defaultChainId,
              },
            ],
          }),
        );

        expect(controller.state).toStrictEqual({
          addressBook: {
            [defaultChainId]: {
              '0x100': {
                address: '0x100',
                chainId: defaultChainId.toString(),
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: defaultChainId.toString(),
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
            '100': {
              '0x100': {
                address: '0x100',
                chainId: '100',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: '100',
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
          },
        });
      });

      it(`should not remove addresses for an RPC entry if it did not have a chain ID, then gained on, and the current chain ID is the default network ${defaultChainId}`, async () => {
        const callbacks: {
          onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
        } = {};
        const controller = new AddressBookController(
          {
            syncWithRpcChanges: true,
            onPreferencesStateChange: (callback) => {
              callbacks.onPreferencesStateChangeCallback = callback;
            },
            getProvider: () => {
              return buildFakeProvider([
                {
                  request: {
                    method: 'net_version',
                    params: [],
                  },
                  response: {
                    result: defaultChainId.toString(),
                  },
                },
              ]);
            },
          },
          {
            addressBook: {
              [defaultChainId]: {
                '0x100': {
                  address: '0x100',
                  chainId: defaultChainId.toString(),
                  isEns: false,
                  memo: 'memo for account 1',
                  name: 'foo',
                },
                '0x200': {
                  address: '0x200',
                  chainId: defaultChainId.toString(),
                  isEns: true,
                  memo: 'memo for account 2',
                  name: 'bar',
                },
              },
            },
          },
        );

        await callbacks.onPreferencesStateChangeCallback?.(
          buildPreferencesState({
            frequentRpcList: [
              {
                rpcUrl: 'http://foo.com',
                chainId: 100,
              },
            ],
          }),
          buildPreferencesState({
            frequentRpcList: [
              {
                rpcUrl: 'http://foo.com',
              },
            ],
          }),
        );

        expect(controller.state).toStrictEqual({
          addressBook: {
            [defaultChainId]: {
              '0x100': {
                address: '0x100',
                chainId: defaultChainId.toString(),
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: defaultChainId.toString(),
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
            '100': {
              '0x100': {
                address: '0x100',
                chainId: '100',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: '100',
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
          },
        });
      });
    });

    it('should log an error if the whole callback responding to preferences state changes fails in some way', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      new AddressBookController({
        syncWithRpcChanges: true,
        onPreferencesStateChange: (callback) => {
          callbacks.onPreferencesStateChangeCallback = callback;
        },
        getProvider: () => buildFakeProvider(),
      });
      jest.spyOn(console, 'error').mockReturnValue();
      jest
        .spyOn(getCurrentNetworkIdModule, 'getCurrentNetworkId')
        .mockRejectedValue('some error');

      await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState(),
        buildPreferencesState(),
      );

      expect(console.error).toHaveBeenCalled();
    });

    it('should not throw if there are no address book entries to migrate', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      new AddressBookController(
        {
          syncWithRpcChanges: true,
          onPreferencesStateChange: (callback) => {
            callbacks.onPreferencesStateChangeCallback = callback;
          },
          getProvider: () => buildFakeProvider(),
        },
        {
          addressBook: {},
        },
      );

      const result = await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 200,
            },
          ],
        }),
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 100,
            },
          ],
        }),
      );

      // Note: This really tests that the promise is resolved and not rejected
      expect(result).toBeUndefined();
    });

    it('should not overwrite existing address book entries that are already filed under a chain ID that an RPC entry was changed to', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      const controller = new AddressBookController(
        {
          syncWithRpcChanges: true,
          onPreferencesStateChange: (callback) => {
            callbacks.onPreferencesStateChangeCallback = callback;
          },
          getProvider: () => buildFakeProvider(),
        },
        {
          addressBook: {
            '100': {
              '0x100': {
                address: '0x100',
                chainId: '100',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
            },
            '200': {
              '0x200': {
                address: '0x200',
                chainId: '200',
                isEns: false,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
          },
        },
      );

      await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 200,
            },
          ],
        }),
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 100,
            },
          ],
        }),
      );

      expect(controller.state).toStrictEqual({
        addressBook: {
          '200': {
            '0x100': {
              address: '0x100',
              chainId: '200',
              isEns: false,
              memo: 'memo for account 1',
              name: 'foo',
            },
            '0x200': {
              address: '0x200',
              chainId: '200',
              isEns: false,
              memo: 'memo for account 2',
              name: 'bar',
            },
          },
        },
      });
    });
  });

  describe('when syncWithRpcChanges is false', () => {
    it('should not migrate any addresses even if the chain ID of an RPC entry has changed', async () => {
      const callbacks: {
        onPreferencesStateChangeCallback?: OnPreferencesStateChangeCallback;
      } = {};
      const controller = new AddressBookController(
        {
          syncWithRpcChanges: false,
          onPreferencesStateChange: (callback) => {
            callbacks.onPreferencesStateChangeCallback = callback;
          },
          getProvider: () => {
            return buildFakeProvider();
          },
        },
        {
          addressBook: {
            '1': {
              '0x100': {
                address: '0x100',
                chainId: '1',
                isEns: false,
                memo: 'memo for account 1',
                name: 'foo',
              },
              '0x200': {
                address: '0x200',
                chainId: '1',
                isEns: true,
                memo: 'memo for account 2',
                name: 'bar',
              },
            },
          },
        },
      );

      await callbacks.onPreferencesStateChangeCallback?.(
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 1337,
            },
          ],
        }),
        buildPreferencesState({
          frequentRpcList: [
            {
              rpcUrl: 'http://foo.com',
              chainId: 1,
            },
          ],
        }),
      );

      expect(controller.state).toStrictEqual({
        addressBook: {
          '1': {
            '0x100': {
              address: '0x100',
              chainId: '1',
              isEns: false,
              memo: 'memo for account 1',
              name: 'foo',
            },
            '0x200': {
              address: '0x200',
              chainId: '1',
              isEns: true,
              memo: 'memo for account 2',
              name: 'bar',
            },
          },
        },
      });
    });
  });
});

/**
 * Constructs a complete version of a PreferencesState object, providing a
 * minimum set of defaults for all properties but allowing for any of them to be
 * overridden for a single test.
 *
 * @param overrides - The overrides.
 * @returns A PreferencesState object.
 */
function buildPreferencesState(overrides: Partial<PreferencesState> = {}) {
  return {
    featureFlags: {},
    frequentRpcList: [],
    ipfsGateway: '',
    identities: {},
    lostIdentities: {},
    selectedAddress: '',
    useTokenDetection: false,
    useNftDetection: false,
    openSeaEnabled: false,
    ...overrides,
  };
}
