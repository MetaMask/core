import { describe, expect, it } from 'vitest';

import { controllerName } from './constants.js';

describe('constants', () => {
  describe('controllerName', () => {
    it('should be defined and equal to expected value', () => {
      expect(controllerName).toBe('SubscriptionController');
    });
  });
});
