import {
  ContentfulResult,
  getFeatureAnnouncementNotifications,
  getFeatureAnnouncementUrl,
} from './feature-announcements';
import type { INotification } from '..';
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
    ): Promise<void> => {
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

  describe('max age filter (exclude announcements older than 3 months)', () => {
    const mockResultWithAge = (monthsAgo: number): ContentfulResult => {
      const limitDate = new Date();
      limitDate.setMonth(limitDate.getMonth() - monthsAgo);

      const apiResult = createMockFeatureAnnouncementAPIResult();
      Object.assign(apiResult.items?.[0]?.sys ?? {}, {
        updatedAt: limitDate.toISOString(),
      });
      return apiResult;
    };

    it('filters out announcements older than 3 months', async () => {
      const mockEndpoint = mockFetchFeatureAnnouncementNotifications({
        status: 200,
        body: mockResultWithAge(4),
      });

      const notifications = await getFeatureAnnouncementNotifications(
        featureAnnouncementsEnv,
      );

      mockEndpoint.done();
      expect(notifications).toHaveLength(0);
    });

    it('includes announcements within the last 3 months', async () => {
      const mockEndpoint = mockFetchFeatureAnnouncementNotifications({
        status: 200,
        body: mockResultWithAge(1),
      });

      const notifications = await getFeatureAnnouncementNotifications(
        featureAnnouncementsEnv,
      );

      mockEndpoint.done();
      expect(notifications).toHaveLength(1);
    });
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

    const resultNotification = notifications[0] as Extract<
      INotification,
      { type: TRIGGER_TYPES.FEATURES_ANNOUNCEMENT }
    >;
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
      minVersionField: 'extensionMinimumVersionNumber' as const,
      maxVersionField: 'extensionMaximumVersionNumber' as const,
    },
    {
      platform: 'mobile' as const,
      minVersionField: 'mobileMinimumVersionNumber' as const,
      maxVersionField: 'mobileMaximumVersionNumber' as const,
    },
  ];

  describe.each(testPlatforms)(
    'Feature Announcement $platform filtering',
    ({ platform, minVersionField, maxVersionField }) => {
      // current platform version is 7.57.0 for all tests
      const currentPlatformVersion = '7.57.0';

      const arrangeAct = async (
        minimumVersion: string | undefined,
        maximumVersion: string | undefined,
        platformVersion: string | undefined,
      ): Promise<INotification[]> => {
        const apiResponse = createMockFeatureAnnouncementAPIResult();
        if (apiResponse.items?.[0]) {
          apiResponse.items[0].fields.extensionMinimumVersionNumber = undefined;
          apiResponse.items[0].fields.mobileMinimumVersionNumber = undefined;
          apiResponse.items[0].fields.extensionMaximumVersionNumber = undefined;
          apiResponse.items[0].fields.mobileMaximumVersionNumber = undefined;

          if (minimumVersion !== undefined) {
            apiResponse.items[0].fields[minVersionField] = minimumVersion;
          }
          if (maximumVersion !== undefined) {
            apiResponse.items[0].fields[maxVersionField] = maximumVersion;
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

      const minimumVersionSchema = [
        {
          testName: 'shows notification when platform version is above minimum',
          minimumVersion: '7.56.0',
          platformVersion: currentPlatformVersion,
          length: 1,
        },
        {
          testName: 'hides notification when platform version equals minimum',
          minimumVersion: '7.57.0',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
        {
          testName: 'hides notification when platform version is below minimum',
          minimumVersion: '7.58.0',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
        {
          testName: 'shows notification when no minimum version is specified',
          minimumVersion: undefined,
          platformVersion: currentPlatformVersion,
          length: 1,
        },
        {
          testName: 'shows notification when no platform version is provided',
          minimumVersion: '7.56.0',
          platformVersion: undefined,
          length: 1,
        },
        {
          testName: 'hides notification when minimum version is malformed',
          minimumVersion: 'invalid-version',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
      ];

      it.each(minimumVersionSchema)(
        'minimum version test - $testName',
        async ({ minimumVersion, platformVersion, length }) => {
          const notifications = await arrangeAct(
            minimumVersion,
            undefined,
            platformVersion,
          );
          expect(notifications).toHaveLength(length);
        },
      );

      const maximumVersionSchema = [
        {
          testName: 'shows notification when platform version is below maximum',
          maximumVersion: '7.58.0',
          platformVersion: currentPlatformVersion,
          length: 1,
        },
        {
          testName: 'hides notification when platform version equals maximum',
          maximumVersion: '7.57.0',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
        {
          testName: 'hides notification when platform version is above maximum',
          maximumVersion: '7.56.0',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
        {
          testName: 'shows notification when no maximum version is specified',
          maximumVersion: undefined,
          platformVersion: currentPlatformVersion,
          length: 1,
        },
        {
          testName: 'shows notification when no platform version is provided',
          maximumVersion: '7.58.0',
          platformVersion: undefined,
          length: 1,
        },
        {
          testName: 'hides notification when maximum version is malformed',
          maximumVersion: 'invalid-version',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
      ];

      it.each(maximumVersionSchema)(
        'maximum version test - $testName',
        async ({ maximumVersion, platformVersion, length }) => {
          const notifications = await arrangeAct(
            undefined,
            maximumVersion,
            platformVersion,
          );
          expect(notifications).toHaveLength(length);
        },
      );

      const minMaxVersionSchema = [
        {
          testName:
            'shows notification when version is within both bounds (min < current < max)',
          minimumVersion: '7.56.0',
          maximumVersion: '7.58.0',
          platformVersion: currentPlatformVersion,
          length: 1,
        },
        {
          testName:
            'shows notification when version is above minimum and below maximum',
          minimumVersion: '7.56.5',
          maximumVersion: '7.57.5',
          platformVersion: currentPlatformVersion,
          length: 1,
        },
        {
          testName: 'hides notification when version equals minimum bound',
          minimumVersion: '7.57.0',
          maximumVersion: '7.58.0',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
        {
          testName: 'hides notification when version equals maximum bound',
          minimumVersion: '7.56.0',
          maximumVersion: '7.57.0',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
        {
          testName: 'hides notification when version is below minimum bound',
          minimumVersion: '7.58.0',
          maximumVersion: '7.59.0',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
        {
          testName: 'hides notification when version is above maximum bound',
          minimumVersion: '7.55.0',
          maximumVersion: '7.56.0',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
        {
          testName: 'shows notification when both bounds are undefined',
          minimumVersion: undefined,
          maximumVersion: undefined,
          platformVersion: currentPlatformVersion,
          length: 1,
        },
        {
          testName:
            'shows notification when only minimum is defined and version is above it',
          minimumVersion: '7.56.0',
          maximumVersion: undefined,
          platformVersion: currentPlatformVersion,
          length: 1,
        },
        {
          testName:
            'shows notification when only maximum is defined and version is below it',
          minimumVersion: undefined,
          maximumVersion: '7.58.0',
          platformVersion: currentPlatformVersion,
          length: 1,
        },
        {
          testName:
            'shows notification when no platform version is provided regardless of bounds',
          minimumVersion: '7.56.0',
          maximumVersion: '7.58.0',
          platformVersion: undefined,
          length: 1,
        },
        {
          testName:
            'hides notification when minimum is malformed but maximum excludes current version',
          minimumVersion: 'malformed',
          maximumVersion: '7.56.0',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
        {
          testName:
            'hides notification when maximum is malformed but minimum excludes current version',
          minimumVersion: '7.58.0',
          maximumVersion: 'malformed',
          platformVersion: currentPlatformVersion,
          length: 0,
        },
      ];

      it.each(minMaxVersionSchema)(
        'min & max version bounds test - $testName',
        async ({ minimumVersion, maximumVersion, platformVersion, length }) => {
          const notifications = await arrangeAct(
            minimumVersion,
            maximumVersion,
            platformVersion,
          );
          expect(notifications).toHaveLength(length);
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
