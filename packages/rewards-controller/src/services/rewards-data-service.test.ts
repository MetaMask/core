import { successfulFetch } from '@metamask/controller-utils';
import type { CaipAccountId } from '@metamask/utils';

import {
  RewardsDataService,
  type RewardsDataServiceMessenger,
} from './rewards-data-service';
import {
  type LoginResponseDto,
  type EstimatePointsDto,
  type EstimatedPointsDto,
  type SeasonStatusDto,
  type SubscriptionReferralDetailsDto,
  EnvironmentType,
} from '../types';

const RewardsApiUrl = 'https://api.rewards.test';
// Mock dependencies
jest.mock('@metamask/controller-utils', () => ({
  successfulFetch: jest.fn(),
}));

jest.mock('../logger', () => {
  const actual = jest.requireActual('../logger');
  const logSpy = jest.fn();
  return {
    ...actual,
    createModuleLogger: jest.fn(() => logSpy),
    __logSpy: logSpy,
  };
});

const { __logSpy: logSpy } = jest.requireMock('../logger') as {
  __logSpy: jest.Mock;
};

let mockMessenger: jest.Mocked<RewardsDataServiceMessenger>;

const mockGetSubscriptionToken = jest.fn<
  Promise<{ success: boolean; token?: string }>,
  [string]
>();

const okJsonResponse = <T>(data: T, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }) as unknown as Response;

// Helper to build service with injectable deps
const buildService = ({
  fetchImpl = jest
    .fn()
    .mockResolvedValue(
      okJsonResponse({ sessionId: 'sess', subscription: { id: 'sub' } }),
    ),
  getToken = mockGetSubscriptionToken,
  environment = EnvironmentType.Development,
  appType = 'mobile',
  version = '1.0.0',
  locale = 'en-US',
  rewardsApiUrl = 'https://api.rewards.test',
}: Partial<{
  fetchImpl: typeof fetch;
  getToken: (subId: string) => Promise<{ success: boolean; token?: string }>;
  environment: EnvironmentType;
  appType: 'mobile' | 'extension';
  version: string;
  locale: string;
  rewardsApiUrl: string;
}> = {}) => {
  mockGetSubscriptionToken.mockResolvedValue({
    success: true,
    token: 'test-bearer-token',
  });
  mockMessenger = {
    registerActionHandler: jest.fn(),
    call: jest.fn(),
  } as unknown as jest.Mocked<RewardsDataServiceMessenger>;

  const svc = new RewardsDataService({
    messenger: mockMessenger,
    fetch: fetchImpl,
    version,
    appType,
    locale,
    rewardsApiUrl,
    environment,
    getSubscriptionToken: getToken,
  });

  return { svc, mockMessenger, fetchImpl, getToken };
};

const mockSuccessfulFetch = successfulFetch as jest.MockedFunction<
  typeof successfulFetch
>;

