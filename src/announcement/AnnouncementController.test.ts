import {
  NotificationConfig,
  NotificationState,
  AnnouncementController,
  StateNotificationMap,
} from './AnnouncementController';

const config1: NotificationConfig = {
  allNotifications: {
    1: {
      id: 1,
      date: '12/8/2020',
    },
    2: {
      id: 2,
      date: '12/8/2020',
    },
  },
};

const config2: NotificationConfig = {
  allNotifications: {
    1: {
      id: 1,
      date: '12/8/2020',
    },
    2: {
      id: 2,
      date: '12/8/2020',
    },
    3: {
      id: 3,
      date: '12/8/2020',
    },
  },
};

const state1: NotificationState = {
  notifications: {
    1: {
      id: 1,
      date: '12/8/2020',
      isShown: true,
    },
    2: {
      id: 2,
      date: '12/8/2020',
      isShown: true,
    },
  },
};

describe('announcement controller', () => {
  it('should add notifications to state', () => {
    const controller = new AnnouncementController(config1);
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
    expect(controller.state.notifications).toStrictEqual(
      expectedStateNotifications,
    );
  });

  it('should add new notifcation to state', () => {
    const controller = new AnnouncementController(config2, state1);
    expect(Object.keys(controller.state.notifications)).toHaveLength(3);
    expect(controller.state.notifications[1].isShown).toBe(true);
    expect(controller.state.notifications[2].isShown).toBe(true);
    expect(controller.state.notifications[3].isShown).toBe(false);
  });

  describe('update viewed notifications', () => {
    it('should update isShown status', () => {
      const controller = new AnnouncementController(config2);
      controller.updateViewed({ 1: true });
      expect(controller.state.notifications[1].isShown).toBe(true);
      expect(controller.state.notifications[2].isShown).toBe(false);
      expect(controller.state.notifications[3].isShown).toBe(false);
    });

    it('should update isShown of more than one notifications', () => {
      const controller = new AnnouncementController(config2);
      controller.updateViewed({ 2: true, 3: true });
      expect(controller.state.notifications[1].isShown).toBe(false);
      expect(controller.state.notifications[2].isShown).toBe(true);
      expect(controller.state.notifications[3].isShown).toBe(true);
    });
  });
});
