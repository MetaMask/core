import { describe, expect, it } from 'vitest';

import {
  buildChannel,
  LAUNCHPAD_SUBSCRIPTION_NAMESPACE,
  normalizeEvent,
  parseBatch,
} from './normalize.js';
import type { RawLaunchpadTokenEvent } from './types.js';

const ASSET_ID = 'eip155:8453/erc20:0xaaa';

describe('launchpad normalize', () => {
  describe('buildChannel', () => {
    it('builds the per-asset channel on the launchpad namespace', () => {
      expect(buildChannel(ASSET_ID)).toBe(
        `${LAUNCHPAD_SUBSCRIPTION_NAMESPACE}.${ASSET_ID}`,
      );
      expect(buildChannel(ASSET_ID)).toBe(
        'launchpad-tokens.v1.eip155:8453/erc20:0xaaa',
      );
    });
  });

  describe('normalizeEvent', () => {
    it('normalizes a created event with identity + launchpad metadata', () => {
      const raw: RawLaunchpadTokenEvent = {
        evt: 'created',
        ts: 1,
        a: ASSET_ID,
        c: 'eip155:8453',
        n: 'AlphaDog',
        s: 'ADOG',
        lp: 'pump',
        lpp: 'pumpfun',
        d: 18,
        da: '0xdev',
        pa: '0xpair',
        gp: '0.5',
        gs: 'bonding',
      };

      expect(normalizeEvent(raw)).toStrictEqual({
        eventType: 'created',
        timestamp: 1,
        assetId: ASSET_ID,
        chainId: 'eip155:8453',
        name: 'AlphaDog',
        symbol: 'ADOG',
        launchpadId: 'pump',
        launchpadProtocol: 'pumpfun',
        decimals: 18,
        devAddress: '0xdev',
        pairAddress: '0xpair',
        graduationPercent: '0.5',
        graduationStage: 'bonding',
      });
    });

    it('normalizes a stats event with market + activity metrics', () => {
      const raw: RawLaunchpadTokenEvent = {
        evt: 'stats',
        ts: 2,
        a: ASSET_ID,
        gp: '12.4',
        gs: 'bonding',
        mc: '21000',
        p: '0.0000021',
        l: '5000',
        h: 42,
        v: '1234',
        txs: 10,
        bc: 7,
        sc: 3,
        snc: '1',
        snhp: '2.5',
        dhp: '1.1',
        ihp: '11.23',
        t10hp: '30.5',
        cs: '1000000000',
      };

      expect(normalizeEvent(raw)).toStrictEqual({
        eventType: 'stats',
        timestamp: 2,
        assetId: ASSET_ID,
        graduationPercent: '12.4',
        graduationStage: 'bonding',
        marketCap: '21000',
        price: '0.0000021',
        liquidity: '5000',
        holderCount: 42,
        volume1h: '1234',
        txCount: 10,
        buyCount: 7,
        sellCount: 3,
        sniperCount: '1',
        sniperHoldingPercent: '2.5',
        deployerHoldingPercent: '1.1',
        insiderHoldingPercent: '11.23',
        top10HoldingPercent: '30.5',
        circulatingSupply: '1000000000',
      });
    });

    it('normalizes a stats event that carries no name/symbol (partial)', () => {
      const raw: RawLaunchpadTokenEvent = {
        evt: 'stats',
        ts: 3,
        a: ASSET_ID,
        p: '0.0000055',
        mc: '55000',
      };

      const normalized = normalizeEvent(raw);
      expect(normalized).toMatchObject({
        eventType: 'stats',
        assetId: ASSET_ID,
        price: '0.0000055',
        marketCap: '55000',
      });
      expect(normalized).not.toHaveProperty('name');
      expect(normalized).not.toHaveProperty('symbol');
    });

    it('normalizes a migrated event with DEX migration details', () => {
      const raw: RawLaunchpadTokenEvent = {
        evt: 'migrated',
        ts: 4,
        a: ASSET_ID,
        c: 'eip155:8453',
        d: 18,
        da: '0xdev',
        pa: '0xdexpool',
        gs: 'migrated',
      };

      expect(normalizeEvent(raw)).toStrictEqual({
        eventType: 'migrated',
        timestamp: 4,
        assetId: ASSET_ID,
        chainId: 'eip155:8453',
        decimals: 18,
        devAddress: '0xdev',
        pairAddress: '0xdexpool',
        graduationStage: 'migrated',
      });
    });

    it('returns null for an unknown event type', () => {
      const raw = {
        evt: 'unknown',
        ts: 5,
        a: ASSET_ID,
      } as unknown as RawLaunchpadTokenEvent;

      expect(normalizeEvent(raw)).toBeNull();
    });
  });

  describe('parseBatch', () => {
    it('returns an empty array for non-array input', () => {
      expect(parseBatch(undefined)).toStrictEqual([]);
      expect(parseBatch(null)).toStrictEqual([]);
      expect(parseBatch({ evt: 'created', ts: 1, a: ASSET_ID })).toStrictEqual(
        [],
      );
    });

    it('normalizes every valid event in arrival order', () => {
      const batch = [
        { evt: 'created', ts: 1, a: ASSET_ID, n: 'AlphaDog', s: 'ADOG' },
        { evt: 'stats', ts: 2, a: ASSET_ID, mc: '21000' },
        { evt: 'migrated', ts: 3, a: ASSET_ID, pa: '0xpool' },
      ];

      const events = parseBatch(batch);
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.eventType)).toStrictEqual([
        'created',
        'stats',
        'migrated',
      ]);
    });

    it('skips malformed or partial-but-invalid entries', () => {
      const batch = [
        { evt: 'created', ts: 1, a: ASSET_ID },
        null,
        42,
        { evt: 'unknown', ts: 2, a: ASSET_ID },
        { evt: 'stats', a: ASSET_ID },
        { evt: 'stats', ts: 3 },
        { evt: 'stats', ts: 4, a: ASSET_ID },
      ];

      const events = parseBatch(batch);
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.timestamp)).toStrictEqual([1, 4]);
    });
  });
});
