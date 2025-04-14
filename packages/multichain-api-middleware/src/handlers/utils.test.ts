import { shouldEmitDappViewedEvent } from './utils';

describe('shouldEmitDappViewedEvent', () => {
  it('should return false for null metrics ID', () => {
    expect(shouldEmitDappViewedEvent(null)).toBe(false);
  });
  it('should return true for valid metrics IDs', () => {
    expect(shouldEmitDappViewedEvent('fake-metrics-id-fd20')).toBe(true);
  });
  it('should return false for invalid metrics IDs', () => {
    expect(shouldEmitDappViewedEvent('fake-metrics-id-invalid')).toBe(false);
  });
});
