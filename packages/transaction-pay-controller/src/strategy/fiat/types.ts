import type { Quote } from '@metamask/ramps-controller';

import type { RelayQuote } from '../relay/types.js';
import type { ServerQuote } from '../server/types.js';

export type FiatQuote = {
  rampsQuote: Quote;
  relayQuote?: RelayQuote;
  serverQuote?: ServerQuote;
};
