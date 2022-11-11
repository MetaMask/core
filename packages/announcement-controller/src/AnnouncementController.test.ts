import {
  AnnouncementConfig,
  AnnouncementState,
  AnnouncementController,
  StateAnnouncementMap,
} from './AnnouncementController';

const config1: AnnouncementConfig = {
  allAnnouncements: {
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

const config2: AnnouncementConfig = {
  allAnnouncements: {
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

const state1: AnnouncementState = {
  announcements: {
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
  it('should add announcement to state', () => {
    const controller = new AnnouncementController(config1);
    expect(Object.keys(controller.state.announcements)).toHaveLength(2);
    const expectedStateNotifications: StateAnnouncementMap = {
      1: {
        ...config1.allAnnouncements[1],
        isShown: false,
      },
      2: {
        ...config1.allAnnouncements[2],
        isShown: false,
      },
    };
    expect(controller.state.announcements).toStrictEqual(
      expectedStateNotifications,
    );
  });

  it('should add new announcement to state', () => {
    const controller = new AnnouncementController(config2, state1);
    expect(Object.keys(controller.state.announcements)).toHaveLength(3);
    expect(controller.state.announcements[1].isShown).toBe(true);
    expect(controller.state.announcements[2].isShown).toBe(true);
    expect(controller.state.announcements[3].isShown).toBe(false);
  });

  describe('update viewed announcements', () => {
    it('should update isShown status', () => {
      const controller = new AnnouncementController(config2);
      controller.updateViewed({ 1: true });
      expect(controller.state.announcements[1].isShown).toBe(true);
      expect(controller.state.announcements[2].isShown).toBe(false);
      expect(controller.state.announcements[3].isShown).toBe(false);
    });

    it('should update isShown of more than one announcement', () => {
      const controller = new AnnouncementController(config2);
      controller.updateViewed({ 2: true, 3: true });
      expect(controller.state.announcements[1].isShown).toBe(false);
      expect(controller.state.announcements[2].isShown).toBe(true);
      expect(controller.state.announcements[3].isShown).toBe(true);
    });
  });
});
