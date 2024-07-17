import { createMockFeatureAnnouncementAPIResult } from '../__fixtures__/mock-feature-announcements';
import { mockFetchFeatureAnnouncementNotifications } from '../__fixtures__/mockServices';
import { TRIGGER_TYPES } from '../constants/notification-schema';
import { getFeatureAnnouncementNotifications } from './feature-announcements';

// Mocked type for testing, allows overwriting TS to test erroneous values
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockedType = any;

jest.mock('@contentful/rich-text-html-renderer', () => ({
  documentToHtmlString: jest
    .fn()
    .mockImplementation((richText: string) => `<p>${richText}</p>`),
}));

const featureAnnouncementsEnv = {
  spaceId: ':space_id',
  accessToken: ':access_token',
  platform: 'extension',
};

describe('Feature Announcement Notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return an empty array if invalid environment provided', async () => {
    mockFetchFeatureAnnouncementNotifications();

    const assertEnvEmpty = async (
      override: Partial<typeof featureAnnouncementsEnv>,
    ) => {
      const result = await getFeatureAnnouncementNotifications({
        ...featureAnnouncementsEnv,
        ...override,
      });
      expect(result).toHaveLength(0);
    };

    await assertEnvEmpty({ accessToken: null as MockedType });
    await assertEnvEmpty({ platform: null as MockedType });
    await assertEnvEmpty({ spaceId: null as MockedType });
    await assertEnvEmpty({ accessToken: '' });
    await assertEnvEmpty({ platform: '' });
    await assertEnvEmpty({ spaceId: '' });
  });

  it('should return an empty array if fetch fails', async () => {
    const mockEndpoint = mockFetchFeatureAnnouncementNotifications({
      status: 500,
    });

    const notifications = await getFeatureAnnouncementNotifications(
      featureAnnouncementsEnv,
    );
    mockEndpoint.done();
    expect(notifications).toStrictEqual([]);
  });

  it('should return an empty array if data is not available', async () => {
    const mockEndpoint = mockFetchFeatureAnnouncementNotifications({
      status: 200,
      body: { items: [] },
    });

    const notifications = await getFeatureAnnouncementNotifications(
      featureAnnouncementsEnv,
    );
    mockEndpoint.done();
    expect(notifications).toStrictEqual([]);
  });

  it('should fetch entries from Contentful and return formatted notifications', async () => {
    const mockEndpoint = mockFetchFeatureAnnouncementNotifications({
      status: 200,
      body: createMockFeatureAnnouncementAPIResult(),
    });

    const notifications = await getFeatureAnnouncementNotifications(
      featureAnnouncementsEnv,
    );
    expect(notifications).toHaveLength(1);
    mockEndpoint.done();

    const resultNotification = notifications[0];
    expect(resultNotification).toStrictEqual(
      expect.objectContaining({
        id: 'dont-miss-out-on-airdrops-and-new-nft-mints',
        type: TRIGGER_TYPES.FEATURES_ANNOUNCEMENT,
        createdAt: expect.any(String),
        isRead: expect.any(Boolean),
      }),
    );

    expect(resultNotification.data).toBeDefined();
  });
});
