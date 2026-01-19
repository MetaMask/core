import { PERPS_CONTROLLER_VERSION } from '../src';

describe('PerpsController', () => {
  describe('package setup', () => {
    it('exports version constant', () => {
      expect(PERPS_CONTROLLER_VERSION).toBe('0.0.0');
    });
  });
});
