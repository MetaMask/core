import type { KeyringControllerSignAuthorization } from './eip7702';
import { signAuthorizationList } from './eip7702';
import type { Messenger } from '../../../base-controller/src';
import { ControllerMessenger } from '../../../base-controller/src';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { AuthorizationList } from '../types';
import { TransactionStatus, type TransactionMeta } from '../types';

const AUTHORIZATION_SIGNATURE_MOCK =
  '0xf85c827a6994663f3ad617193148711d28f5334ee4ed070166028080a040e292da533253143f134643a03405f1af1de1d305526f44ed27e62061368d4ea051cfb0af34e491aa4d6796dececf95569088322e116c4b2f312bb23f20699269';

const TRANSACTION_META_MOCK: TransactionMeta = {
  chainId: '0x1',
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
    chainId: '0x123',
    nonce: '0x456',
  },
];

describe('EIP-7702 Utils', () => {
  let baseMessenger: Messenger<KeyringControllerSignAuthorization, never>;
  let controllerMessenger: TransactionControllerMessenger;

  beforeEach(() => {
    baseMessenger = new ControllerMessenger<
      KeyringControllerSignAuthorization,
      never
    >();

    baseMessenger.registerActionHandler(
      'KeyringController:signAuthorization',
      async () => {
        return AUTHORIZATION_SIGNATURE_MOCK;
      },
    );

    controllerMessenger = baseMessenger.getRestricted({
      name: 'TransactionController',
      allowedActions: ['KeyringController:signAuthorization'],
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
          address: '0x1234567890123456789012345678901234567890',
          chainId: '0x123',
          nonce: '0x456',
          r: '0xf85c827a6994663f3ad617193148711d28f5334ee4ed070166028080a040e292',
          s: '0xda533253143f134643a03405f1af1de1d305526f44ed27e62061368d4ea051cf',
          yParity: '0x1',
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
  });
});
