import { SolScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { describe, expect, it, vi } from 'vitest';

import { getMockBridgeQuotesSolErc20V2 } from '../../tests/mock-quotes-sol-erc20.js';
import type { BridgeControllerMessenger } from '../types.js';
import { appendFeesToQuotes } from './quote-fees.js';

const snapAccount = {
  id: 'sol-account-1',
  metadata: { snap: { id: 'sol-snap-id' } },
} as InternalAccount;

describe('appendFeesToQuotes', () => {
  it('uses feeData.network instead of calling the snap when the quote has server fees', async () => {
    const [quote] = getMockBridgeQuotesSolErc20V2();
    const quoteWithNetworkFee = {
      ...quote,
      quote: {
        ...quote.quote,
        feeData: {
          ...quote.quote.feeData,
          network: [{ amount: '5000', asset: quote.quote.src.asset }],
        },
      },
    };
    const messenger = { call: vi.fn() } as unknown as BridgeControllerMessenger;

    const result = await appendFeesToQuotes(
      SolScope.Mainnet,
      [quoteWithNetworkFee],
      messenger,
      vi.fn(),
      snapAccount,
    );

    expect(messenger.call).not.toHaveBeenCalled();
    expect(result).toStrictEqual([
      { ...quoteWithNetworkFee, nonEvmFeesInNative: '0.000005' },
    ]);
  });
});
