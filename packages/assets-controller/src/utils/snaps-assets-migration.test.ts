import type { Json } from '@metamask/utils';

import type { ChainId } from '../types';
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SNAPS_ASSETS_MIGRATION_NAMESPACES,
  SnapsAssetsMigrationStage,
  getMigrationStages,
  getSnapsAssetsMigrationNamespace,
  isMigrationStageActive,
  isSnapsAssetsMigrationNamespace,
  parseSnapsAssetsMigrationStage,
  shouldSupportChain,
} from './snaps-assets-migration';

const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;
const STELLAR_CHAIN_ID = 'stellar:pubnet' as ChainId;
const TRON_CHAIN_ID = 'tron:728126428' as ChainId;

describe('snaps-assets-migration', () => {
  describe('SnapsAssetsMigrationStage', () => {
    it('orders stages so ingestion turns on at ReadAssetsControllerWithFallback', () => {
      expect(SnapsAssetsMigrationStage.Off).toBe(0);
      expect(SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback).toBe(
        1,
      );
      expect(
        SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
      ).toBe(2);
      expect(SnapsAssetsMigrationStage.ReadAssetsControllerOnly).toBe(3);
    });
  });

  describe('SNAPS_ASSETS_MIGRATION_FLAG_KEYS', () => {
    it('maps each migration namespace to its per-network flag key', () => {
      expect(SNAPS_ASSETS_MIGRATION_FLAG_KEYS).toStrictEqual({
        solana: 'networkAssetsSnapsMigrationSolana',
        stellar: 'networkAssetsSnapsMigrationStellar',
        tron: 'networkAssetsSnapsMigrationTron',
      });
    });
  });

  describe('SNAPS_ASSETS_MIGRATION_NAMESPACES', () => {
    it('covers Solana, Stellar and Tron', () => {
      expect([...SNAPS_ASSETS_MIGRATION_NAMESPACES]).toStrictEqual([
        'solana',
        'stellar',
        'tron',
      ]);
    });
  });

  describe('isMigrationStageActive', () => {
    it('is inactive when the stage is Off', () => {
      expect(isMigrationStageActive(SnapsAssetsMigrationStage.Off)).toBe(false);
    });

    it.each([
      SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
      SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
      SnapsAssetsMigrationStage.ReadAssetsControllerOnly,
    ])('is active from stage %d', (stage) => {
      expect(isMigrationStageActive(stage)).toBe(true);
    });
  });

  describe('isSnapsAssetsMigrationNamespace', () => {
    it.each([[SOLANA_CHAIN_ID], [STELLAR_CHAIN_ID], [TRON_CHAIN_ID]])(
      'returns true for migration network %s',
      (chainId) => {
        expect(isSnapsAssetsMigrationNamespace(chainId)).toBe(true);
      },
    );

    it.each([
      ['eip155:1'],
      ['eip155:42161'],
      ['bip122:000000000019d6689c085ae165831e93'],
    ])('returns false for non-migration network %s', (chainId) => {
      expect(isSnapsAssetsMigrationNamespace(chainId as ChainId)).toBe(false);
    });

    it('returns false for a malformed chain id', () => {
      expect(isSnapsAssetsMigrationNamespace('not-a-chain-id' as ChainId)).toBe(
        false,
      );
    });
  });

  describe('getSnapsAssetsMigrationNamespace', () => {
    it.each([
      [SOLANA_CHAIN_ID, 'solana'],
      [STELLAR_CHAIN_ID, 'stellar'],
      [TRON_CHAIN_ID, 'tron'],
    ] as const)('resolves %s to the %s namespace', (chainId, namespace) => {
      expect(getSnapsAssetsMigrationNamespace(chainId)).toBe(namespace);
    });

    it.each([
      ['eip155:1'],
      ['bip122:000000000019d6689c085ae165831e93'],
      ['not-a-chain-id'],
    ])('returns undefined for non-migration chain %s', (chainId) => {
      expect(
        getSnapsAssetsMigrationNamespace(chainId as ChainId),
      ).toBeUndefined();
    });
  });

  describe('parseSnapsAssetsMigrationStage', () => {
    it('reads the stage from a resolved flag value', () => {
      expect(
        parseSnapsAssetsMigrationStage({
          featureVersion: '1',
          minimumSnapVersion: '1.20.0',
          stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
        }),
      ).toBe(SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback);
    });

    it('reads the stage from a threshold-scoped `{ name, value }` variant', () => {
      expect(
        parseSnapsAssetsMigrationStage({
          name: 's1',
          value: {
            featureVersion: '1',
            minimumSnapVersion: '2.9.0',
            stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
          },
        }),
      ).toBe(SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback);
    });

    it.each([
      SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
      SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
      SnapsAssetsMigrationStage.ReadAssetsControllerOnly,
    ])('preserves valid stage %d', (stage) => {
      expect(parseSnapsAssetsMigrationStage({ stage })).toBe(stage);
    });

    it.each([
      SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
      SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
      SnapsAssetsMigrationStage.ReadAssetsControllerOnly,
    ])('preserves valid nested stage %d', (stage) => {
      expect(
        parseSnapsAssetsMigrationStage({ name: 's1', value: { stage } }),
      ).toBe(stage);
    });

    it.each<[string, Json | undefined]>([
      ['undefined value', undefined],
      ['stage Off', { stage: SnapsAssetsMigrationStage.Off }],
      ['nested stage Off', { value: { stage: SnapsAssetsMigrationStage.Off } }],
      ['non-object value', true],
      ['null value', null],
      ['array value', []],
      ['missing stage', { featureVersion: '1' }],
      ['nested missing stage', { name: 's1', value: { featureVersion: '1' } }],
      ['unknown stage number', { stage: 99 }],
      ['nested unknown stage number', { value: { stage: 99 } }],
      ['non-numeric stage', { stage: '1' }],
      ['nested non-numeric stage', { value: { stage: '1' } }],
    ])('returns Off for %s', (_label, flagValue) => {
      expect(parseSnapsAssetsMigrationStage(flagValue)).toBe(
        SnapsAssetsMigrationStage.Off,
      );
    });
  });

  describe('getMigrationStages', () => {
    it('returns Off for every migration namespace when no flags are set', () => {
      expect(getMigrationStages({})).toStrictEqual([
        SnapsAssetsMigrationStage.Off,
        SnapsAssetsMigrationStage.Off,
        SnapsAssetsMigrationStage.Off,
      ]);
    });

    it('resolves each namespace stage in SNAPS_ASSETS_MIGRATION_NAMESPACES order', () => {
      expect([...SNAPS_ASSETS_MIGRATION_NAMESPACES]).toStrictEqual([
        'solana',
        'stellar',
        'tron',
      ]);
      expect(
        getMigrationStages({
          [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana]: {
            stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
          },
          [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.tron]: {
            stage: SnapsAssetsMigrationStage.ReadAssetsControllerOnly,
          },
        }),
      ).toStrictEqual([
        SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
        SnapsAssetsMigrationStage.Off,
        SnapsAssetsMigrationStage.ReadAssetsControllerOnly,
      ]);
    });
  });

  describe('shouldSupportChain', () => {
    it('always surfaces non-migration namespaces regardless of flags', () => {
      expect(shouldSupportChain('eip155:1' as ChainId, undefined)).toBe(true);
      expect(shouldSupportChain('eip155:1' as ChainId, {})).toBe(true);
    });

    it('surfaces a migration chain once its stage is active', () => {
      expect(
        shouldSupportChain(SOLANA_CHAIN_ID, {
          [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana]: {
            stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
          },
        }),
      ).toBe(true);
    });

    it('excludes a migration chain when its stage is Off or missing', () => {
      expect(shouldSupportChain(STELLAR_CHAIN_ID, {})).toBe(false);
      expect(
        shouldSupportChain(TRON_CHAIN_ID, {
          [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.tron]: {
            stage: SnapsAssetsMigrationStage.Off,
          },
        }),
      ).toBe(false);
    });

    it('excludes a migration chain when the flags are unavailable', () => {
      expect(shouldSupportChain(SOLANA_CHAIN_ID, undefined)).toBe(false);
    });
  });
});
