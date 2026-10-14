import { IdMap } from './id-map.js';

describe('IdMap', () => {
  describe('constructor', () => {
    it('creates an empty map when called with no arguments', () => {
      const map = new IdMap();
      expect(map.getPayloadId('entropy:wallet-1')).toBeUndefined();
      expect(map.getLocalId('wallet:entropy-source-1')).toBeUndefined();
    });

    it('pre-populates the map from the provided entries', () => {
      const map = new IdMap([
        ['entropy:wallet-1', 'wallet:entropy-source-1'],
        ['keyring:wallet-2', 'wallet:private-key'],
      ]);
      expect(map.getPayloadId('entropy:wallet-1')).toBe(
        'wallet:entropy-source-1',
      );
      expect(map.getPayloadId('keyring:wallet-2')).toBe('wallet:private-key');
      expect(map.getLocalId('wallet:entropy-source-1')).toBe(
        'entropy:wallet-1',
      );
      expect(map.getLocalId('wallet:private-key')).toBe('keyring:wallet-2');
    });
  });

  describe('add', () => {
    it('registers a local-to-payload pair and its reverse', () => {
      const map = new IdMap();
      map.add('entropy:wallet-1', 'wallet:entropy-source-1');
      expect(map.getPayloadId('entropy:wallet-1')).toBe(
        'wallet:entropy-source-1',
      );
      expect(map.getLocalId('wallet:entropy-source-1')).toBe(
        'entropy:wallet-1',
      );
    });

    it('throws if the same local ID is registered twice', () => {
      const map = new IdMap();
      map.add('entropy:wallet-1', 'wallet:entropy-source-1');
      expect(() =>
        map.add('entropy:wallet-1', 'wallet:entropy-source-2'),
      ).toThrow('Local ID already registered: entropy:wallet-1');
    });

    it('throws if the same payload ID is registered twice', () => {
      const map = new IdMap();
      map.add('entropy:wallet-1', 'wallet:entropy-source-1');
      expect(() =>
        map.add('entropy:wallet-2', 'wallet:entropy-source-1'),
      ).toThrow('Payload ID already registered: wallet:entropy-source-1');
    });

    it('handles wallet and group IDs in the same map', () => {
      const map = new IdMap();
      map.add('entropy:wallet-1', 'wallet:entropy-source-1');
      map.add('entropy:wallet-1/0', 'wallet:entropy-source-1/0');
      expect(map.getPayloadId('entropy:wallet-1')).toBe(
        'wallet:entropy-source-1',
      );
      expect(map.getPayloadId('entropy:wallet-1/0')).toBe(
        'wallet:entropy-source-1/0',
      );
    });
  });

  describe('getPayloadId', () => {
    it('returns the payload ID for a known local wallet ID', () => {
      const map = new IdMap([['entropy:wallet-1', 'wallet:entropy-source-1']]);
      expect(map.getPayloadId('entropy:wallet-1')).toBe(
        'wallet:entropy-source-1',
      );
    });

    it('returns undefined for an unknown local ID', () => {
      const map = new IdMap();
      expect(map.getPayloadId('entropy:wallet-unknown')).toBeUndefined();
    });
  });

  describe('getLocalId', () => {
    it('returns the local ID for a known payload wallet ID', () => {
      const map = new IdMap([['entropy:wallet-1', 'wallet:entropy-source-1']]);
      expect(map.getLocalId('wallet:entropy-source-1')).toBe(
        'entropy:wallet-1',
      );
    });

    it('returns undefined for an unknown payload ID', () => {
      const map = new IdMap();
      expect(map.getLocalId('wallet:entropy-source-unknown')).toBeUndefined();
    });

    it('returns the local ID for a group payload ID', () => {
      const map = new IdMap([
        ['entropy:wallet-1/0', 'wallet:entropy-source-1/0'],
      ]);
      expect(map.getLocalId('wallet:entropy-source-1/0')).toBe(
        'entropy:wallet-1/0',
      );
    });
  });
});
