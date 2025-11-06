import { ClaimsController } from './ClaimsController';
import { HttpContentTypeHeader } from './constants';
import type { ClaimWithoutSignature } from './types';
import { createMockClaimsControllerMessenger } from '../tests/mocks/messenger';
import type { WithControllerArgs } from '../tests/types';

const mockClaimServiceRequestHeaders = jest.fn();
const mockClaimServiceGetClaimsApiUrl = jest.fn();

/**
 * Builds a controller based on the given options and calls the given function with that controller.
 *
 * @param args - Either a function, or an options bag + a function.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
) {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const { messenger, rootMessenger } = createMockClaimsControllerMessenger(
    mockClaimServiceRequestHeaders,
    mockClaimServiceGetClaimsApiUrl,
  );

  const controller = new ClaimsController({
    messenger,
    ...rest,
  });

  return await fn({
    controller,
    initialState: controller.state,
    messenger,
    rootMessenger,
  });
}

describe('ClaimsController', () => {
  describe('constructor', () => {
    it('should be defined', () => {
      expect(ClaimsController).toBeDefined();
    });
  });

  describe('getSubmitClaimConfig', () => {
    const MOCK_CLAIM: ClaimWithoutSignature = {
      chainId: 1,
      email: 'test@test.com',
      impactedWalletAddress: '0x123',
      impactedTxHash: '0x123',
      reimbursementWalletAddress: '0x456',
      description: 'test description',
    };
    const MOCK_CLAIM_API = 'https://claims-api.test.com';
    const MOCK_HEADERS = {
      'Content-Type': HttpContentTypeHeader.MULTIPART_FORM_DATA,
      Authorization: 'Bearer test-token',
    };

    beforeEach(() => {
      jest.resetAllMocks();

      mockClaimServiceRequestHeaders.mockResolvedValueOnce(MOCK_HEADERS);
      mockClaimServiceGetClaimsApiUrl.mockReturnValueOnce(MOCK_CLAIM_API);
    });

    it('should be defined', async () => {
      await withController(async ({ controller }) => {
        const submitClaimConfig =
          await controller.getSubmitClaimConfig(MOCK_CLAIM);

        expect(mockClaimServiceRequestHeaders).toHaveBeenCalledWith(
          HttpContentTypeHeader.MULTIPART_FORM_DATA,
        );
        expect(mockClaimServiceGetClaimsApiUrl).toHaveBeenCalledTimes(1);

        expect(submitClaimConfig).toBeDefined();
        expect(submitClaimConfig.data).toStrictEqual({
          ...MOCK_CLAIM,
          signature: expect.any(String),
        });
        expect(submitClaimConfig.headers).toStrictEqual(MOCK_HEADERS);
        expect(submitClaimConfig.method).toBe('POST');
        expect(submitClaimConfig.url).toBe(MOCK_CLAIM_API);
      });
    });
  });
});
