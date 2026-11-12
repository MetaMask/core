import { MarketStatsService } from '@metamask/core-backend';
import { Messenger } from '@metamask/messenger';
import { describe, expect, it } from 'vitest';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { marketStatsService } from './market-stats-service.js';

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('marketStatsService', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(marketStatsService);
  });

  it('initializes a MarketStatsService', () => {
    const messenger = marketStatsService.getMessenger(getRootMessenger());

    const instance = marketStatsService.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(MarketStatsService);
  });
});
