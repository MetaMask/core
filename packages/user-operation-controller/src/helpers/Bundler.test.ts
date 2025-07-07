import type { UserOperation } from '../types';
import { Bundler } from './Bundler';

const URL_MOCK = 'http://test.com';
const ENTRYPOINT_MOCK = '0x123';
const ERROR_MESSAGE_MOCK = 'Test Error';
const ERROR_CODE_MOCK = 123;
const USER_OPERATION_HASH_MOCK = '0xabc';

const USER_OPERATION_MOCK: UserOperation = {
  callData: '0x1',
  callGasLimit: '0x2',
  initCode: '0x3',
  maxFeePerGas: '0x4',
  maxPriorityFeePerGas: '0x5',
  nonce: '0x6',
  paymasterAndData: '0x7',
  preVerificationGas: '0x8',
  sender: '0x9',
  signature: '0xa',
  verificationGasLimit: '0xb',
};

describe('Bundler', () => {
  describe.each([
    [
      'estimateUserOperationGas' as const,
      [USER_OPERATION_MOCK, ENTRYPOINT_MOCK],
    ],
    ['getUserOperationReceipt' as const, [USER_OPERATION_HASH_MOCK]],
    ['sendUserOperation' as const, [USER_OPERATION_MOCK, ENTRYPOINT_MOCK]],
  ])(
    '%s',

    (methodName, args) => {
      const bundler = new Bundler(URL_MOCK);

      /**
       * Invoke the current method on the bundler instance.
       */
      async function invokeBundler() {
        return await (
          bundler[methodName] as (...args: unknown[]) => Promise<unknown>
        )(...args);
      }

      /**
       * Mock fetch to return a JSON response.
       * @param jsonResponse - The JSON response to return.
       */
      function mockJsonResponse(jsonResponse: Record<string, unknown>) {
        jest.spyOn(global, 'fetch').mockResolvedValueOnce({
          json: () => Promise.resolve(jsonResponse),
        } as Response);
      }

      it('sends JSON-RPC request to URL', async () => {
        mockJsonResponse({ result: {} });

        await invokeBundler();

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
          URL_MOCK,
          expect.objectContaining({
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: `eth_${methodName}`,
              params: args,
            }),
          }),
        );
      });

      it('returns JSON result', async () => {
        const responseMock = {
          test: 'value',
        };

        mockJsonResponse({ result: responseMock });

        const response = await invokeBundler();

        expect(response).toStrictEqual(responseMock);
      });

      it('throws if response has error message', async () => {
        mockJsonResponse({
          error: ERROR_MESSAGE_MOCK,
        });

        await expect(invokeBundler()).rejects.toThrow(
          expect.objectContaining({
            message: ERROR_MESSAGE_MOCK,
            code: undefined,
          }),
        );
      });

      it('throws if response has error message and code', async () => {
        mockJsonResponse({
          error: {
            message: ERROR_MESSAGE_MOCK,
            code: ERROR_CODE_MOCK,
          },
        });

        await expect(invokeBundler()).rejects.toThrow(
          expect.objectContaining({
            message: ERROR_MESSAGE_MOCK,
            code: ERROR_CODE_MOCK,
          }),
        );
      });
    },
  );
});
