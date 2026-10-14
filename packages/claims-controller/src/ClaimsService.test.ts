import { createMockClaimsServiceMessenger } from '../tests/mocks/messenger.js';
import { ClaimsService } from './ClaimsService.js';
import {
  CLAIMS_API_URL_MAP,
  ClaimsServiceErrorMessages,
  ClaimStatusEnum,
  Env,
} from './constants.js';
import type {
  Claim,
  ClaimsConfigurationsResponse,
  GenerateSignatureMessageResponse,
} from './types.js';
import { createSentryError } from './utils.js';

const mockAuthenticationControllerGetBearerToken = jest.fn();
const mockAuthenticationControllerGetSessionProfile = jest.fn();
const mockFetchFunction = jest.fn();
const mockCaptureException = jest.fn();

const MOCK_SESSION_PROFILE = {
  identifierId: 'identifier-1',
  profileId: 'profile-1',
  canonicalProfileId: 'canonical-profile-1',
  metaMetricsId: 'metametrics-1',
};

/**
 * Create a mock claims service.
 *
 * @param env - The environment to use for the mock claims service. Defaults to Env.DEV.
 * @returns A mock claims service and its messenger.
 */
function createMockClaimsService(env: Env = Env.DEV): ClaimsService {
  const { messenger } = createMockClaimsServiceMessenger(
    mockAuthenticationControllerGetBearerToken,
    mockAuthenticationControllerGetSessionProfile,
    mockCaptureException,
  );
  return new ClaimsService({
    env,
    messenger,
    fetchFunction: mockFetchFunction,
    captureException: mockCaptureException,
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
        jest.fn(),
      );
      const service = new ClaimsService({
        env: Env.DEV,
        messenger,
        fetchFunction: jest.fn(),
      });

      expect(service).toBeInstanceOf(ClaimsService);
    });

    it('defaults fetchFunction to globalThis.fetch when omitted', async () => {
      const MOCK_CONFIGURATIONS: ClaimsConfigurationsResponse = {
        validSubmissionWindowDays: 21,
        networks: [1, 5, 11155111],
      };
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(MOCK_CONFIGURATIONS),
      } as unknown as Response);

      try {
        const { messenger } = createMockClaimsServiceMessenger(
          jest.fn().mockResolvedValue('test-token'),
          jest.fn().mockResolvedValue(MOCK_SESSION_PROFILE),
          jest.fn(),
        );
        const service = new ClaimsService({
          env: Env.DEV,
          messenger,
        });

        await service.fetchClaimsConfigurations();

        expect(fetchSpy).toHaveBeenCalledWith(
          `${CLAIMS_API_URL_MAP[Env.DEV]}/configurations`,
          expect.anything(),
        );
      } finally {
        fetchSpy.mockRestore();
      }
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
      mockAuthenticationControllerGetSessionProfile.mockResolvedValueOnce(
        MOCK_SESSION_PROFILE,
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
      expect(
        mockAuthenticationControllerGetSessionProfile,
      ).toHaveBeenCalledTimes(1);
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

    it('accepts responses with unrecognized fields', async () => {
      mockFetchFunction.mockRestore();
      mockAuthenticationControllerGetBearerToken.mockResolvedValueOnce(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValueOnce(
        MOCK_SESSION_PROFILE,
      );

      const responseWithExtraFields = {
        ...MOCK_CONFIGURATIONS,
        newApiField: 'additive',
      };
      mockFetchFunction.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(responseWithExtraFields),
      });

      const service = createMockClaimsService();

      expect(await service.fetchClaimsConfigurations()).toStrictEqual(
        responseWithExtraFields,
      );
    });
  });

  describe('getClaims', () => {
    beforeEach(() => {
      jest.resetAllMocks();

      mockAuthenticationControllerGetBearerToken.mockResolvedValueOnce(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValueOnce(
        MOCK_SESSION_PROFILE,
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
      expect(
        mockAuthenticationControllerGetSessionProfile,
      ).toHaveBeenCalledTimes(1);
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

    it('accepts claims with unrecognized fields', async () => {
      mockFetchFunction.mockRestore();
      mockAuthenticationControllerGetBearerToken.mockResolvedValueOnce(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValueOnce(
        MOCK_SESSION_PROFILE,
      );

      const claimWithExtraFields = {
        ...MOCK_CLAIM_1,
        newApiField: 'additive',
        attachments: [
          {
            publicUrl: 'https://example.com/file.png',
            contentType: 'image/png',
            originalname: 'file.png',
            newAttachmentField: true,
          },
        ],
      };
      mockFetchFunction.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([claimWithExtraFields]),
      });

      const service = createMockClaimsService();

      expect(await service.getClaims()).toStrictEqual([claimWithExtraFields]);
    });
  });

  describe('getClaimById', () => {
    beforeEach(() => {
      jest.resetAllMocks();

      mockAuthenticationControllerGetBearerToken.mockResolvedValueOnce(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValueOnce(
        MOCK_SESSION_PROFILE,
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
      expect(
        mockAuthenticationControllerGetSessionProfile,
      ).toHaveBeenCalledTimes(1);
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

    it('accepts a claim with unrecognized fields', async () => {
      mockFetchFunction.mockRestore();
      mockAuthenticationControllerGetBearerToken.mockResolvedValueOnce(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValueOnce(
        MOCK_SESSION_PROFILE,
      );

      const claimWithExtraFields = {
        ...MOCK_CLAIM_1,
        newApiField: 'additive',
      };
      mockFetchFunction.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(claimWithExtraFields),
      });

      const service = createMockClaimsService();

      expect(await service.getClaimById('1')).toStrictEqual(
        claimWithExtraFields,
      );
    });

    it('should handle fetch error and capture exception', async () => {
      mockFetchFunction.mockRestore();

      mockFetchFunction.mockRejectedValueOnce(new Error('Fetch error'));

      const service = createMockClaimsService();

      await expect(service.getClaimById('1')).rejects.toThrow(
        ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID,
      );

      expect(mockCaptureException).toHaveBeenCalledWith(
        createSentryError(
          ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID,
          new Error('Fetch error'),
        ),
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
      mockAuthenticationControllerGetSessionProfile.mockResolvedValueOnce(
        MOCK_SESSION_PROFILE,
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
      expect(
        mockAuthenticationControllerGetSessionProfile,
      ).not.toHaveBeenCalled();
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
          new Error('error: Unknown error, statusCode: 500'),
        ),
      );
    });

    it('accepts responses with unrecognized fields', async () => {
      mockFetchFunction.mockRestore();
      mockAuthenticationControllerGetBearerToken.mockResolvedValueOnce(
        'test-token',
      );

      const responseWithExtraFields = {
        ...MOCK_MESSAGE,
        newApiField: 'additive',
      };
      mockFetchFunction.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(responseWithExtraFields),
      });

      const service = createMockClaimsService();

      expect(
        await service.generateMessageForClaimSignature(1, '0x123'),
      ).toStrictEqual(responseWithExtraFields);
    });
  });

  describe('caching', () => {
    const MOCK_CONFIGURATIONS: ClaimsConfigurationsResponse = {
      validSubmissionWindowDays: 21,
      networks: [1, 5, 11155111],
    };

    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('deduplicates cached GET requests', async () => {
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValue(
        MOCK_SESSION_PROFILE,
      );
      mockFetchFunction.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(MOCK_CONFIGURATIONS),
      });

      const service = createMockClaimsService();

      await service.fetchClaimsConfigurations();
      await service.fetchClaimsConfigurations();

      expect(mockFetchFunction).toHaveBeenCalledTimes(1);
    });

    it('does not cache signature message POST requests', async () => {
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'test-token',
      );
      mockFetchFunction.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          message: 'test message',
          nonce: 'test nonce',
        }),
      });

      const service = createMockClaimsService();

      await service.generateMessageForClaimSignature(1, '0x123');
      await service.generateMessageForClaimSignature(1, '0x123');

      expect(mockFetchFunction).toHaveBeenCalledTimes(2);
    });

    it('does not deduplicate concurrent signature message POST requests', async () => {
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'test-token',
      );

      mockFetchFunction.mockImplementation(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
        return {
          ok: true,
          json: jest.fn().mockResolvedValue({
            message: `test message ${mockFetchFunction.mock.calls.length}`,
            nonce: `test nonce ${mockFetchFunction.mock.calls.length}`,
          }),
        };
      });

      const service = createMockClaimsService();

      await Promise.all([
        service.generateMessageForClaimSignature(1, '0x123'),
        service.generateMessageForClaimSignature(1, '0x123'),
      ]);

      expect(mockFetchFunction).toHaveBeenCalledTimes(2);
    });

    it('does not serve cached claims across different profile ids', async () => {
      const profiles = [
        { ...MOCK_SESSION_PROFILE, profileId: 'profile-a' },
        { ...MOCK_SESSION_PROFILE, profileId: 'profile-b' },
      ];
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'same-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockImplementation(
        async () => profiles.shift() ?? MOCK_SESSION_PROFILE,
      );
      mockFetchFunction
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([MOCK_CLAIM_1]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([MOCK_CLAIM_2]),
        });

      const service = createMockClaimsService();

      const first = await service.getClaims();
      const second = await service.getClaims();

      expect(first).toStrictEqual([MOCK_CLAIM_1]);
      expect(second).toStrictEqual([MOCK_CLAIM_2]);
      expect(mockFetchFunction).toHaveBeenCalledTimes(2);
    });

    it('does not share an in-flight getClaims request across different profile ids', async () => {
      const profiles = [
        { ...MOCK_SESSION_PROFILE, profileId: 'profile-a' },
        { ...MOCK_SESSION_PROFILE, profileId: 'profile-b' },
      ];
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'same-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockImplementation(
        async () => profiles.shift() ?? MOCK_SESSION_PROFILE,
      );
      let fetchCount = 0;
      mockFetchFunction.mockImplementation(async () => {
        const index = fetchCount;
        fetchCount += 1;
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
        return {
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue(index === 0 ? [MOCK_CLAIM_1] : [MOCK_CLAIM_2]),
        };
      });

      const service = createMockClaimsService();

      const [first, second] = await Promise.all([
        service.getClaims(),
        service.getClaims(),
      ]);

      expect(first).toStrictEqual([MOCK_CLAIM_1]);
      expect(second).toStrictEqual([MOCK_CLAIM_2]);
      expect(mockFetchFunction).toHaveBeenCalledTimes(2);
    });

    it('reuses cached configurations across bearer token refreshes for the same profile', async () => {
      mockAuthenticationControllerGetBearerToken
        .mockResolvedValueOnce('token-1')
        .mockResolvedValueOnce('token-2');
      mockAuthenticationControllerGetSessionProfile.mockResolvedValue(
        MOCK_SESSION_PROFILE,
      );
      mockFetchFunction.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(MOCK_CONFIGURATIONS),
      });

      const service = createMockClaimsService();

      await service.fetchClaimsConfigurations();
      await service.fetchClaimsConfigurations();

      expect(mockFetchFunction).toHaveBeenCalledTimes(1);
    });

    it('does not leak the bearer token through cache update events', async () => {
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'sensitive-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValue(
        MOCK_SESSION_PROFILE,
      );
      mockFetchFunction.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([MOCK_CLAIM_1]),
      });

      const { messenger } = createMockClaimsServiceMessenger(
        mockAuthenticationControllerGetBearerToken,
        mockAuthenticationControllerGetSessionProfile,
        mockCaptureException,
      );
      const publishSpy = jest.spyOn(messenger, 'publish');
      const service = new ClaimsService({
        env: Env.DEV,
        messenger,
        fetchFunction: mockFetchFunction,
      });

      await service.getClaims();

      expect(publishSpy).toHaveBeenCalled();
      expect(JSON.stringify(publishSpy.mock.calls)).not.toContain(
        'sensitive-token',
      );
    });

    it('always fetches fresh claims on repeated calls (staleTime: 0)', async () => {
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValue(
        MOCK_SESSION_PROFILE,
      );
      mockFetchFunction
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([MOCK_CLAIM_1]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([MOCK_CLAIM_1, MOCK_CLAIM_2]),
        });

      const service = createMockClaimsService();

      const first = await service.getClaims();
      const second = await service.getClaims();

      expect(first).toStrictEqual([MOCK_CLAIM_1]);
      expect(second).toStrictEqual([MOCK_CLAIM_1, MOCK_CLAIM_2]);
      expect(mockFetchFunction).toHaveBeenCalledTimes(2);
    });

    it('always fetches fresh claim-by-id on repeated calls (staleTime: 0)', async () => {
      const updatedClaim = {
        ...MOCK_CLAIM_1,
        status: ClaimStatusEnum.SUBMITTED,
      };
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValue(
        MOCK_SESSION_PROFILE,
      );
      mockFetchFunction
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(MOCK_CLAIM_1),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(updatedClaim),
        });

      const service = createMockClaimsService();

      const first = await service.getClaimById('mock-claim-1');
      const second = await service.getClaimById('mock-claim-1');

      expect(first).toStrictEqual(MOCK_CLAIM_1);
      expect(second).toStrictEqual(updatedClaim);
      expect(mockFetchFunction).toHaveBeenCalledTimes(2);
    });

    it('does not cache malformed GET responses', async () => {
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValue(
        MOCK_SESSION_PROFILE,
      );
      mockFetchFunction
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ invalid: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(MOCK_CONFIGURATIONS),
        });

      const service = createMockClaimsService();

      await expect(service.fetchClaimsConfigurations()).rejects.toThrow(
        ClaimsServiceErrorMessages.FAILED_TO_FETCH_CONFIGURATIONS,
      );

      const configurations = await service.fetchClaimsConfigurations();

      expect(configurations).toStrictEqual(MOCK_CONFIGURATIONS);
      expect(mockFetchFunction).toHaveBeenCalledTimes(2);
    });

    it('publishes cacheUpdated events for cached GET requests', async () => {
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValue(
        MOCK_SESSION_PROFILE,
      );
      mockFetchFunction.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(MOCK_CONFIGURATIONS),
      });

      const { messenger } = createMockClaimsServiceMessenger(
        mockAuthenticationControllerGetBearerToken,
        mockAuthenticationControllerGetSessionProfile,
        mockCaptureException,
      );
      const publishSpy = jest.spyOn(messenger, 'publish');
      const service = new ClaimsService({
        env: Env.DEV,
        messenger,
        fetchFunction: mockFetchFunction,
      });

      await service.fetchClaimsConfigurations();

      expect(publishSpy).toHaveBeenCalledWith(
        'ClaimsService:cacheUpdated',
        expect.objectContaining({
          type: 'updated',
        }),
      );
    });
  });

  describe('response validation', () => {
    beforeEach(() => {
      jest.resetAllMocks();
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValue(
        MOCK_SESSION_PROFILE,
      );
    });

    it('throws when configurations response is malformed', async () => {
      mockFetchFunction.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ invalid: true }),
      });

      const service = createMockClaimsService();

      await expect(service.fetchClaimsConfigurations()).rejects.toThrow(
        ClaimsServiceErrorMessages.FAILED_TO_FETCH_CONFIGURATIONS,
      );
    });

    it('throws when claims response is malformed', async () => {
      mockFetchFunction.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{ invalid: true }]),
      });

      const service = createMockClaimsService();

      await expect(service.getClaims()).rejects.toThrow(
        ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIMS,
      );
    });
  });

  describe('captureException', () => {
    it('falls back to messenger.captureException when config captureException is omitted', async () => {
      jest.resetAllMocks();
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValue(
        MOCK_SESSION_PROFILE,
      );
      mockFetchFunction.mockRejectedValue(new Error('Fetch error'));

      const { messenger } = createMockClaimsServiceMessenger(
        mockAuthenticationControllerGetBearerToken,
        mockAuthenticationControllerGetSessionProfile,
        mockCaptureException,
      );
      const service = new ClaimsService({
        env: Env.DEV,
        messenger,
        fetchFunction: mockFetchFunction,
      });

      await expect(service.getClaimById('1')).rejects.toThrow(
        ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID,
      );

      expect(mockCaptureException).toHaveBeenCalledWith(
        createSentryError(
          ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID,
          new Error('Fetch error'),
        ),
      );
    });

    it('ignores errors thrown by captureException', async () => {
      jest.resetAllMocks();
      mockAuthenticationControllerGetBearerToken.mockResolvedValue(
        'test-token',
      );
      mockAuthenticationControllerGetSessionProfile.mockResolvedValue(
        MOCK_SESSION_PROFILE,
      );
      mockFetchFunction.mockRejectedValue(new Error('Fetch error'));

      const { messenger } = createMockClaimsServiceMessenger(
        mockAuthenticationControllerGetBearerToken,
        mockAuthenticationControllerGetSessionProfile,
        jest.fn(),
      );
      const service = new ClaimsService({
        env: Env.DEV,
        messenger,
        fetchFunction: mockFetchFunction,
        captureException: (_error: Error): void => {
          throw new Error('capture failed');
        },
      });

      await expect(service.getClaimById('1')).rejects.toThrow(
        ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID,
      );
    });
  });
});
