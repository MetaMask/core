import { HYPERLIQUID_ORDER_CAPABILITIES as subpathCapabilities } from '../src/constants/hyperLiquidConfig.js';
import { HYPERLIQUID_ORDER_CAPABILITIES } from '../src/constants/index.js';
import { PerpsController } from '../src/index.js';
import type {
  DirectProviderOrderCapabilities,
  PerpsControllerGetOrderCapabilitiesAction,
  PerpsOrderCapabilities,
} from '../src/index.js';

jest.mock('@nktkas/hyperliquid', () => ({
  HyperliquidError: class MockHyperliquidError extends Error {},
}));

describe('public order capability contract', () => {
  it('exports the controller query and its messenger action', () => {
    const action: PerpsControllerGetOrderCapabilitiesAction['type'] =
      'PerpsController:getOrderCapabilities';

    expect(typeof PerpsController.prototype.getOrderCapabilities).toBe(
      'function',
    );
    expect(action).toBe('PerpsController:getOrderCapabilities');
  });

  it('preserves ready results from providers without a trigger declaration', () => {
    const legacy: DirectProviderOrderCapabilities = {
      status: 'ready',
      providerId: 'lighter',
      supportedStrategies: [],
    };
    const routed: PerpsOrderCapabilities = legacy;

    expect(routed.status).toBe('ready');
    expect(routed.supportedTriggerOrderTypes).toBeUndefined();
  });

  it('exports the same standalone trigger declaration through both constants entrypoints', () => {
    expect(subpathCapabilities).toBe(HYPERLIQUID_ORDER_CAPABILITIES);
    expect(
      HYPERLIQUID_ORDER_CAPABILITIES.supportedTriggerOrderTypes,
    ).toStrictEqual([
      'stop_market',
      'stop_limit',
      'take_profit_market',
      'take_profit_limit',
    ]);
  });

  it('prevents a consumer from changing the shared trigger declaration', () => {
    const declaration = HYPERLIQUID_ORDER_CAPABILITIES;

    expect(Object.isFrozen(declaration)).toBe(true);
    expect(Object.isFrozen(declaration.supportedTriggerOrderTypes)).toBe(true);
    expect(() =>
      Array.prototype.push.call(
        declaration.supportedTriggerOrderTypes,
        'market',
      ),
    ).toThrow(TypeError);
    expect(declaration.supportedTriggerOrderTypes).toHaveLength(4);
  });
});
