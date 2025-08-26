import { isSnapAccountProvider } from './SnapAccountProvider';
import { SolAccountProvider } from './SolAccountProvider';
import type { MultichainAccountServiceMessenger } from '../types';

describe('SnapAccountProvider', () => {
  describe('isSnapAccountProvider', () => {
    it('returns false for plain object with snapId property', () => {
      const mockProvider = { snapId: 'test-snap-id' };

      expect(isSnapAccountProvider(mockProvider)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isSnapAccountProvider(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSnapAccountProvider(undefined)).toBe(false);
    });

    it('returns false for object without snapId property', () => {
      const mockProvider = { otherProperty: 'value' };

      expect(isSnapAccountProvider(mockProvider)).toBe(false);
    });

    it('returns false for primitive values', () => {
      expect(isSnapAccountProvider('string')).toBe(false);
      expect(isSnapAccountProvider(123)).toBe(false);
      expect(isSnapAccountProvider(true)).toBe(false);
    });

    it('returns true for actual SnapAccountProvider instance', () => {
      // Create a mock messenger with required methods
      const mockMessenger = {
        call: jest.fn(),
        registerActionHandler: jest.fn(),
        subscribe: jest.fn(),
        registerMethodActionHandlers: jest.fn(),
        unregisterActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
        publish: jest.fn(),
        clearEventSubscriptions: jest.fn(),
      } as unknown as MultichainAccountServiceMessenger;

      const solProvider = new SolAccountProvider(mockMessenger);
      expect(isSnapAccountProvider(solProvider)).toBe(true);
    });
  });
});
