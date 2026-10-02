import type { Hex } from '@metamask/utils';
import { HttpTransport, WebSocketTransport } from '@nktkas/hyperliquid';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type {
  HyperLiquidClientService,
  HyperLiquidWalletParams,
} from '../../../src/services/HyperLiquidClientService.js';
import {
  AGENT_ADDRESS,
  L1_PAYLOAD,
  MAINNET_ACCOUNT,
  MAIN_ADDRESS,
  OTHER_MAIN_ADDRESS,
  mustDepositError,
} from '../../helpers/agentFixtures.js';
import {
  apiRequestError,
  createAccountSignerProvider,
  setUpAccountSignerSuite,
} from '../../helpers/hyperLiquidAccountSignerFixture.js';
import {
  createDeferred,
  createMockInfrastructure,
} from '../../helpers/serviceMocks.js';

// Keep SDK signing, dispatch guards and reporting real; only its network
// transports and the provider's unrelated reads/subscriptions are mocked.
jest.mock('@nktkas/hyperliquid', () => ({
  ...jest.requireActual<typeof import('@nktkas/hyperliquid')>(
    '@nktkas/hyperliquid',
  ),
  HttpTransport: jest.fn(),
  WebSocketTransport: jest.fn(),
}));
jest.mock('../../../src/services/HyperLiquidClientService');
jest.mock('../../../src/services/HyperLiquidSubscriptionService');

const { HyperLiquidClientService: RealClientService } = jest.requireActual<
  typeof import('../../../src/services/HyperLiquidClientService.js')
>('../../../src/services/HyperLiquidClientService.js');

const CANCEL = { cancels: [{ a: 0, o: 123 }] };

type TrackedSdkFixture = ReturnType<typeof createAccountSignerProvider> & {
  realService: HyperLiquidClientService;
  registry: Map<string, unknown>;
  request: jest.Mock;
  getAgentSigner: jest.Mock;
  onAgentRejected: jest.Mock;
  onExchangeRequest: jest.Mock<
    void,
    [unknown, unknown, HyperLiquidWalletParams?]
  >;
};

/**
 * Observe the actual provider registry when it binds its wallet, without a
 * production test hook or a replacement registry.
 *
 * @returns The registry observer and its restoration function.
 */
function observeSignatureRegistry(): {
  registry: () => Map<string, unknown>;
  restore: () => void;
} {
  let registry: Map<string, unknown> | undefined;
  const originalSet = Reflect.get(WeakMap.prototype, 'set') as (
    this: WeakMap<object, unknown>,
    key: object,
    value: unknown,
  ) => WeakMap<object, unknown>;
  const observer = jest
    .spyOn(WeakMap.prototype, 'set')
    .mockImplementation(function (
      this: WeakMap<object, unknown>,
      key: object,
      value: unknown,
    ) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'unansweredSignatures' in value &&
        value.unansweredSignatures instanceof Map
      ) {
        registry = value.unansweredSignatures as Map<string, unknown>;
      }
      return originalSet.call(this, key, value);
    });
  return {
    registry: () => {
      if (!registry) {
        throw new Error('The provider did not register its SDK wallet');
      }
      return registry;
    },
    restore: () => observer.mockRestore(),
  };
}

