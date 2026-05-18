import type { Json } from '@metamask/utils';

import type { InitializationConfiguration } from './initialization';

export type WalletOptions = {
  state?: Record<string, Record<string, Json>>;
  initializationConfigurations?: InitializationConfiguration<
    unknown,
    unknown
  >[];
};
