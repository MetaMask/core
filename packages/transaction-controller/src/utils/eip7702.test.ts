import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { Hex } from '@metamask/utils';
import { remove0x } from '@metamask/utils';

import type {
  FeatureFlagsEIP7702,
  KeyringControllerSignAuthorization,
} from './eip7702';
import {
  DELEGATION_PREFIX,
  FEATURE_FLAG_EIP_7702,
  doesChainSupportEIP7702,
  isAccountUpgradedToEIP7702,
  signAuthorizationList,
} from './eip7702';
import { Messenger } from '../../../base-controller/src';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { AuthorizationList } from '../types';
import { TransactionStatus, type TransactionMeta } from '../types';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

const CHAIN_ID_MOCK = '0xab12';
const CHAIN_ID_2_MOCK = '0x456';
const ADDRESS_MOCK = '0x1234567890123456789012345678901234567890';
const ADDRESS_2_MOCK = '0x0987654321098765432109876543210987654321';
const ADDRESS_3_MOCK = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const ETH_QUERY_MOCK = {} as EthQuery;

const AUTHORIZATION_SIGNATURE_MOCK =
  '0xf85c827a6994663f3ad617193148711d28f5334ee4ed070166028080a040e292da533253143f134643a03405f1af1de1d305526f44ed27e62061368d4ea051cfb0af34e491aa4d6796dececf95569088322e116c4b2f312bb23f20699269';

const AUTHORIZATION_SIGNATURE_2_MOCK =
  '0x82d5b4845dfc808802480749c30b0e02d6d7817061ba141d2d1dcd520f9b65c59d0b985134dc2958a9981ce3b5d1061176313536e6da35852cfae41404f53ef31b624206f3bc543ca6710e02d58b909538d6e2445cea94dfd39737fbc0b3';

const TRANSACTION_META_MOCK: TransactionMeta = {
  chainId: CHAIN_ID_MOCK,
  id: '123-456',
  networkClientId: 'network-client-id',
  status: TransactionStatus.unapproved,
  time: 1234567890,
  txParams: {
    from: '0x',
    nonce: '0x123',
  },
};

const AUTHORIZATION_LIST_MOCK: AuthorizationList = [
  {
    address: '0x1234567890123456789012345678901234567890',
    chainId: CHAIN_ID_2_MOCK,
    nonce: '0x456',
  },
];

