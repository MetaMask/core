import { ClaimsService } from './ClaimsService';
import {
  CLAIMS_API_URL_MAP,
  ClaimsServiceErrorMessages,
  ClaimStatusEnum,
  Env,
} from './constants';
import type {
  Claim,
  ClaimsConfigurationsResponse,
  GenerateSignatureMessageResponse,
} from './types';
import { createSentryError } from './utils';
import { createMockClaimsServiceMessenger } from '../tests/mocks/messenger';

const mockAuthenticationControllerGetBearerToken = jest.fn();
const mockFetchFunction = jest.fn();
const mockCaptureException = jest.fn();
/**
 * Create a mock claims service.
 *
 * @param env - The environment to use for the mock claims service. Defaults to Env.DEV.
 * @returns A mock claims service and its messenger.
 */
function createMockClaimsService(env: Env = Env.DEV): ClaimsService {
  const { messenger } = createMockClaimsServiceMessenger(
    mockAuthenticationControllerGetBearerToken,
    mockCaptureException,
  );
  return new ClaimsService({
    env,
    messenger,
    fetchFunction: mockFetchFunction,
  });
}

describe('ClaimsService', () => {
  const MOCK_CLAIM_1: Claim = {
    id: 'mock-claim-1',
    shortId: 'mock-claim-1',
    status: ClaimStatusEnum.CREATED,
    createdAt: '2021-01-01',
    updatedAt: '2021-01-01',
    chainId: '0x1',
    email: 'test@test.com',
    impactedWalletAddress: '0x123',
    impactedTxHash: '0x123',
    reimbursementWalletAddress: '0x456',
    description: 'test description',
    signature: '0xdeadbeef',
  };
  const MOCK_CLAIM_2: Claim = {
    id: 'mock-claim-2',
    shortId: 'mock-claim-2',
    status: ClaimStatusEnum.CREATED,
    createdAt: '2021-01-01',
    updatedAt: '2021-01-01',
    chainId: '0x1',
    email: 'test2@test.com',
    impactedWalletAddress: '0x789',
    impactedTxHash: '0x789',
    reimbursementWalletAddress: '0x012',
    description: 'test description 2',
    signature: '0xdeadbeef',
  };

  describe('constructor', () => {
    it('should be defined', () => {
      expect(ClaimsService).toBeDefined();
    });

    it('should create instance with valid config', () => {
      const { messenger } = createMockClaimsServiceMessenger(
        jest.fn(),
        jest.fn(),
      );
      const service = new ClaimsService({
        env: Env.DEV,
        messenger,
        fetchFunction: jest.fn(),
      });

      expect(service).toBeInstanceOf(ClaimsService);
    });
  });

  describe('fetchClaimsConfigurations', () => {
    const MOCK_CONFIGURATIONS: ClaimsConfigurationsResponse = {
      validSubmissionWindowDays: 21,
      networks: [1, 5, 11155111],
    };

    beforeEach(() => {
      jest.resetAllMocks();

      mockAuthenticationControllerGetBearerToken.mockResolvedValueOnce(
        'test-token',
      );
      mockFetchFunction.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(MOCK_CONFIGURATIONS),
      });
    });

    it('should fetch claims configurations successfully', async () => {
      const service = createMockClaimsService();

      const configurations = await service.fetchClaimsConfigurations();

      expect(mockAuthenticationControllerGetBearerToken).toHaveBeenCalledTimes(
        1,
      );
      expect(mockFetchFunction).toHaveBeenCalledTimes(1);
      expect(mockFetchFunction).toHaveBeenCalledWith(
        `${CLAIMS_API_URL_MAP[Env.DEV]}/configurations`,
        {
          headers: {
            Authorization: 'Bearer test-token',
          },
        },
      );
      expect(configurations).toStrictEqual(MOCK_CONFIGURATIONS);
    });

    it('should throw error if fetch fails', async () => {
      mockFetchFunction.mockRestore();

      mockFetchFunction.mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValueOnce(null),
      });

      const service = createMockClaimsService();

      await expect(service.fetchClaimsConfigurations()).rejects.toThrow(
        ClaimsServiceErrorMessages.FAILED_TO_FETCH_CONFIGURATIONS,
      );
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
        `${CLAIMS_API_URL_MAP[Env.DEV]}/claims`,
        {
          headers: {
            Authorization: 'Bearer test-token',
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

      await expect(service.getClaims()).rejects.toThrow(
        ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIMS,
      );
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
        `${CLAIMS_API_URL_MAP[Env.DEV]}/claims/byId/1`,
        {
          headers: {
            Authorization: 'Bearer test-token',
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
        ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID,
      );
    });
  });

  describe('generateMessageForClaimSignature', () => {
    const MOCK_MESSAGE: GenerateSignatureMessageResponse = {
      message: 'test message',
      nonce: 'test nonce',
    };

    beforeEach(() => {
      jest.resetAllMocks();

      mockAuthenticationControllerGetBearerToken.mockResolvedValueOnce(
        'test-token',
      );
      mockFetchFunction.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          message: 'test message',
          nonce: 'test nonce',
        }),
      });
    });

    it('should generate message for claim signature successfully', async () => {
      const service = createMockClaimsService();

      const message = await service.generateMessageForClaimSignature(
        1,
        '0x123',
      );

      expect(mockAuthenticationControllerGetBearerToken).toHaveBeenCalledTimes(
        1,
      );
      expect(mockFetchFunction).toHaveBeenCalledTimes(1);
      expect(mockFetchFunction).toHaveBeenCalledWith(
        `${CLAIMS_API_URL_MAP[Env.DEV]}/signature/generateMessage`,
        {
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({
            chainId: 1,
            walletAddress: '0x123',
          }),
        },
      );

      expect(message).toStrictEqual(MOCK_MESSAGE);
    });

    it('should throw error if fetch fails', async () => {
      mockFetchFunction.mockRestore();

      mockFetchFunction.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValueOnce(null),
      });

      const service = createMockClaimsService();

      await expect(
        service.generateMessageForClaimSignature(1, '0x123'),
      ).rejects.toThrow(
        ClaimsServiceErrorMessages.SIGNATURE_MESSAGE_GENERATION_FAILED,
      );

      expect(mockCaptureException).toHaveBeenCalledWith(
        createSentryError(
          ClaimsServiceErrorMessages.SIGNATURE_MESSAGE_GENERATION_FAILED,
          new Error('HTTP 500 error'),
        ),
      );
    });
  });
});
