import type { Quote } from '@metamask/ramps-controller';

import type { ServerQuote } from '../server/types.js';

export type FiatQuote = {
  rampsQuote: Quote;
  relayQuote?: ServerQuote;
};
