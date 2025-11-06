import { ClaimsService } from './ClaimsService';
import { CLAIMS_API_URL, Env, HttpContentTypeHeader } from './constants';
import type { Claim } from './types';
import { createMockClaimsServiceMessenger } from '../tests/mocks/messenger';

const mockAuthenticationControllerGetBearerToken = jest.fn();
const mockFetchFunction = jest.fn();

/**
 * Create a mock claims service.
 *
 * @param env - The environment to use for the mock claims service. Defaults to Env.DEV.
 * @returns A mock claims service.
 */
function createMockClaimsService(env: Env = Env.DEV) {
  const { messenger } = createMockClaimsServiceMessenger(
    mockAuthenticationControllerGetBearerToken,
  );
  return new ClaimsService({
    env,
    messenger,
    fetchFunction: mockFetchFunction,
  });
}

describe('ClaimsService', () => {
  const MOCK_CLAIM_1: Claim = {
    chainId: 1,
    email: 'test@test.com',
    impactedWalletAddress: '0x123',
    impactedTxHash: '0x123',
    reimbursementWalletAddress: '0x456',
    description: 'test description',
    signature: 'test-signature',
  };
  const MOCK_CLAIM_2: Claim = {
    chainId: 1,
    email: 'test2@test.com',
    impactedWalletAddress: '0x789',
    impactedTxHash: '0x789',
    reimbursementWalletAddress: '0x012',
    description: 'test description 2',
    signature: 'test-signature-2',
  };

  describe('constructor', () => {
    it('should be defined', () => {
      expect(ClaimsService).toBeDefined();
    });

    it('should create instance with valid config', () => {
      const { messenger } = createMockClaimsServiceMessenger(jest.fn());
      const service = new ClaimsService({
        env: Env.DEV,
        messenger,
        fetchFunction: jest.fn(),
      });

      expect(service).toBeInstanceOf(ClaimsService);
    });
  });

  describe('getClaims', () => {
    beforeEach(() => {
      jest.resetAllMocks();

      mockAuthenticationControllerGetBearerToken.mockResolvedValueOnce(
        'test-token',
      );
      mockFetchFunction.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([MOCK_CLAIM_1, MOCK_CLAIM_2]),
      });
    });

    it('should fetch claims successfully', async () => {
      const service = createMockClaimsService();

      const claims = await service.getClaims();

      expect(mockAuthenticationControllerGetBearerToken).toHaveBeenCalledTimes(
        1,
      );
      expect(mockFetchFunction).toHaveBeenCalledTimes(1);
      expect(mockFetchFunction).toHaveBeenCalledWith(
        `${CLAIMS_API_URL[Env.DEV]}/claims`,
        {
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': HttpContentTypeHeader.APPLICATION_JSON,
          },
        },
      );

      expect(claims).toStrictEqual([MOCK_CLAIM_1, MOCK_CLAIM_2]);
    });

    it('should throw error if fetch fails', async () => {
      mockFetchFunction.mockRestore();

      mockFetchFunction.mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValueOnce(null),
      });

      const service = createMockClaimsService();

      await expect(service.getClaims()).rejects.toThrow('Failed to get claims');
    });
  });

  describe('getClaimById', () => {
    beforeEach(() => {
      jest.resetAllMocks();

      mockAuthenticationControllerGetBearerToken.mockResolvedValueOnce(
        'test-token',
      );
      mockFetchFunction.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(MOCK_CLAIM_1),
      });
    });

    it('should fetch claim by id successfully', async () => {
      const service = createMockClaimsService();

      const claim = await service.getClaimById('1');

      expect(mockAuthenticationControllerGetBearerToken).toHaveBeenCalledTimes(
        1,
      );
      expect(mockFetchFunction).toHaveBeenCalledTimes(1);
      expect(mockFetchFunction).toHaveBeenCalledWith(
        `${CLAIMS_API_URL[Env.DEV]}/claims/byId/1`,
        {
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': HttpContentTypeHeader.APPLICATION_JSON,
          },
        },
      );

      expect(claim).toStrictEqual(MOCK_CLAIM_1);
    });

    it('should throw error if fetch fails', async () => {
      mockFetchFunction.mockRestore();

      mockFetchFunction.mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValueOnce(null),
      });

      const service = createMockClaimsService();

      await expect(service.getClaimById('1')).rejects.toThrow(
        'Failed to get claim by id',
      );
    });
  });
});
