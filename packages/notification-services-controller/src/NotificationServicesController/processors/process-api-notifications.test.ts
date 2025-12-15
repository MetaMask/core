import { processAPINotifications } from './process-api-notifications';
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
  createMockPlatformNotification,
} from '../mocks/mock-raw-notifications';

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
  createMockPlatformNotification(),
];

const rawNotificationTestSuite = rawNotifications.map(
  (notification) => [notification.type, notification] as const,
);

describe('process-onchain-notifications - processOnChainNotification()', () => {
  it.each(rawNotificationTestSuite)(
    'converts Raw On-Chain Notification (%s) to a shared Notification Type',
    (_, rawNotification) => {
      const result = processAPINotifications(rawNotification);
      expect(result.id).toBe(rawNotification.id);
      expect(result.type).toBe(rawNotification.type);
    },
  );
});
