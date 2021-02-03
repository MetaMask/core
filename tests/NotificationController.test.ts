import {
  NotificationConfig,
  NotificationController,
  NotificationState,
} from '../src/notification/NotificationController';

const swapsHandler = () => console.log('swaps');
const mobileHandler = () => console.log('mobile');
const npsHandler = () => console.log('NPS survey');
const config1: NotificationConfig = {
  allNotifications: [
    {
      id: 1,
      title: 'Now Swap tokens directly in your wallet!',
      description:
        'MetaMask now aggregates multiple decentralized exchange aggregators to ensure you always get the best swap price with the lowest netwrok fees.',
      date: '12/8/2020',
      image: 'image url',
      actionText: 'Start swapping',
      actionFunction: swapsHandler,
    },
    {
      id: 2,
      title: 'MetaMask Mobile is here!',
      description:
        'Sync with your extension wallet in seconds. Scan the QR code with your mobile camera to download the app.',
      date: '12/8/2020',
      actionText: 'Get the mobile app',
      actionFunction: mobileHandler,
    },
  ],
};

const config2: NotificationConfig = {
  allNotifications: [
    {
      id: 1,
      title: 'Now Swap tokens directly in your wallet!',
      description:
        'MetaMask now aggregates multiple decentralized exchange aggregators to ensure you always get the best swap price with the lowest netwrok fees.',
      date: '12/8/2020',
      actionText: 'Start swapping',
    },
    {
      id: 2,
      title: 'MetaMask Mobile is here!',
      description:
        'Sync with your extension wallet in seconds. Scan the QR code with your mobile camera to download the app.',
      date: '12/8/2020',
      image: 'image url',
      actionText: 'Get the mobile app',
    },
  ],
};

const config3: NotificationConfig = {
  allNotifications: [
    {
      id: 1,
      title: 'Now Swap tokens directly in your wallet!',
      description:
        'MetaMask now aggregates multiple decentralized exchange aggregators to ensure you always get the best swap price with the lowest netwrok fees.',
      date: '12/8/2020',
      image: 'image url',
      actionText: 'Start swapping',
      actionFunction: swapsHandler,
    },
    {
      id: 2,
      title: 'MetaMask Mobile is here!',
      description:
        'Sync with your extension wallet in seconds. Scan the QR code with your mobile camera to download the app.',
      date: '12/8/2020',
      actionText: 'Get the mobile app',
      actionFunction: mobileHandler,
    },
    {
      id: 3,
      title: 'NPS Survey',
      description: 'Take NPS survey here',
      date: '12/8/2020',
      actionText: 'Take the Survey',
      actionFunction: npsHandler,
    },
  ],
};

describe('notification controller', () => {
  let state: NotificationState;
  it('should add notifications to state', () => {
    const controller = new NotificationController(config1);
    expect(Object.keys(controller.state.notifications)).toHaveLength(2);
    state = controller.state;
  });
  it('should not add new notifcation to state when actiontion is not present', () => {
    try {
      new NotificationController(config2);
    } catch (error) {
      expect(error.message).toEqual('Must have an actionFunction for an actionText.');
    }
  });

  let controller: NotificationController;
  it('should add new notifcation to state', () => {
    controller = new NotificationController(config3, state);
    expect(Object.keys(controller.state.notifications)).toHaveLength(3);
  });

  describe('calling the actionFunction', () => {
    it('should return the actionFunction corresponding to the id', () => {
      expect(controller.actionCall(1)).toEqual(swapsHandler);
      expect(controller.actionCall(2)).toEqual(mobileHandler);
      expect(controller.actionCall(3)).toEqual(npsHandler);
      expect(controller.actionCall(4)).toBeNull();
    });
  });
  describe('update viewed notifications', () => {
    it('should update isshown status', () => {
      controller.updateViewed({ 1: true });
      expect(controller.state.notifications[1].isShown).toBeTruthy();
      expect(controller.state.notifications[2].isShown).toBeFalsy();
    });
    it('should update isshown of more than one notifications', () => {
      controller.updateViewed({ 2: true, 3: true });
      expect(controller.state.notifications[2].isShown).toBeTruthy();
      expect(controller.state.notifications[3].isShown).toBeTruthy();
    });
  });
});
