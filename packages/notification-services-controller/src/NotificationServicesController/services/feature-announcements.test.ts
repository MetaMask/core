import {
  getFeatureAnnouncementNotifications,
  getFeatureAnnouncementUrl,
} from './feature-announcements';
import { mockFetchFeatureAnnouncementNotifications } from '../__fixtures__/mockServices';
import { TRIGGER_TYPES } from '../constants/notification-schema';
import { createMockFeatureAnnouncementAPIResult } from '../mocks/mock-feature-announcements';

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
  platform: 'extension' as 'extension' | 'mobile',
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
    await assertEnvEmpty({ platform: '' as MockedType });
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

  const testPlatforms = [
    {
      platform: 'extension' as const,
      versionField: 'extensionMinimumVersionNumber' as const,
    },
    {
      platform: 'mobile' as const,
      versionField: 'mobileMinimumVersionNumber' as const,
    },
  ];

  describe.each(testPlatforms)(
    'Feature Announcement $platform filtering',
    ({ platform, versionField }) => {
      const arrangeAct = async (
        minimumVersion: string | undefined,
        platformVersion: string | undefined,
      ) => {
        const apiResponse = createMockFeatureAnnouncementAPIResult();
        if (apiResponse.items && apiResponse.items[0]) {
          apiResponse.items[0].fields.extensionMinimumVersionNumber = undefined;
          apiResponse.items[0].fields.mobileMinimumVersionNumber = undefined;
          if (minimumVersion !== undefined) {
            apiResponse.items[0].fields[versionField] = minimumVersion;
          }
        }

        const mockEndpoint = mockFetchFeatureAnnouncementNotifications({
          status: 200,
          body: apiResponse,
        });

        const notifications = await getFeatureAnnouncementNotifications({
          ...featureAnnouncementsEnv,
          platform,
          platformVersion,
        });

        mockEndpoint.done();
        return notifications;
      };

      const testCases = [
        {
          name: 'should show notifications when platform version meets minimum requirement',
          minimumVersion: '1.0.0',
          platformVersion: '2.0.0',
          expectedLength: 1,
        },
        {
          name: 'should show notifications when platform version equals minimum requirement',
          minimumVersion: '1.0.0',
          platformVersion: '1.0.0',
          expectedLength: 1,
        },
        {
          name: 'should hide notifications when platform version is below minimum requirement',
          minimumVersion: '3.0.0',
          platformVersion: '2.0.0',
          expectedLength: 0,
        },
        {
          name: 'should show notifications when no platform version is provided',
          minimumVersion: '2.0.0',
          platformVersion: undefined,
          expectedLength: 1,
        },
        {
          name: 'should show notifications when no minimum version is specified for the platform',
          minimumVersion: undefined,
          platformVersion: '1.0.0',
          expectedLength: 1,
        },
        {
          name: 'should handle invalid version strings gracefully',
          minimumVersion: 'invalid-version',
          platformVersion: '2.0.0',
          expectedLength: 0,
        },
        {
          name: 'should handle invalid platform version gracefully',
          minimumVersion: '2.0.0',
          platformVersion: 'invalid-version',
          expectedLength: 0,
        },
      ];

      it.each(testCases)(
        '$name',
        async ({ minimumVersion, platformVersion, expectedLength }) => {
          const notifications = await arrangeAct(
            minimumVersion,
            platformVersion,
          );
          expect(notifications).toHaveLength(expectedLength);
        },
      );
    },
  );
});

describe('getFeatureAnnouncementUrl', () => {
  it('should construct the correct URL for the default domain', () => {
    const url = getFeatureAnnouncementUrl(featureAnnouncementsEnv);
    expect(url).toBe(
      `https://cdn.contentful.com/spaces/:space_id/environments/master/entries?access_token=:access_token&content_type=productAnnouncement&include=10&fields.clients%5Bin%5D=extension`,
    );
  });

  it('should construct the correct URL for the preview domain', () => {
    const url = getFeatureAnnouncementUrl(
      featureAnnouncementsEnv,
      ':preview_token',
    );
    expect(url).toBe(
      `https://preview.contentful.com/spaces/:space_id/environments/master/entries?access_token=:preview_token&content_type=productAnnouncement&include=10&fields.clients%5Bin%5D=extension`,
    );
  });
});
