import { errorCodes } from '@metamask/rpc-errors';

import { createMessenger } from '../../tests/messenger-mock.js';
import { assertPerpsEligible, toUsdcAmountRaw } from './shared.js';

describe('toUsdcAmountRaw', () => {
  it('returns 0x0 without an amount', () => {
    expect(toUsdcAmountRaw(undefined)).toBe('0x0');
  });

  it('converts to 6-decimal base units', () => {
    expect(toUsdcAmountRaw('10')).toBe('0x989680');
    expect(toUsdcAmountRaw('0.5')).toBe('0x7a120');
    expect(toUsdcAmountRaw('12.123456')).toBe('0xb8fd40');
  });
});

describe('assertPerpsEligible', () => {
  it('passes without refreshing when already eligible', async () => {
    const { messenger, refreshEligibility } = createMessenger();

    expect(await assertPerpsEligible(messenger)).toBeUndefined();
    expect(refreshEligibility).not.toHaveBeenCalled();
  });

  it('passes when a refresh shows the user is eligible', async () => {
    const { messenger, refreshEligibility } = createMessenger({
      eligibility: [false, true],
    });

    expect(await assertPerpsEligible(messenger)).toBeUndefined();
    expect(refreshEligibility).toHaveBeenCalledTimes(1);
  });

  it('throws the geo-block error when still not eligible after a refresh', async () => {
    const { messenger } = createMessenger({ eligibility: [false] });

    await expect(assertPerpsEligible(messenger)).rejects.toMatchObject({
      code: errorCodes.rpc.methodNotSupported,
      data: { reason: 'perpsNotEligible' },
    });
  });
});