describe('EIP-7702 Utils', () => {
  let baseMessenger: Messenger<
    | KeyringControllerSignAuthorization
    | RemoteFeatureFlagControllerGetStateAction,
    never
  >;

  const getCodeMock = jest.mocked(query);
  let controllerMessenger: TransactionControllerMessenger;

  let signAuthorizationMock: jest.MockedFn<
    KeyringControllerSignAuthorization['handler']
  >;

  let getFeatureFlagsMock: jest.MockedFunction<
    RemoteFeatureFlagControllerGetStateAction['handler']
  >;

  /**
   * Mock the EIP-7702 feature flags.
   *
   * @param featureFlags - The feature flags to mock.
   */
  function mockFeatureFlags(featureFlags: FeatureFlagsEIP7702) {
    getFeatureFlagsMock.mockReturnValueOnce({
      cacheTimestamp: 1234567890,
      remoteFeatureFlags: {
        [FEATURE_FLAG_EIP_7702]: featureFlags,
      },
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    baseMessenger = new Messenger();

    signAuthorizationMock = jest
      .fn()
      .mockResolvedValue(AUTHORIZATION_SIGNATURE_MOCK);

    getFeatureFlagsMock = jest.fn();

    baseMessenger.registerActionHandler(
      'KeyringController:signAuthorization',
      signAuthorizationMock,
    );

    baseMessenger.registerActionHandler(
      'RemoteFeatureFlagController:getState',
      getFeatureFlagsMock,
    );

    controllerMessenger = baseMessenger.getRestricted({
      name: 'TransactionController',
      allowedActions: [
        'KeyringController:signAuthorization',
        'RemoteFeatureFlagController:getState',
      ],
      allowedEvents: [],
    });
  });

  describe('signAuthorizationList', () => {
    it('returns undefined if no authorization list is provided', async () => {
      expect(
        await signAuthorizationList({
          authorizationList: undefined,
          messenger: controllerMessenger,
          transactionMeta: TRANSACTION_META_MOCK,
        }),
      ).toBeUndefined();
    });

    it('populates signature properties', async () => {
      const result = await signAuthorizationList({
        authorizationList: AUTHORIZATION_LIST_MOCK,
        messenger: controllerMessenger,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(result).toStrictEqual([
        {
          address: AUTHORIZATION_LIST_MOCK[0].address,
          chainId: AUTHORIZATION_LIST_MOCK[0].chainId,
          nonce: AUTHORIZATION_LIST_MOCK[0].nonce,
          r: '0xf85c827a6994663f3ad617193148711d28f5334ee4ed070166028080a040e292',
          s: '0xda533253143f134643a03405f1af1de1d305526f44ed27e62061368d4ea051cf',
          yParity: '0x1',
        },
      ]);
    });

    it('populates signature properties for multiple authorizations', async () => {
      signAuthorizationMock
        .mockReset()
        .mockResolvedValueOnce(AUTHORIZATION_SIGNATURE_MOCK)
        .mockResolvedValueOnce(AUTHORIZATION_SIGNATURE_2_MOCK);

      const result = await signAuthorizationList({
        authorizationList: [
          AUTHORIZATION_LIST_MOCK[0],
          AUTHORIZATION_LIST_MOCK[0],
        ],
        messenger: controllerMessenger,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(result).toStrictEqual([
        {
          address: AUTHORIZATION_LIST_MOCK[0].address,
          chainId: AUTHORIZATION_LIST_MOCK[0].chainId,
          nonce: AUTHORIZATION_LIST_MOCK[0].nonce,
          r: '0xf85c827a6994663f3ad617193148711d28f5334ee4ed070166028080a040e292',
          s: '0xda533253143f134643a03405f1af1de1d305526f44ed27e62061368d4ea051cf',
          yParity: '0x1',
        },
        {
          address: AUTHORIZATION_LIST_MOCK[0].address,
          chainId: AUTHORIZATION_LIST_MOCK[0].chainId,
          nonce: AUTHORIZATION_LIST_MOCK[0].nonce,
          r: '0x82d5b4845dfc808802480749c30b0e02d6d7817061ba141d2d1dcd520f9b65c5',
          s: '0x9d0b985134dc2958a9981ce3b5d1061176313536e6da35852cfae41404f53ef3',
          yParity: '0x',
        },
      ]);
    });

    it('uses transaction chain ID if not specified', async () => {
      const result = await signAuthorizationList({
        authorizationList: [
          { ...AUTHORIZATION_LIST_MOCK[0], chainId: undefined },
        ],
        messenger: controllerMessenger,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(result?.[0]?.chainId).toStrictEqual(TRANSACTION_META_MOCK.chainId);
    });

    it('uses transaction nonce + 1 if not specified', async () => {
      const result = await signAuthorizationList({
        authorizationList: [
          { ...AUTHORIZATION_LIST_MOCK[0], nonce: undefined },
        ],
        messenger: controllerMessenger,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(result?.[0]?.nonce).toBe('0x124');
    });

    it('uses incrementing transaction nonce for multiple authorizations if not specified', async () => {
      const result = await signAuthorizationList({
        authorizationList: [
          { ...AUTHORIZATION_LIST_MOCK[0], nonce: undefined },
          { ...AUTHORIZATION_LIST_MOCK[0], nonce: undefined },
          { ...AUTHORIZATION_LIST_MOCK[0], nonce: undefined },
        ],
        messenger: controllerMessenger,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(result?.[0]?.nonce).toBe('0x124');
      expect(result?.[1]?.nonce).toBe('0x125');
      expect(result?.[2]?.nonce).toBe('0x126');
    });

    it('normalizes nonce to 0x if zero', async () => {
      const result = await signAuthorizationList({
        authorizationList: [{ ...AUTHORIZATION_LIST_MOCK[0], nonce: '0x0' }],
        messenger: controllerMessenger,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(result?.[0]?.nonce).toBe('0x');
    });
  });

  describe('doesChainSupportEIP7702', () => {
    it('returns true if chain ID in feature flag list', () => {
      mockFeatureFlags({
        supportedChains: [CHAIN_ID_2_MOCK, CHAIN_ID_MOCK],
      });

      expect(doesChainSupportEIP7702(CHAIN_ID_MOCK, controllerMessenger)).toBe(
        true,
      );
    });

    it('returns false if chain ID not in feature flag list', () => {
      mockFeatureFlags({
        supportedChains: [CHAIN_ID_2_MOCK],
      });

      expect(doesChainSupportEIP7702(CHAIN_ID_MOCK, controllerMessenger)).toBe(
        false,
      );
    });

    it('returns true if chain ID in feature flag list with alternate case', () => {
      mockFeatureFlags({
        supportedChains: [CHAIN_ID_2_MOCK, CHAIN_ID_MOCK.toUpperCase() as Hex],
      });

      expect(doesChainSupportEIP7702(CHAIN_ID_MOCK, controllerMessenger)).toBe(
        true,
      );
    });
  });

  describe('isAccountUpgradedToEIP7702', () => {
    it('returns true if delegation matches feature flag', async () => {
      mockFeatureFlags({
        contractAddresses: {
          [CHAIN_ID_MOCK]: [ADDRESS_2_MOCK],
        },
      });

      getCodeMock.mockResolvedValueOnce(
        `${DELEGATION_PREFIX}${remove0x(ADDRESS_2_MOCK)}`,
      );

      expect(
        await isAccountUpgradedToEIP7702(
          ADDRESS_MOCK,
          CHAIN_ID_MOCK,
          controllerMessenger,
          ETH_QUERY_MOCK,
        ),
      ).toStrictEqual({
        delegationAddress: ADDRESS_2_MOCK,
        isSupported: true,
      });
    });

    it('returns true if delegation matches feature flag with alternate case', async () => {
      mockFeatureFlags({
        contractAddresses: {
          [CHAIN_ID_MOCK]: [ADDRESS_3_MOCK.toUpperCase() as Hex],
        },
      });

      getCodeMock.mockResolvedValueOnce(
        `${DELEGATION_PREFIX}${remove0x(ADDRESS_3_MOCK)}`,
      );

      expect(
        await isAccountUpgradedToEIP7702(
          ADDRESS_MOCK,
          CHAIN_ID_MOCK.toUpperCase() as Hex,
          controllerMessenger,
          ETH_QUERY_MOCK,
        ),
      ).toStrictEqual({
        delegationAddress: ADDRESS_3_MOCK,
        isSupported: true,
      });
    });

    it('returns false if delegation does not match feature flag', async () => {
      mockFeatureFlags({
        contractAddresses: {
          [CHAIN_ID_MOCK]: [ADDRESS_3_MOCK],
        },
      });

      getCodeMock.mockResolvedValueOnce(
        `${DELEGATION_PREFIX}${remove0x(ADDRESS_2_MOCK)}`,
      );

      expect(
        await isAccountUpgradedToEIP7702(
          ADDRESS_MOCK,
          CHAIN_ID_MOCK,
          controllerMessenger,
          ETH_QUERY_MOCK,
        ),
      ).toStrictEqual({
        delegationAddress: ADDRESS_2_MOCK,
        isSupported: false,
      });
    });
  });
});
