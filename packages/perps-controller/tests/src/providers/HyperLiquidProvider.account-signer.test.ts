import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import type { HyperLiquidWalletParams } from '../../../src/services/HyperLiquidClientService.js';
import type { PerpsTypedDataPayload } from '../../../src/types/index.js';
import {
  createMockEvmAccount,
  createMockInfrastructure,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

// The wallet service stays real: this test proves the provider hands the SDK a
// wallet adapter that signs through the injected account signer.
jest.mock('@nktkas/hyperliquid', () => ({}));
jest.mock('../../../src/services/HyperLiquidClientService');
jest.mock('../../../src/services/HyperLiquidSubscriptionService');
jest.mock('../../../src/services/TradingReadinessCache');

const MockedHyperLiquidClientService =
  HyperLiquidClientService as jest.MockedClass<typeof HyperLiquidClientService>;

const SIGNATURE = `0x${'cd'.repeat(65)}` as const;

const ORDER_TYPED_DATA: PerpsTypedDataPayload = {
  domain: {
    name: 'Exchange',
    version: '1',
    chainId: 1337,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  },
  types: {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  },
  primaryType: 'Agent',
  message: { source: 'b', connectionId: `0x${'22'.repeat(32)}` },
};

describe('HyperLiquidProvider with accountSigner', () => {
  it('initializes the SDK with a wallet that signs through the account signer', async () => {
    const initialize = jest.fn<Promise<void>, [HyperLiquidWalletParams]>();
    MockedHyperLiquidClientService.mockImplementation(
      () =>
        ({
          initialize,
          isTestnetMode: jest.fn().mockReturnValue(true),
          setOnTerminateCallback: jest.fn(),
          setOnReconnectCallback: jest.fn(),
        }) as unknown as HyperLiquidClientService,
    );
    const signTypedData = jest.fn().mockResolvedValue(SIGNATURE);
    const messenger = createMockMessenger();
    const call = jest.spyOn(messenger, 'call');
    const provider = new HyperLiquidProvider({
      isTestnet: true,
      platformDependencies: {
        ...createMockInfrastructure(),
        accountSigner: { signTypedData },
      },
      messenger,
    });

    await provider.initialize();

    expect(initialize).toHaveBeenCalledTimes(1);
    const [[wallet]] = initialize.mock.calls;
    const signature = await wallet.signTypedData(ORDER_TYPED_DATA);

    expect(signature).toBe(SIGNATURE);
    expect(signTypedData).toHaveBeenCalledWith(
      createMockEvmAccount().address,
      ORDER_TYPED_DATA,
    );
    expect(
      call.mock.calls
        .map(([action]) => String(action))
        .filter((action) => action.startsWith('KeyringController:')),
    ).toStrictEqual([]);
  });
});
