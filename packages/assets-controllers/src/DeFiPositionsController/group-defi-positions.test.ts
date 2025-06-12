import assert from 'assert';

import {
  MOCK_DEFI_RESPONSE_BORROW,
  MOCK_DEFI_RESPONSE_COMPLEX,
  MOCK_DEFI_RESPONSE_FAILED_ENTRY,
  MOCK_DEFI_RESPONSE_MULTI_CHAIN,
  MOCK_DEFI_RESPONSE_NO_PRICES,
} from './__fixtures__/mock-responses';
import { MOCK_EXPECTED_RESULT } from './__fixtures__/mock-result';
import { groupDeFiPositions } from './group-defi-positions';

describe('groupDeFiPositions', () => {
  it('groups multiple chains', () => {
    const result = groupDeFiPositions(MOCK_DEFI_RESPONSE_MULTI_CHAIN);

    expect(Object.keys(result)).toHaveLength(2);
    expect(Object.keys(result)[0]).toBe('0x1');
    expect(Object.keys(result)[1]).toBe('0x2105');
  });

  it('does not display failed entries', () => {
    const result = groupDeFiPositions(MOCK_DEFI_RESPONSE_FAILED_ENTRY);

    const protocolResults = result['0x1'].protocols['aave-v3'];
    expect(protocolResults.positionTypes.supply).toBeDefined();
    expect(protocolResults.positionTypes.borrow).toBeUndefined();
  });

  it('handles results with no prices and displays them', () => {
    const result = groupDeFiPositions(MOCK_DEFI_RESPONSE_NO_PRICES);

    const supplyResults =
      result['0x1'].protocols['aave-v3'].positionTypes.supply;
    expect(supplyResults).toBeDefined();
    assert(supplyResults);
    expect(Object.values(supplyResults.positions)).toHaveLength(1);
    expect(Object.values(supplyResults.positions[0])).toHaveLength(2);
    expect(supplyResults.aggregatedMarketValue).toBe(40);
  });

  it('substracts borrow positions from total market value', () => {
    const result = groupDeFiPositions(MOCK_DEFI_RESPONSE_BORROW);

    const protocolResults = result['0x1'].protocols['aave-v3'];
    assert(protocolResults.positionTypes.supply);
    assert(protocolResults.positionTypes.borrow);
    expect(protocolResults.positionTypes.supply.aggregatedMarketValue).toBe(
      1540,
    );
    expect(protocolResults.positionTypes.borrow.aggregatedMarketValue).toBe(
      1000,
    );
    expect(protocolResults.aggregatedMarketValue).toBe(540);
  });

  it('verifies that the resulting object is valid', () => {
    const result = groupDeFiPositions(MOCK_DEFI_RESPONSE_COMPLEX);

    expect(result).toStrictEqual(MOCK_EXPECTED_RESULT);
  });
});
