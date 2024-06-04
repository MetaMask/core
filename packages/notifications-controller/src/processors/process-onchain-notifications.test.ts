import {
  createMockNotificationEthSent,
  createMockNotificationEthReceived,
  createMockNotificationERC20Sent,
  createMockNotificationERC20Received,
  createMockNotificationERC721Sent,
  createMockNotificationERC721Received,
  createMockNotificationERC1155Sent,
  createMockNotificationERC1155Received,
  createMockNotificationMetaMaskSwapsCompleted,
  createMockNotificationRocketPoolStakeCompleted,
  createMockNotificationRocketPoolUnStakeCompleted,
  createMockNotificationLidoStakeCompleted,
  createMockNotificationLidoWithdrawalRequested,
  createMockNotificationLidoWithdrawalCompleted,
  createMockNotificationLidoReadyToBeWithdrawn,
} from '../../tests/mocks/mock-raw-notifications';
import type { OnChainRawNotification } from '../types/on-chain-notification/on-chain-notification';
import { processOnChainNotification } from './process-onchain-notifications';

const rawNotifications = [
  createMockNotificationEthSent(),
  createMockNotificationEthReceived(),
  createMockNotificationERC20Sent(),
  createMockNotificationERC20Received(),
  createMockNotificationERC721Sent(),
  createMockNotificationERC721Received(),
  createMockNotificationERC1155Sent(),
  createMockNotificationERC1155Received(),
  createMockNotificationMetaMaskSwapsCompleted(),
  createMockNotificationRocketPoolStakeCompleted(),
  createMockNotificationRocketPoolUnStakeCompleted(),
  createMockNotificationLidoStakeCompleted(),
  createMockNotificationLidoWithdrawalRequested(),
  createMockNotificationLidoWithdrawalCompleted(),
  createMockNotificationLidoReadyToBeWithdrawn(),
];

const rawNotificationTestSuite = rawNotifications.map(
  (n): [string, OnChainRawNotification] => [n.type, n],
);

describe('process-onchain-notifications - processOnChainNotification()', () => {
  it.each(rawNotificationTestSuite)(
    'converts Raw On-Chain Notification (%s) to a shared Notification Type',
    (_, rawNotification) => {
      const result = processOnChainNotification(rawNotification);
      expect(result.id).toBe(rawNotification.id);
      expect(result.type).toBe(rawNotification.type);
    },
  );
});
