import type { Eip1193Provider } from 'ethers';

import type { MockVariable } from '../__fixtures__/test-utils';
import type { AnnounceProviderEvent } from './eip-6963-metamask-provider';
import {
  getMetaMaskProviderEIP6963,
  metamaskClientsRdns,
} from './eip-6963-metamask-provider';

describe('getMetaMaskProviderEIP6963() tests', () => {
  let unsubscribe: undefined | (() => void);
  afterEach(() => {
    unsubscribe?.();
    unsubscribe = undefined;
  });

  /**
   * Mock Utility to create and emit EIP event
   * @param rdns - mock rdns for provider
   * @returns an unsubscribe event listener
   */
  function emitEip6963Event(rdns: string = metamaskClientsRdns.main) {
    const mockProvider: Eip1193Provider = {
      request: jest.fn(),
    };

    const announceEvent: AnnounceProviderEvent = new CustomEvent(
      'eip6963:announceProvider',
      {
        detail: {
          info: { rdns },
          provider: mockProvider,
        },
      },
    );

    const eventListener = () => window.dispatchEvent(announceEvent);
    window.addEventListener('eip6963:requestProvider', eventListener);

    // Unsubscribe logic - if already defined in a previous set, make sure it is cleared
    // To ensure other tests are not impacted
    if (unsubscribe !== undefined) {
      unsubscribe();
      unsubscribe = undefined;
    }
    unsubscribe = () =>
      window.removeEventListener('eip6963:requestProvider', eventListener);

    return unsubscribe;
  }

  it('using non existent metamask wallet will return no provider', async () => {
    const res = await getMetaMaskProviderEIP6963('fakeWallet' as MockVariable);
    expect(res).toBeNull();
  });

  it('returns null if no provider event was found', async () => {
    emitEip6963Event('non metamask rdns');

    const res = await getMetaMaskProviderEIP6963();
    expect(res).toBeNull();
  });

  it('returns null if no specific metamask provider found', async () => {
    emitEip6963Event(metamaskClientsRdns.main);

    const res = await getMetaMaskProviderEIP6963('flask');
    expect(res).toBeNull(); // want flask wallet, but only main wallet found
  });

  it('returns provider & cached provider', async () => {
    const removeListener = emitEip6963Event(metamaskClientsRdns.main);

    const res1 = await getMetaMaskProviderEIP6963('main');
    expect(res1).not.toBeNull();

    // Should pull from cache
    removeListener();
    const res2 = await getMetaMaskProviderEIP6963('main');
    expect(res2).not.toBeNull();
  });
});