describe('RewardsDataService', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let service: RewardsDataService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFetch = jest.fn();

    const { svc } = buildService({
      fetchImpl: mockFetch,
    });
    service = svc;
  });
  describe('initialization', () => {
    it('should register all action handlers', () => {
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:login',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:estimatePoints',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:getPerpsDiscount',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:logout',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:generateChallenge',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:getSeasonStatus',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:getReferralDetails',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:fetchGeoLocation',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:validateReferralCode',
        expect.any(Function),
      );
    });
  });

  describe('initialization with default values', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockFetch = jest.fn();
      // Create service with minimal params to use defaults
      new RewardsDataService({
        messenger: mockMessenger,
        fetch: mockFetch,
        version: '1.0.0',
        rewardsApiUrl: 'https://api.rewards.test',
        environment: EnvironmentType.Development,
        getSubscriptionToken: mockGetSubscriptionToken,
      });
    });
    it('should register all action handlers', () => {
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:login',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:estimatePoints',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:getPerpsDiscount',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:logout',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:generateChallenge',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:getSeasonStatus',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:getReferralDetails',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:fetchGeoLocation',
        expect.any(Function),
      );
      expect(mockMessenger.registerActionHandler).toHaveBeenCalledWith(
        'RewardsDataService:validateReferralCode',
        expect.any(Function),
      );
    });
  });

  describe('login', () => {
    const mockLoginRequest = {
      account: '0x123456789',
      timestamp: 1234567890,
      signature: '0xabcdef',
    };

    const mockLoginResponse: LoginResponseDto = {
      sessionId: 'test-session-id',
      subscription: {
        id: 'test-subscription-id',
        referralCode: 'test-referral-code',
        accounts: [],
      },
    };

    it('should successfully login', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockLoginResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      const result = await service.login(mockLoginRequest);

      expect(result).toStrictEqual(mockLoginResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/auth/mobile-login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockLoginRequest),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should handle login errors', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await expect(service.login(mockLoginRequest)).rejects.toThrow(
        'Login failed: 401',
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(service.login(mockLoginRequest)).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('estimatePoints', () => {
    const mockEstimateRequest: EstimatePointsDto = {
      activityType: 'SWAP',
      account: 'eip155:1:0x123',
      activityContext: {
        swapContext: {
          srcAsset: { id: 'eip155:1/slip44:60', amount: '1000000000000000000' },
          destAsset: {
            id: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            amount: '4500000000',
          },
          feeAsset: { id: 'eip155:1/slip44:60', amount: '5000000000000000' },
        },
      },
    };

    const mockEstimateResponse: EstimatedPointsDto = {
      pointsEstimate: 100,
      bonusBips: 500,
    };

    it('should successfully estimate points', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockEstimateResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      const result = await service.estimatePoints(mockEstimateRequest);

      expect(result).toStrictEqual(mockEstimateResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/points-estimation',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockEstimateRequest),
        }),
      );
    });

    it('should handle estimate points errors', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await expect(service.estimatePoints(mockEstimateRequest)).rejects.toThrow(
        'Points estimation failed: 400',
      );
    });
  });

  describe('getPerpsDiscount', () => {
    const testAddress = 'eip155:1:0x123456789' as CaipAccountId;

    it('should successfully get perps discount', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue('1,5.5'),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      const result = await service.getPerpsDiscount({
        account: testAddress as CaipAccountId,
      });

      expect(result).toStrictEqual({
        hasOptedIn: true,
        discount: 5.5,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.rewards.test/public/rewards/perps-fee-discount/${testAddress}`,
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should parse not opted in response', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue('0,10.0'),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      const result = await service.getPerpsDiscount({
        account: testAddress as CaipAccountId,
      });

      expect(result).toStrictEqual({
        hasOptedIn: false,
        discount: 10.0,
      });
    });

    it('should handle perps discount errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        service.getPerpsDiscount({ account: testAddress as CaipAccountId }),
      ).rejects.toThrow('Get Perps discount failed: 404');
    });

    it('should handle invalid response format', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue('invalid_format'),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        service.getPerpsDiscount({ account: testAddress as CaipAccountId }),
      ).rejects.toThrow(
        'Invalid perps discount response format: invalid_format',
      );
    });

    it('should handle when discount is not a number', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue('1, not_a_number'),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        service.getPerpsDiscount({ account: testAddress as CaipAccountId }),
      ).rejects.toThrow('Invalid perps discount values: optIn');
    });

    it('should handle when opt-in status is invalid', async () => {
      // "2" is not a valid opt-in status (should be 0 or 1)
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue('2, 10'),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        service.getPerpsDiscount({ account: testAddress as CaipAccountId }),
      ).rejects.toThrow('Invalid opt-in status: 2. Expected 0 or 1.');
    });
  });

  describe('timeout handling', () => {
    it('should handle request timeouts', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      await expect(
        service.login({
          account: '0x123',
          timestamp: 1234567890,
          signature: '0xabc',
        }),
      ).rejects.toThrow('Request timeout after 10000ms');
    });

    it('should include AbortSignal in requests', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await service.login({
        account: '0x123',
        timestamp: 1234567890,
        signature: '0xabc',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  describe('headers', () => {
    it('should include correct headers in requests', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await service.login({
        account: '0x123',
        timestamp: 1234567890,
        signature: '0xabc',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Accept-Language': 'en-US',
            'Content-Type': 'application/json',
            'rewards-client-id': 'mobile-1.0.0',
            // Should not include rewards-api-key header
          },
        }),
      );
    });
  });

  const mockSeasonStatusResponse: SeasonStatusDto = {
    season: {
      id: 'season-123',
      name: 'Test Season',
      startDate: new Date('2023-06-01T00:00:00Z'),
      endDate: new Date('2023-08-31T23:59:59Z'),
      tiers: [
        {
          id: 'tier-gold',
          name: 'Gold Tier',
          pointsNeeded: 1000,
        },
        {
          id: 'tier-silver',
          name: 'Silver Tier',
          pointsNeeded: 500,
        },
      ],
    },
    balance: {
      total: 1000,
      refereePortion: 500,
      updatedAt: new Date('2023-12-01T10:00:00Z'),
    },
    currentTierId: 'tier-gold',
  };

  describe('getSeasonStatus', () => {
    const mockSeasonId = 'season-123';
    const mockSubscriptionId = 'subscription-456';

    beforeEach(() => {
      // Mock successful fetch response for season status
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          season: {
            ...mockSeasonStatusResponse.season,
            startDate: '2023-06-01T00:00:00Z', // API returns strings, not Date objects
            endDate: '2023-08-31T23:59:59Z',
          },
          balance: {
            ...mockSeasonStatusResponse.balance,
            updatedAt: '2023-12-01T10:00:00Z', // API returns string, not Date
          },
          currentTierId: mockSeasonStatusResponse.currentTierId,
        }),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);
    });

    it('should successfully get season status', async () => {
      const result = await service.getSeasonStatus(
        mockSeasonId,
        mockSubscriptionId,
      );

      expect(result).toStrictEqual(mockSeasonStatusResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${RewardsApiUrl}/seasons/${mockSeasonId}/status`,
        {
          credentials: 'omit',
          method: 'GET',
          headers: {
            'Accept-Language': 'en-US',
            'Content-Type': 'application/json',
            'rewards-api-key': 'test-bearer-token',
            'rewards-client-id': 'mobile-1.0.0',
          },
          signal: expect.any(AbortSignal),
        },
      );
    });

    it('should convert date strings to Date objects', async () => {
      const result = await service.getSeasonStatus(
        mockSeasonId,
        mockSubscriptionId,
      );

      // Check balance updatedAt
      expect(result.balance.updatedAt).toBeInstanceOf(Date);
      expect(result.balance.updatedAt?.getTime()).toBe(
        new Date('2023-12-01T10:00:00Z').getTime(),
      );

      // Check season dates
      expect(result.season.startDate).toBeInstanceOf(Date);
      expect(result.season.startDate?.getTime()).toBe(
        new Date('2023-06-01T00:00:00Z').getTime(),
      );
      expect(result.season.endDate).toBeInstanceOf(Date);
      expect(result.season.endDate.getTime()).toBe(
        new Date('2023-08-31T23:59:59Z').getTime(),
      );
    });

    it('should include authentication headers with subscription token', async () => {
      await service.getSeasonStatus(mockSeasonId, mockSubscriptionId);

      expect(mockGetSubscriptionToken).toHaveBeenCalledWith(mockSubscriptionId);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'rewards-api-key': 'test-bearer-token',
            'rewards-client-id': 'mobile-1.0.0',
          }),
        }),
      );
    });

    it('should throw error when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        service.getSeasonStatus(mockSeasonId, mockSubscriptionId),
      ).rejects.toThrow('Get season status failed: 404');
    });

    it('should throw error when fetch fails', async () => {
      const fetchError = new Error('Network error');
      mockFetch.mockRejectedValue(fetchError);

      await expect(
        service.getSeasonStatus(mockSeasonId, mockSubscriptionId),
      ).rejects.toThrow('Network error');
    });

    it('should handle missing subscription token gracefully', async () => {
      // Mock token retrieval failure
      mockGetSubscriptionToken.mockResolvedValue({
        success: false,
        token: undefined,
      });

      const result = await service.getSeasonStatus(
        mockSeasonId,
        mockSubscriptionId,
      );

      expect(result).toStrictEqual(mockSeasonStatusResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'rewards-api-key': expect.any(String),
          }),
        }),
      );
    });
  });

  describe('generateChallenge', () => {
    it('generateChallenge() posts and returns JSON', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(okJsonResponse({ challengeId: 'c1', message: 'm' }));
      const { svc } = buildService({ fetchImpl });

      const res = await svc.generateChallenge({ address: '0xabc' });
      expect(res).toStrictEqual({ challengeId: 'c1', message: 'm' });
    });
    it('generateChallenge() throws on non-ok response', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 400 } as Response);
      const { svc } = buildService({ fetchImpl });

      await expect(svc.generateChallenge({ address: '0xabc' })).rejects.toThrow(
        'Generate challenge failed: 400',
      );
    });
  });

  describe('getReferralDetails', () => {
    const mockSubscriptionId = 'test-subscription-123';

    const mockReferralDetailsResponse: SubscriptionReferralDetailsDto = {
      referralCode: 'TEST123',
      totalReferees: 5,
    };

    beforeEach(() => {
      // Mock successful response for each test
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockReferralDetailsResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      service = buildService({
        fetchImpl: mockFetch,
        appType: 'mobile',
      }).svc;
    });

    it('should successfully get referral details', async () => {
      const result = await service.getReferralDetails(mockSubscriptionId);

      expect(result).toStrictEqual(mockReferralDetailsResponse);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/subscriptions/referral-details',
        expect.objectContaining({
          method: 'GET',
          credentials: 'omit',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'rewards-api-key': 'test-bearer-token',
            'rewards-client-id': 'mobile-1.0.0',
          }),
        }),
      );
    });

    it('should include subscription ID in token retrieval', async () => {
      await service.getReferralDetails(mockSubscriptionId);

      expect(mockGetSubscriptionToken).toHaveBeenCalledWith(mockSubscriptionId);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'rewards-api-key': 'test-bearer-token',
            'rewards-client-id': 'mobile-1.0.0',
          }),
        }),
      );
    });

    it('should throw error when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        service.getReferralDetails(mockSubscriptionId),
      ).rejects.toThrow('Get referral details failed: 404');
    });

    it('should throw error when fetch fails', async () => {
      const fetchError = new Error('Network error');
      mockFetch.mockRejectedValue(fetchError);

      await expect(
        service.getReferralDetails(mockSubscriptionId),
      ).rejects.toThrow('Network error');
    });

    it('should handle missing subscription token gracefully', async () => {
      // Mock token retrieval failure
      mockGetSubscriptionToken.mockResolvedValue({
        success: false,
        token: undefined,
      });

      const result = await service.getReferralDetails(mockSubscriptionId);

      expect(result).toStrictEqual(mockReferralDetailsResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'rewards-api-key': expect.any(String),
          }),
        }),
      );
    });

    it('should handle subscription token retrieval error', async () => {
      // Mock token retrieval throwing an error
      mockGetSubscriptionToken.mockRejectedValue(new Error('Token error'));

      const result = await service.getReferralDetails(mockSubscriptionId);

      expect(result).toStrictEqual(mockReferralDetailsResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'rewards-api-key': expect.any(String),
          }),
        }),
      );
    });

    it('should handle timeout correctly', async () => {
      // Mock fetch that never resolves (simulate timeout)
      mockFetch.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error('AbortError')), 100);
          }),
      );

      await expect(
        service.getReferralDetails(mockSubscriptionId),
      ).rejects.toThrow('AbortError');
    });
  });

  const mockLoginResponse: LoginResponseDto = {
    sessionId: 'test-session-id',
    subscription: {
      id: 'test-subscription-id',
      referralCode: 'test-referral-code',
      accounts: [],
    },
  };

  describe('Client Header', () => {
    it('should include rewards-client-id header in requests', async () => {
      // Mock successful response
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockLoginResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      await service.login({
        account: '0x123',
        timestamp: 1234567890,
        signature: '0xsignature',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/auth/mobile-login',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'rewards-client-id': 'mobile-1.0.0',
          }),
        }),
      );
    });
  });

  describe('Accept-Language Header', () => {
    it('should include Accept-Language header with default locale', async () => {
      // Arrange - service already initialized with default locale 'en-US'
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockLoginResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      await service.login({
        account: '0x123',
        timestamp: 1234567890,
        signature: '0xsignature',
      });

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/auth/mobile-login',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept-Language': 'en-US',
          }),
        }),
      );
    });

    it('should include Accept-Language header with custom locale', async () => {
      // Arrange - create service with custom locale
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockLoginResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      const { svc } = buildService({
        fetchImpl: mockFetch,
        appType: 'mobile',
        locale: 'es-ES',
      });

      const customLocaleService = svc;

      // Act
      await customLocaleService.login({
        account: '0x123',
        timestamp: 1234567890,
        signature: '0xsignature',
      });

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/auth/mobile-login',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept-Language': 'es-ES',
          }),
        }),
      );
    });

    it('should not include Accept-Language header when locale is empty', async () => {
      // Arrange - create service with empty locale
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockLoginResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);
      const { svc } = buildService({
        fetchImpl: mockFetch,
        appType: 'mobile',
        locale: '',
      });
      const emptyLocaleService = svc;

      // Act
      await emptyLocaleService.login({
        account: '0x123',
        timestamp: 1234567890,
        signature: '0xsignature',
      });

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/auth/mobile-login',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Accept-Language': expect.any(String),
          }),
        }),
      );
    });
  });

  describe('optin', () => {
    const mockOptinRequest = {
      challengeId: 'challenge-123',
      signature: '0xsignature123',
      referralCode: 'REF123',
    };

    it('should successfully perform optin', async () => {
      // Arrange
      const mockOptinResponse = {
        sessionId: 'session-456',
        subscription: {
          id: 'sub-789',
          referralCode: 'REF123',
          accounts: [],
        },
      };

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockOptinResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      const result = await service.optin(mockOptinRequest);

      // Assert
      expect(result).toStrictEqual(mockOptinResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockOptinRequest),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'rewards-client-id': 'mobile-1.0.0',
          }),
        }),
      );
    });

    it('should handle optin without referral code', async () => {
      // Arrange
      const requestWithoutReferral = {
        challengeId: 'challenge-123',
        signature: '0xsignature123',
      };

      const mockOptinResponse = {
        sessionId: 'session-456',
        subscription: {
          id: 'sub-789',
          referralCode: 'AUTO123',
          accounts: [],
        },
      };

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockOptinResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      const result = await service.optin(requestWithoutReferral);

      // Assert
      expect(result).toStrictEqual(mockOptinResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestWithoutReferral),
        }),
      );
    });

    it('should handle optin errors', async () => {
      // Arrange
      const mockResponse = {
        ok: false,
        status: 400,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(service.optin(mockOptinRequest)).rejects.toThrow(
        'Optin failed: 400',
      );
    });

    it('should handle network errors during optin', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(service.optin(mockOptinRequest)).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('logout', () => {
    const mockSubscriptionId = 'sub-123';

    beforeEach(() => {
      mockGetSubscriptionToken.mockResolvedValue({
        success: true,
        token: 'test-bearer-token',
      });
    });

    it('should successfully perform logout', async () => {
      // Arrange
      const mockResponse = {
        ok: true,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      await service.logout(mockSubscriptionId);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/auth/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'omit',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'rewards-api-key': 'test-bearer-token',
            'rewards-client-id': 'mobile-1.0.0',
          }),
        }),
      );
    });

    it('should perform logout without subscription ID', async () => {
      // Arrange
      const mockResponse = {
        ok: true,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      await service.logout();

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.not.objectContaining({
            'rewards-api-key': expect.any(String),
          }),
        }),
      );
    });

    it('should handle logout errors', async () => {
      // Arrange
      const mockResponse = {
        ok: false,
        status: 401,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(service.logout(mockSubscriptionId)).rejects.toThrow(
        'Logout failed: 401',
      );
    });

    it('should handle network errors during logout', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(service.logout(mockSubscriptionId)).rejects.toThrow(
        'Network error',
      );
    });

    it('should handle missing subscription token gracefully', async () => {
      // Arrange
      mockGetSubscriptionToken.mockResolvedValue({
        success: false,
        token: undefined,
      });

      const mockResponse = {
        ok: true,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      await service.logout(mockSubscriptionId);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/auth/logout',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'rewards-api-key': expect.any(String),
          }),
        }),
      );
    });
  });

  describe('fetchGeoLocation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should successfully fetch geolocation in DEV environment', async () => {
      // Arrange
      const mockLocation = 'US';
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue(mockLocation),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSuccessfulFetch.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.fetchGeoLocation();

      // Assert
      expect(result).toBe(mockLocation);
      expect(mockSuccessfulFetch).toHaveBeenCalledWith(
        'https://on-ramp.dev-api.cx.metamask.io/geolocation',
      );
    });

    it('should successfully fetch geolocation in PROD environment', async () => {
      // Arrange
      service = buildService({
        environment: EnvironmentType.Production,
      }).svc;
      const mockLocation = 'US';
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue(mockLocation),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSuccessfulFetch.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.fetchGeoLocation();

      // Assert
      expect(result).toBe(mockLocation);
      expect(mockSuccessfulFetch).toHaveBeenCalledWith(
        'https://on-ramp.api.cx.metamask.io/geolocation',
      );
    });

    it('should return UNKNOWN when geolocation request fails', async () => {
      // Arrange
      const mockResponse = {
        ok: false,
        status: 500,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSuccessfulFetch.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.fetchGeoLocation();

      // Assert
      expect(result).toBe('UNKNOWN');
    });

    it('should return UNKNOWN when network error occurs', async () => {
      // Arrange
      mockSuccessfulFetch.mockRejectedValue(new Error('Network error'));

      // Act
      const result = await service.fetchGeoLocation();

      // Assert
      expect(result).toBe('UNKNOWN');
    });

    it('should return UNKNOWN when response text parsing fails', async () => {
      // Arrange
      const mockResponse = {
        ok: true,
        text: jest.fn().mockRejectedValue(new Error('Parse error')),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSuccessfulFetch.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.fetchGeoLocation();

      // Assert
      expect(result).toBe('UNKNOWN');
      expect(logSpy).toHaveBeenCalledWith(
        'RewardsDataService: Failed to fetch geoloaction',
        expect.any(Error),
      );
    });

    it('should return location string from response', async () => {
      // Arrange
      const mockLocation = 'UK';
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue(mockLocation),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSuccessfulFetch.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.fetchGeoLocation();

      // Assert
      expect(result).toBe(mockLocation);
    });
  });

  describe('validateReferralCode', () => {
    it('should successfully validate a referral code', async () => {
      // Arrange
      const referralCode = 'ABC123';
      const mockValidationResponse = { valid: true };

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockValidationResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      const result = await service.validateReferralCode(referralCode);

      // Assert
      expect(result).toStrictEqual(mockValidationResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/referral/validate?code=ABC123',
        expect.objectContaining({
          method: 'GET',
          credentials: 'omit',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'rewards-client-id': 'mobile-1.0.0',
          }),
        }),
      );
    });

    it('should return invalid response for invalid codes', async () => {
      // Arrange
      const referralCode = 'INVALID';
      const mockValidationResponse = { valid: false };

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockValidationResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      const result = await service.validateReferralCode(referralCode);

      // Assert
      expect(result).toStrictEqual(mockValidationResponse);
      expect(result.valid).toBe(false);
    });

    it('should properly encode special characters in referral code', async () => {
      // Arrange
      const referralCode = 'A+B/C=';
      const mockValidationResponse = { valid: true };

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockValidationResponse),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      const result = await service.validateReferralCode(referralCode);

      // Assert
      expect(result).toStrictEqual(mockValidationResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rewards.test/referral/validate?code=A%2BB%2FC%3D',
        expect.any(Object),
      );
    });

    it('should handle validation errors', async () => {
      // Arrange
      const referralCode = 'ABC123';
      const mockResponse = {
        ok: false,
        status: 400,
      } as Response;
      mockFetch.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(service.validateReferralCode(referralCode)).rejects.toThrow(
        'Failed to validate referral code. Please try again shortly.',
      );
    });

    it('should handle network errors during validation', async () => {
      // Arrange
      const referralCode = 'ABC123';
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(service.validateReferralCode(referralCode)).rejects.toThrow(
        'Network error',
      );
    });

    it('should handle timeout errors during validation', async () => {
      // Arrange
      const referralCode = 'ABC123';
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      // Act & Assert
      await expect(service.validateReferralCode(referralCode)).rejects.toThrow(
        'Request timeout after 10000ms',
      );
    });
  });
});
