import { Messenger } from '@metamask/base-controller';

import {
  ListNames,
  PhishingController,
  type PhishingControllerActions,
  type PhishingControllerOptions,
} from './PhishingController';

const controllerName = 'PhishingController';

// Add fetch polyfill for Node.js environment
global.fetch = jest.fn() as jest.Mock;

/**
 * Constructs a restricted messenger.
 *
 * @returns A restricted messenger.
 */
function getRestrictedMessenger() {
  const messenger = new Messenger<PhishingControllerActions, never>();

  return messenger.getRestricted({
    name: controllerName,
    allowedActions: [],
    allowedEvents: [],
  });
}

/**
 * Construct a Phishing Controller with the given options if any.
 *
 * @param options - The Phishing Controller options.
 * @returns The constructed Phishing Controller.
 */
function getPhishingController(options?: Partial<PhishingControllerOptions>) {
  return new PhishingController({
    messenger: getRestrictedMessenger(),
    ...options,
  });
}

describe('HotlistResponse Interface', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it('should correctly process HotlistResponse with diffEntries and lastFetchedAt', async () => {
    const testBlockedDomain = 'test-domain.com';
    const testLastFetchedAt = 12345;

    // Mock fetch with simplified response
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              diffEntries: [
                {
                  targetList: 'eth_phishing_detect_config.blocklist',
                  url: testBlockedDomain,
                  timestamp: 1,
                },
              ],
            },
            lastFetchedAt: testLastFetchedAt, // Root level lastFetchedAt
          }),
      }),
    );

    const controller = getPhishingController({
      state: {
        phishingLists: [
          {
            allowlist: [],
            blocklist: [],
            c2DomainBlocklist: [],
            fuzzylist: [],
            tolerance: 3,
            version: 1,
            name: ListNames.MetaMask,
            lastUpdated: 0,
          },
        ],
        hotlistLastSuccessTimestamp: 1,
      },
    });

    // Update the hotlist
    await controller.updateHotlist();

    // Verify that diffEntries were processed correctly (added to blocklist)
    expect(controller.state.phishingLists[0].blocklist).toContain(
      testBlockedDomain,
    );

    // Verify that lastFetchedAt was stored in hotlistLastSuccessTimestamp
    expect(controller.state.hotlistLastSuccessTimestamp).toBe(
      testLastFetchedAt,
    );
  });

  it('should correctly process old format response (direct array of diffs)', async () => {
    const testBlockedDomain = 'old-format-domain.com';

    // Mock fetch with simplified response
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            data: [
              {
                targetList: 'eth_phishing_detect_config.blocklist',
                url: testBlockedDomain,
                timestamp: 1,
              },
            ],
            lastFetchedAt: 5000, // Root level lastFetchedAt
          }),
      }),
    );

    const controller = getPhishingController({
      state: {
        phishingLists: [
          {
            allowlist: [],
            blocklist: [],
            c2DomainBlocklist: [],
            fuzzylist: [],
            tolerance: 3,
            version: 1,
            name: ListNames.MetaMask,
            lastUpdated: 0,
          },
        ],
        hotlistLastSuccessTimestamp: 1,
      },
    });

    // Update the hotlist
    await controller.updateHotlist();

    // Verify that array of diffs was processed correctly (added to blocklist)
    expect(controller.state.phishingLists[0].blocklist).toContain(
      testBlockedDomain,
    );

    // The lastFetchedAt property should now be updated
    expect(controller.state.hotlistLastSuccessTimestamp).toBe(5000);
  });

  it('should handle unrecognized format without modifying the state', async () => {
    // Mock fetch with simplified response
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              // Neither an array nor contains diffEntries property
              someOtherProperty: 'value',
            },
            lastFetchedAt: 9999, // Root level lastFetchedAt
          }),
      }),
    );

    const initialState = {
      phishingLists: [
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [],
          fuzzylist: [],
          tolerance: 3,
          version: 1,
          name: ListNames.MetaMask,
          lastUpdated: 0,
        },
      ],
      hotlistLastSuccessTimestamp: 1,
    };

    const controller = getPhishingController({
      state: initialState,
    });

    // Update the hotlist with unrecognized format
    await controller.updateHotlist();

    // The blocklist should remain empty since the unrecognized format should be ignored
    expect(controller.state.phishingLists[0].blocklist).toStrictEqual([]);

    // The hotlistLastFetchedAt should be updated even with unrecognized format
    expect(controller.state.hotlistLastFetched).not.toBe(0);

    // The hotlistLastSuccessTimestamp should be updated to the lastFetchedAt value
    expect(controller.state.hotlistLastSuccessTimestamp).toBe(9999);

    // Verify that the phishing lists remained unchanged
    expect(controller.state.phishingLists).toStrictEqual(
      initialState.phishingLists,
    );
  });
});