describe('HyperLiquidProvider agent signatures after dispatch refusal', () => {
  let service: HyperLiquidClientService | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    setUpAccountSignerSuite();
  });

  afterEach(async () => {
    await service?.disconnect();
    service = undefined;
    jest.restoreAllMocks();
  });

  /**
   * Connect the provider's real tracked wallet to the real client service and
   * SDK, with distinct valid signatures and a mocked HTTP boundary.
   *
   * @returns The provider, real SDK service, registry and transport mock.
   */
  async function createTrackedSdkFixture(): Promise<TrackedSdkFixture> {
    const observer = observeSignatureRegistry();
    const getAgentSigner = jest.fn();
    const onAgentRejected = jest.fn();
    const built = createAccountSignerProvider({
      abstraction: 'unifiedAccount',
      getAgentSigner,
      onAgentRejected,
      info: { extraAgents: jest.fn().mockResolvedValue([]) },
    });
    getAgentSigner.mockResolvedValue(built.agentSigner);
    await built.accountSignerProvider.prepareTradingWallet();
    const registry = observer.registry();
    observer.restore();
    let signatureNumber = 0;
    built.agentSigner.signTypedData.mockImplementation(
      async (): Promise<Hex> => {
        signatureNumber += 1;
        return `0x${signatureNumber.toString(16).padStart(64, '0')}${'11'.repeat(32)}1b`;
      },
    );
    const request = jest.fn();
    jest
      .mocked(HttpTransport)
      .mockImplementation(
        () => ({ isTestnet: false, request }) as unknown as HttpTransport,
      );
    jest.mocked(WebSocketTransport).mockImplementation(
      () =>
        ({
          isTestnet: false,
          ready: jest.fn().mockResolvedValue(undefined),
          close: jest.fn(),
          socket: { addEventListener: jest.fn() },
        }) as unknown as WebSocketTransport,
    );
    const onExchangeRequest = jest.fn(built.reportExchangeRequest);
    const realService = new RealClientService(createMockInfrastructure(), {
      onExchangeRequest,
    });
    service = realService;
    await realService.initialize(built.sdkWallet());
    return {
      ...built,
      realService,
      registry,
      request,
      getAgentSigner,
      onAgentRejected,
      onExchangeRequest,
    };
  }

  it.each(['position changed', 'scope changed'])(
    'retires distinct signatures refused with %s without dispatching or dropping the cached signer',
    async (message) => {
      const built = await createTrackedSdkFixture();
      const refusal = new Error(message);
      const guard = jest.fn().mockRejectedValue(refusal);
      const guarded = built.realService.getExchangeClient(guard);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(guarded.cancel(CANCEL)).rejects.toBe(refusal);
        expect(built.registry.size).toBe(0);
      }

      expect(guard).toHaveBeenCalledTimes(5);
      expect(built.request).not.toHaveBeenCalled();
      expect(built.onAgentRejected).not.toHaveBeenCalled();
      expect(built.getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
      ]);
    },
  );

  it('reports a refused signature with its original wallet after the service changes account and network', async () => {
    const built = await createTrackedSdkFixture();
    const originalWallet = built.sdkWallet();
    const guardEntered = createDeferred<void>();
    const guardAnswer = createDeferred<void>();
    const refusal = new Error('scope changed');
    const guarded = built.realService.getExchangeClient(async () => {
      guardEntered.resolve();
      await guardAnswer.promise;
    });
    const refused = guarded.cancel(CANCEL).catch((error: unknown) => error);
    await guardEntered.promise;
    expect(built.registry.size).toBe(1);
    const replacementWallet = {
      ...originalWallet,
      address: OTHER_MAIN_ADDRESS,
    };

    await built.realService.toggleTestnet(replacementWallet);
    guardAnswer.reject(refusal);
    expect(await refused).toBe(refusal);

    expect(built.onExchangeRequest).toHaveBeenCalledTimes(1);
    expect(built.onExchangeRequest.mock.calls[0]?.[0]).toMatchObject({
      action: { type: 'cancel', ...CANCEL },
      signature: { r: `0x${'1'.padStart(64, '0')}` },
    });
    expect(built.onExchangeRequest.mock.calls[0]?.[1]).toBeUndefined();
    expect(built.onExchangeRequest.mock.calls[0]?.[2]).toBe(originalWallet);
    expect(built.realService.getExchangeClient().config_.wallet).toBe(
      replacementWallet,
    );
    expect(built.realService.isTestnetMode()).toBe(true);
    expect(built.registry.size).toBe(0);
    expect(built.request).not.toHaveBeenCalled();
    expect(built.onAgentRejected).not.toHaveBeenCalled();
    expect(built.getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
  });

  it('preserves a pending signature and attributes its later answer to the original account', async () => {
    const built = await createTrackedSdkFixture();
    const dispatched = createDeferred<void>();
    const answer = createDeferred<Record<string, unknown>>();
    built.request.mockImplementation(async () => {
      dispatched.resolve();
      return await answer.promise;
    });
    const shared = built.realService.getExchangeClient();
    // The SDK serializes a wallet's writes through response settlement. Send
    // this already-signed request at its reporting transport boundary to keep
    // one actual registry entry in flight while the real SDK refuses others.
    built.exchangeClient.cancel.mockImplementation(async () => {
      const signature = await built.sdkWallet().signTypedData(L1_PAYLOAD);
      const response = await shared.config_.transport.request<
        Record<string, unknown>
      >('exchange', {
        action: { type: 'cancel', ...CANCEL },
        signature: { r: signature.slice(0, 66) },
      });
      throw apiRequestError(response);
    });

    const pending = built.accountSignerProvider.cancelOrder({
      orderId: '123',
      symbol: 'BTC',
    });
    await dispatched.promise;
    const pendingEntries = [...built.registry.entries()];
    built.selectAccount(OTHER_MAIN_ADDRESS);
    const refusal = new Error('scope changed');
    const guarded = built.realService.getExchangeClient(async () => {
      throw refusal;
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(guarded.cancel(CANCEL)).rejects.toBe(refusal);
      expect([...built.registry.entries()]).toStrictEqual(pendingEntries);
    }
    answer.resolve({
      status: 'err',
      response: mustDepositError(MAIN_ADDRESS).message,
    });
    const result = await pending;

    expect(pendingEntries).toHaveLength(1);
    expect(built.request).toHaveBeenCalledTimes(1);
    expect(built.registry.size).toBe(0);
    expect(result).toStrictEqual({
      success: false,
      orderId: '123',
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(built.onAgentRejected.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT, AGENT_ADDRESS],
    ]);
    expect(built.getAgentSigner.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT],
      [{ mainAddress: OTHER_MAIN_ADDRESS, isTestnet: false }],
    ]);
  });
});
