import {
  NotificationConfig,
  NotificationState,
  NotificationController,
  StateNotificationMap,
} from '../src/notification/NotificationController';

const config1: NotificationConfig = {
  allNotifications: {
    1: {
      id: 1,
      title: 'Now Swap tokens directly in your wallet!',
      description:
        'MetaMask now aggregates multiple decentralized exchange aggregators to ensure you always get the best swap price with the lowest netwrok fees.',
      date: '12/8/2020',
      image: 'image url',
      actionText: 'Start swapping',
    },
    2: {
      id: 2,
      title: 'MetaMask Mobile is here!',
      description:
        'Sync with your extension wallet in seconds. Scan the QR code with your mobile camera to download the app.',
      date: '12/8/2020',
      actionText: 'Get the mobile app',
    },
  },
};

const config2: NotificationConfig = {
  allNotifications: {
    1: {
      id: 1,
      title: 'Now Swap tokens directly in your wallet!',
      description:
        'MetaMask now aggregates multiple decentralized exchange aggregators to ensure you always get the best swap price with the lowest netwrok fees.',
      date: '12/8/2020',
      image: 'image url',
      actionText: 'Start swapping',
    },
    2: {
      id: 2,
      title: 'MetaMask Mobile is here!',
      description:
        'Sync with your extension wallet in seconds. Scan the QR code with your mobile camera to download the app.',
      date: '12/8/2020',
      actionText: 'Get the mobile app',
    },
    3: {
      id: 3,
      title: 'Help improve MetaMask',
      description: 'Please shae your experience in this 5 minute survey',
      date: '12/8/2020',
      actionText: 'Start Survey',
    },
  },
};

const state1: NotificationState = {
  notifications: {
    1: {
      id: 1,
      title: 'Now Swap tokens directly in your wallet!',
      description:
        'MetaMask now aggregates multiple decentralized exchange aggregators to ensure you always get the best swap price with the lowest netwrok fees.',
      date: '12/8/2020',
      image: 'image url',
      actionText: 'Start swapping',
      isShown: true,
    },
    2: {
      id: 2,
      title: 'MetaMask Mobile is here!',
      description:
        'Sync with your extension wallet in seconds. Scan the QR code with your mobile camera to download the app.',
      date: '12/8/2020',
      actionText: 'Get the mobile app',
      isShown: true,
    },
  },
};

describe('notification controller', () => {
  it('should add notifications to state', () => {
    const controller = new NotificationController(config1);
    expect(Object.keys(controller.state.notifications)).toHaveLength(2);
    const expectedStateNotifications: StateNotificationMap = {
      1: {
        ...config1.allNotifications[1],
        isShown: false,
      },
      2: {
        ...config1.allNotifications[2],
        isShown: false,
      },
    };
    expect(controller.state.notifications).toEqual(expectedStateNotifications);
  });

  it('should add new notifcation to state', () => {
    const controller = new NotificationController(config2, state1);
    expect(Object.keys(controller.state.notifications)).toHaveLength(3);
    expect(controller.state.notifications[1].isShown).toBe(true);
    expect(controller.state.notifications[2].isShown).toBe(true);
    expect(controller.state.notifications[3].isShown).toBe(false);
  });

  describe('update viewed notifications', () => {
    it('should update isShown status', () => {
      const controller = new NotificationController(config2);
      controller.updateViewed({ 1: true });
      expect(controller.state.notifications[1].isShown).toBe(true);
      expect(controller.state.notifications[2].isShown).toBe(false);
      expect(controller.state.notifications[3].isShown).toBe(false);
    });

    it('should update isShown of more than one notifications', () => {
      const controller = new NotificationController(config2);
      controller.updateViewed({ 2: true, 3: true });
      expect(controller.state.notifications[1].isShown).toBe(false);
      expect(controller.state.notifications[2].isShown).toBe(true);
      expect(controller.state.notifications[3].isShown).toBe(true);
    });
  });
});
