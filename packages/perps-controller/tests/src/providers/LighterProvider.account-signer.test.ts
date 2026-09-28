import { LighterProvider } from '../../../src/providers/LighterProvider.js';
import { LighterClientService } from '../../../src/services/LighterClientService.js';
import type {
  LighterSignerBridge,
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
} from '../../../src/types/lighter-types.js';
import {
  createKeyringlessMessenger,
  createMockEvmAccount,
  createMockInfrastructure,
  keyringCalls,
} from '../../helpers/serviceMocks.js';

// The wallet service stays real. The venue REST client and the WASM signer
// bridge are the mocked I/O boundaries.
jest.mock('../../../src/services/LighterClientService', () => ({
  ...jest.requireActual<
    typeof import('../../../src/services/LighterClientService.js')
  >('../../../src/services/LighterClientService'),
  LighterClientService: jest.fn(),
}));

const MockedClientService = LighterClientService as jest.MockedClass<
  typeof LighterClientService
>;

const ACCOUNT_INDEX = 28;
const API_KEY_INDEX = 7;
const L1_SIGNATURE = `0x${'ab'.repeat(65)}` as const;
const CHANGE_PUB_KEY_BODY =
  'Register Lighter Account\n\npubkey: 0x9c...\nOnly sign this message for a trusted client!';

function createBridge(): {
  bridge: LighterSignerBridge;
  calls: LighterWasmCall[];
} {
  const calls: LighterWasmCall[] = [];
  const bridge: LighterSignerBridge = {
    createClient: jest.fn(async (params) =>
      bridge.execute({
        function: '_createClient',
        params: [
          params.chainId,
          params.accountIndex,
          params.nonce,
          params.apiKeyIndex,
        ],
      }),
    ),
    execute: jest.fn(
      async <Operation extends LighterSignerOperation>(
        call: LighterWasmCall<Operation>,
      ): Promise<LighterSignerResult<Operation>> => {
        calls.push(call);
        if (call.function === '_createClient') {
          return {
            success: true,
            pk: '9c'.repeat(40),
            pubKeySuccess: true,
            body: CHANGE_PUB_KEY_BODY,
          } as LighterSignerResult<Operation>;
        }
        return {
          txInfo: JSON.stringify({
            changePubKey: true,
            Nonce: 42,
            ExpiredAt: Date.now() + 599_000,
          }),
          txHash: 'dddd000000000001',
        } as LighterSignerResult<Operation>;
      },
    ),
  };
  return { bridge, calls };
}

describe('LighterProvider with accountSigner', () => {
  it('registers the venue key with an L1 signature from accountSigner', async () => {
    const { address } = createMockEvmAccount();
    const account = {
      code: 0,
      accountType: 0,
      index: ACCOUNT_INDEX,
      l1Address: address,
      status: 1,
      collateral: '0',
      availableBalance: '0',
      positions: [],
    };
    const client = {
      network: 'testnet',
      getAccountsByL1Address: jest.fn().mockResolvedValue({
        code: 200,
        l1Address: address,
        subAccounts: [account],
      }),
      getAccountByIndex: jest
        .fn()
        .mockResolvedValue({ code: 200, accounts: [account] }),
      getApiKeys: jest.fn().mockResolvedValue({ code: 200, apiKeys: [] }),
      getNextNonce: jest.fn().mockResolvedValue({ code: 200, nonce: 42 }),
      getTx: jest.fn().mockResolvedValue(null),
      sendTx: jest.fn().mockResolvedValue({ code: 200, txHash: '0xsent' }),
    };
    MockedClientService.mockImplementation(
      () => client as unknown as LighterClientService,
    );
    const accountSigner = {
      signTypedData: jest.fn(),
      signPersonalMessage: jest.fn().mockResolvedValue(L1_SIGNATURE),
    };
    const { messenger, call } = createKeyringlessMessenger();
    const { bridge, calls } = createBridge();
    const provider = new LighterProvider({
      isTestnet: true,
      platformDependencies: { ...createMockInfrastructure(), accountSigner },
      messenger,
      lighterAuthConfig: {
        accountIndex: ACCOUNT_INDEX,
        apiKeyIndex: API_KEY_INDEX,
      },
      signerBridge: bridge,
      webSocketCtor: null,
    });

    const result = await provider.isReadyToTrade();

    expect(result.ready).toBe(true);
    expect(accountSigner.signPersonalMessage).toHaveBeenCalledWith(
      address,
      CHANGE_PUB_KEY_BODY,
    );
    const changePubKey = calls.find(
      (wasmCall) => wasmCall.function === '_signChangePubKey',
    );
    expect(changePubKey?.params).toStrictEqual([
      ACCOUNT_INDEX,
      L1_SIGNATURE,
      42,
      API_KEY_INDEX,
    ]);
    expect(client.sendTx).toHaveBeenCalledWith(
      8,
      expect.stringContaining('"changePubKey":true'),
    );
    expect(keyringCalls(call)).toStrictEqual([]);
  });
});
