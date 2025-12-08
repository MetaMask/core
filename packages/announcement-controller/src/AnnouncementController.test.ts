import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';

import type {
  AnnouncementControllerState,
  StateAnnouncementMap,
  AnnouncementControllerActions,
  AnnouncementControllerEvents,
  AnnouncementMap,
} from './AnnouncementController';
import { AnnouncementController } from './AnnouncementController';

const name = 'AnnouncementController';

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getMessenger() {
  const messenger = new Messenger<
    MockAnyNamespace,
    AnnouncementControllerActions,
    AnnouncementControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });
  return new Messenger<
    typeof name,
    AnnouncementControllerActions,
    AnnouncementControllerEvents,
    typeof messenger
  >({
    namespace: name,
    parent: messenger,
  });
}
const allAnnouncements: AnnouncementMap = {
  1: {
    id: 1,
    date: '12/8/2020',
  },
  2: {
    id: 2,
    date: '12/8/2020',
  },
};
const allAnnouncements2: AnnouncementMap = {
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
};
const state1: AnnouncementControllerState = {
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

const state2: AnnouncementControllerState = {
  announcements: {
    1: {
      id: 1,
      date: '12/8/2020',
      isShown: false,
    },
    2: {
      id: 2,
      date: '12/8/2020',
      isShown: false,
    },
    3: {
      id: 3,
      date: '12/8/2020',
      isShown: false,
    },
  },
};

describe('announcement controller', () => {
  it('should add announcement to state', () => {
    const controller = new AnnouncementController({
      messenger: getMessenger(),
      allAnnouncements,
    });
    expect(Object.keys(controller.state.announcements)).toHaveLength(2);
    const expectedStateNotifications: StateAnnouncementMap = {
      1: {
        ...allAnnouncements[1],
        isShown: false,
      },
      2: {
        ...allAnnouncements[2],
        isShown: false,
      },
    };
    expect(controller.state.announcements).toStrictEqual(
      expectedStateNotifications,
    );
  });

  it('should add new announcement to state and a new announcement should be created with isShown as false', () => {
    const controller = new AnnouncementController({
      messenger: getMessenger(),
      state: state1,
      allAnnouncements: allAnnouncements2,
    });
    expect(Object.keys(controller.state.announcements)).toHaveLength(3);
    expect(controller.state.announcements[1].isShown).toBe(true);
    expect(controller.state.announcements[2].isShown).toBe(true);
    expect(controller.state.announcements[3].isShown).toBe(false);
  });

  describe('resetViewed', () => {
    it('resets all announcement isShown states to false', () => {
      const controller = new AnnouncementController({
        messenger: getMessenger(),
        state: state2,
        allAnnouncements: allAnnouncements2,
      });

      controller.updateViewed({ 1: true, 3: true });
      expect(controller.state.announcements[1].isShown).toBe(true);
      expect(controller.state.announcements[3].isShown).toBe(true);

      controller.resetViewed();
      Object.values(controller.state.announcements).forEach((announcement) => {
        expect(announcement.isShown).toBe(false);
      });
    });
  });

  describe('update viewed announcements', () => {
    it('should update isShown status', () => {
      const controller = new AnnouncementController({
        messenger: getMessenger(),
        state: state2,
        allAnnouncements: allAnnouncements2,
      });
      controller.updateViewed({ 1: true });
      expect(controller.state.announcements[1].isShown).toBe(true);
      expect(controller.state.announcements[2].isShown).toBe(false);
      expect(controller.state.announcements[3].isShown).toBe(false);
    });

    it('should update isShown of more than one announcement', () => {
      const controller = new AnnouncementController({
        messenger: getMessenger(),
        state: state2,
        allAnnouncements: allAnnouncements2,
      });
      controller.updateViewed({ 2: true, 3: true });
      expect(controller.state.announcements[1].isShown).toBe(false);
      expect(controller.state.announcements[2].isShown).toBe(true);
      expect(controller.state.announcements[3].isShown).toBe(true);
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const controller = new AnnouncementController({
        messenger: getMessenger(),
        allAnnouncements,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "announcements": Object {
            "1": Object {
              "date": "12/8/2020",
              "id": 1,
              "isShown": false,
            },
            "2": Object {
              "date": "12/8/2020",
              "id": 2,
              "isShown": false,
            },
          },
        }
      `);
    });

    it('includes expected state in state logs', () => {
      const controller = new AnnouncementController({
        messenger: getMessenger(),
        allAnnouncements,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "announcements": Object {
            "1": Object {
              "date": "12/8/2020",
              "id": 1,
              "isShown": false,
            },
            "2": Object {
              "date": "12/8/2020",
              "id": 2,
              "isShown": false,
            },
          },
        }
      `);
    });

    it('persists expected state', () => {
      const controller = new AnnouncementController({
        messenger: getMessenger(),
        allAnnouncements,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "announcements": Object {
            "1": Object {
              "date": "12/8/2020",
              "id": 1,
              "isShown": false,
            },
            "2": Object {
              "date": "12/8/2020",
              "id": 2,
              "isShown": false,
            },
          },
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const controller = new AnnouncementController({
        messenger: getMessenger(),
        allAnnouncements,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "announcements": Object {
            "1": Object {
              "date": "12/8/2020",
              "id": 1,
              "isShown": false,
            },
            "2": Object {
              "date": "12/8/2020",
              "id": 2,
              "isShown": false,
            },
          },
        }
      `);
    });
  });
});
