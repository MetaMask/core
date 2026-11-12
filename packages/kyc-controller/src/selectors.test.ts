import { describe, expect, it } from 'vitest';

import {
  getDefaultKycControllerState,
  getDefaultKycVendorSessionState,
} from './KycController.js';
import { selectKycSession, selectKycSessionStatus } from './selectors.js';

describe('selectors', () => {
  it('selectKycSession returns the vendor entry', () => {
    const entry = getDefaultKycVendorSessionState();
    const state = { sessions: { iron: entry } };
    expect(selectKycSession(state, 'iron')).toBe(entry);
    expect(selectKycSession(state, 'moonpay')).toBeUndefined();
  });

  it('selectKycSessionStatus returns null when the vendor has no session', () => {
    expect(
      selectKycSessionStatus(getDefaultKycControllerState(), 'iron'),
    ).toBeNull();
  });
});
