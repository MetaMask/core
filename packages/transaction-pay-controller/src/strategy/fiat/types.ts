import type { Quote } from '@metamask/ramps-controller';

import type { RelayQuote } from '../relay/types';

export type FiatQuote = {
  rampsQuote: Quote;
  relayQuote: RelayQuote;
};
