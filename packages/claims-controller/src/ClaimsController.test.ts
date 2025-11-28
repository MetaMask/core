import { toHex } from '@metamask/controller-utils';

import { ClaimsController } from './ClaimsController';
import { ClaimsControllerErrorMessages, ClaimStatusEnum } from './constants';
import type {
  Claim,
  ClaimsConfigurationsResponse,
  CreateClaimRequest,
} from './types';
import { createMockClaimsControllerMessenger } from '../tests/mocks/messenger';
import type { WithControllerArgs } from '../tests/types';

const mockClaimServiceRequestHeaders = jest.fn();
const mockClaimServiceGetClaimsApiUrl = jest.fn();
const mockClaimServiceGenerateMessageForClaimSignature = jest.fn();
const mockKeyringControllerSignPersonalMessage = jest.fn();
const mockClaimsServiceGetClaims = jest.fn();
const mockClaimsServiceFetchClaimsConfigurations = jest.fn();

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
  const { messenger, rootMessenger } = createMockClaimsControllerMessenger({
    mockClaimServiceRequestHeaders,
    mockClaimServiceGetClaimsApiUrl,
    mockClaimServiceGenerateMessageForClaimSignature,
    mockKeyringControllerSignPersonalMessage,
    mockClaimsServiceGetClaims,
    mockClaimsServiceFetchClaimsConfigurations,
  });

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

  describe('fetchClaimsConfigurations', () => {
    const MOCK_CONFIGURATIONS_RESPONSE: ClaimsConfigurationsResponse = {
      validSubmissionWindowDays: 21,
      networks: [1, 5, 11155111],
    };

    beforeEach(() => {
      jest.resetAllMocks();

      mockClaimsServiceFetchClaimsConfigurations.mockResolvedValueOnce(
        MOCK_CONFIGURATIONS_RESPONSE,
      );
    });

    it('should fetch claims configurations successfully', async () => {
      await withController(async ({ controller }) => {
        const initialState = controller.state;
        const configurations = await controller.fetchClaimsConfigurations();
        expect(configurations).toBeDefined();

        const expectedConfigurations = {
          validSubmissionWindowDays:
            MOCK_CONFIGURATIONS_RESPONSE.validSubmissionWindowDays,
          supportedNetworks: MOCK_CONFIGURATIONS_RESPONSE.networks.map(
            (network) => toHex(network),
          ),
        };

        expect(configurations).toStrictEqual(expectedConfigurations);
        expect(controller.state).not.toBe(initialState);
        expect(
          controller.state.claimsConfigurations.validSubmissionWindowDays,
        ).toBe(MOCK_CONFIGURATIONS_RESPONSE.validSubmissionWindowDays);
        expect(
          controller.state.claimsConfigurations.supportedNetworks,
        ).toStrictEqual(expectedConfigurations.supportedNetworks);
      });
    });
  });

  describe('getSubmitClaimConfig', () => {
    const MOCK_CLAIM: CreateClaimRequest = {
      chainId: '0x1',
      email: 'test@test.com',
      impactedWalletAddress: '0x123',
      impactedTxHash: '0x123',
      reimbursementWalletAddress: '0x456',
      description: 'test description',
      signature:
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    };
    const MOCK_CLAIM_API = 'https://claims-api.test.com';
    const MOCK_HEADERS = {
      Authorization: 'Bearer test-token',
    };

    beforeEach(() => {
      jest.resetAllMocks();

      mockClaimServiceRequestHeaders.mockResolvedValueOnce(MOCK_HEADERS);
      mockClaimServiceGetClaimsApiUrl.mockReturnValueOnce(MOCK_CLAIM_API);
    });

    it('should be able to generate valid submit claim config', async () => {
      await withController(async ({ controller }) => {
        const submitClaimConfig =
          await controller.getSubmitClaimConfig(MOCK_CLAIM);

        expect(mockClaimServiceRequestHeaders).toHaveBeenCalledTimes(1);
        expect(mockClaimServiceGetClaimsApiUrl).toHaveBeenCalledTimes(1);

        expect(submitClaimConfig).toBeDefined();
        expect(submitClaimConfig.headers).toStrictEqual(MOCK_HEADERS);
        expect(submitClaimConfig.method).toBe('POST');
        expect(submitClaimConfig.url).toBe(`${MOCK_CLAIM_API}/claims`);
      });
    });

    it('should throw an error if the claim is already submitted', async () => {
      await withController(
        {
          state: {
            claims: [
              {
                ...MOCK_CLAIM,
                status: ClaimStatusEnum.SUBMITTED,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                id: 'mock-claim-1',
                shortId: 'mock-claim-1',
              },
            ],
          },
        },
        async ({ controller }) => {
          await expect(
            controller.getSubmitClaimConfig(MOCK_CLAIM),
          ).rejects.toThrow(
            ClaimsControllerErrorMessages.CLAIM_ALREADY_SUBMITTED,
          );
        },
      );
    });
  });

  describe('generateClaimSignature', () => {
    const MOCK_WALLET_ADDRESS = '0x88069b650422308bf8b472bEaF790189f3f28309';
    const MOCK_SIWE_MESSAGE =
      'metamask.io wants you to sign in with your Ethereum account:\n0x88069b650422308bf8b472bEaF790189f3f28309\n\nSign in to MetaMask Shield Claims API\n\nURI: https://metamask.io\nVersion: 1\nChain ID: 1\nNonce: B4Y8k8lGdMml0nrqk\nIssued At: 2025-11-06T16:38:08.073Z\nExpiration Time: 2025-11-06T17:38:08.073Z';
    const MOCK_CLAIM_SIGNATURE = '0xdeadbeef';

    beforeEach(() => {
      jest.resetAllMocks();

      mockClaimServiceGenerateMessageForClaimSignature.mockResolvedValueOnce({
        message: MOCK_SIWE_MESSAGE,
        nonce: 'B4Y8k8lGdMml0nrqk',
      });
      mockKeyringControllerSignPersonalMessage.mockResolvedValueOnce(
        MOCK_CLAIM_SIGNATURE,
      );
    });

    it('should generate a message and signature successfully', async () => {
      await withController(async ({ controller }) => {
        const signature = await controller.generateClaimSignature(
          1,
          MOCK_WALLET_ADDRESS,
        );
        expect(signature).toBe(MOCK_CLAIM_SIGNATURE);
        expect(
          mockClaimServiceGenerateMessageForClaimSignature,
        ).toHaveBeenCalledWith(1, MOCK_WALLET_ADDRESS);
      });
    });

    it('should throw an error if claims API response with invalid SIWE message', async () => {
      await withController(async ({ controller }) => {
        mockClaimServiceGenerateMessageForClaimSignature.mockRestore();
        mockClaimServiceGenerateMessageForClaimSignature.mockResolvedValueOnce({
          message: 'invalid SIWE message',
          nonce: 'B4Y8k8lGdMml0nrqk',
        });
        await expect(
          controller.generateClaimSignature(1, MOCK_WALLET_ADDRESS),
        ).rejects.toThrow(
          ClaimsControllerErrorMessages.INVALID_SIGNATURE_MESSAGE,
        );
      });
    });
  });

  describe('getClaims', () => {
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

    it('should be able to get the list of claims', async () => {
      await withController(async ({ controller }) => {
        mockClaimsServiceGetClaims.mockResolvedValueOnce([
          MOCK_CLAIM_1,
          MOCK_CLAIM_2,
        ]);
        const claims = await controller.getClaims();
        expect(claims).toBeDefined();
        expect(claims).toStrictEqual([MOCK_CLAIM_1, MOCK_CLAIM_2]);
        expect(mockClaimsServiceGetClaims).toHaveBeenCalledTimes(1);
        expect(controller.state.claims).toStrictEqual([
          MOCK_CLAIM_1,
          MOCK_CLAIM_2,
        ]);
      });
    });
  });
});
