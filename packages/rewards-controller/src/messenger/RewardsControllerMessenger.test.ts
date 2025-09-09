import { getRewardsControllerMessenger } from './RewardsControllerMessenger';

type FakeMessenger = {
  getRestricted: jest.Mock<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    [
      params: {
        name: string;
        allowedActions: string[];
        allowedEvents: string[];
      },
    ]
  >;
};

describe('getRewardsControllerMessenger', () => {
  let messenger: FakeMessenger;

  beforeEach(() => {
    messenger = {
      getRestricted: jest.fn().mockReturnValue({ mockedRestricted: true }),
    };
  });

  it('requests a restricted messenger with the expected name, actions, and events', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = getRewardsControllerMessenger(messenger as any);

    // 1) Returned value is exactly what getRestricted returned
    expect(result).toStrictEqual({ mockedRestricted: true });

    // 2) Check getRestricted was called once with the correct structure
    expect(messenger.getRestricted).toHaveBeenCalledTimes(1);
    const [params] = messenger.getRestricted.mock.calls[0];

    // Name
    expect(params.name).toBe('RewardsController');

    // Actions — exact list, order-insensitive
    const expectedActions = [
      'AccountsController:getSelectedMultichainAccount',
      'KeyringController:signPersonalMessage',
      'RewardsDataService:login',
      'RewardsDataService:estimatePoints',
      'RewardsDataService:getPerpsDiscount',
      'RewardsDataService:getSeasonStatus',
      'RewardsDataService:getReferralDetails',
      'RewardsDataService:generateChallenge',
      'RewardsDataService:optin',
      'RewardsDataService:logout',
      'RewardsDataService:fetchGeoLocation',
      'RewardsDataService:validateReferralCode',
    ].sort();

    const actualActions = [...params.allowedActions].sort();
    expect(actualActions).toStrictEqual(expectedActions);

    // Events — exact list, order-insensitive
    const expectedEvents = [
      'AccountsController:selectedAccountChange',
      'KeyringController:unlock',
    ].sort();

    const actualEvents = [...params.allowedEvents].sort();
    expect(actualEvents).toStrictEqual(expectedEvents);
  });

  it('does not include unintended actions', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getRewardsControllerMessenger(messenger as any);
    const [params] = messenger.getRestricted.mock.calls[0];

    // Sanity checks: ensure a few *not allowed* actions are absent
    const notAllowed = [
      'RemoteFeatureFlagController:getState',
      'SomeOtherController:someAction',
      'AnotherController:anotherAction',
    ];
    for (const a of notAllowed) {
      expect(params.allowedActions).not.toContain(a);
    }
  });

  it('does not include unintended events', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getRewardsControllerMessenger(messenger as any);
    const [params] = messenger.getRestricted.mock.calls[0];

    // Example: ensure no extra events slipped in
    const notAllowedEvents = [
      'AccountsController:someOtherEvent',
      'KeyringController:lock',
    ];
    for (const e of notAllowedEvents) {
      expect(params.allowedEvents).not.toContain(e);
    }
  });
});
