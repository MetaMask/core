import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import {
  getDefaultKycControllerState,
  KycController,
} from './KycController.js';
import type { KycControllerMessenger } from './KycController.js';
import type { KycSumSubLauncher } from './providers/sumsub.js';
import type { KycConsentRecord, KycSessionDisclaimers } from './types.js';
import { verifyJwtChain } from './ukyc/jwtChain.js';
import { wrapEncryptionKey } from './ukyc/wrapEncryptionKey.js';

jest.mock('./ukyc/jwtChain', () => {
  const actual = jest.requireActual('./ukyc/jwtChain');
  return {
    ...actual,
    verifyJwtChain: jest.fn(),
    assertAttestedServerPublicKey: jest.fn(),
  };
});
jest.mock('./ukyc/wrapEncryptionKey', () => {
  const actual = jest.requireActual('./ukyc/wrapEncryptionKey');
  return {
    ...actual,
    wrapEncryptionKey: jest.fn(),
  };
});

const mockVerifyJwtChain = verifyJwtChain as jest.MockedFunction<
  typeof verifyJwtChain
>;
const mockWrapEncryptionKey = wrapEncryptionKey as jest.MockedFunction<
  typeof wrapEncryptionKey
>;

const MOCK_SESSION_DISCLAIMERS: KycSessionDisclaimers = {
  idOS: [
    {
      key: 'idos-tos',
      version: '1',
      title: 'idOS ToS',
      url: 'https://idos.example/tos',
      consented: false,
    },
  ],
  kycProvider: [
    {
      key: 'sumsub-tos',
      version: '1',
      title: 'SumSub ToS',
      url: 'https://sumsub.example/tos',
      consented: false,
    },
  ],
  credentialReusabilityConsentGiven: false,
};

const MOCK_IDOS_DISCLAIMERS_ACCEPTED: KycConsentRecord[] =
  MOCK_SESSION_DISCLAIMERS.idOS.map(({ key, version }) => ({ key, version }));

const MOCK_SUMSUB_DISCLAIMERS_ACCEPTED: KycConsentRecord[] =
  MOCK_SESSION_DISCLAIMERS.kycProvider.map(({ key, version }) => ({
    key,
    version,
  }));

describe('KycController', () => {
  describe('constructor', () => {
    it('accepts initial state merged over defaults', async () => {
      await withController(
        { options: { state: { email: 'a@b.co', vendor: 'iron' } } },
        ({ controller }) => {
          expect(controller.state.email).toBe('a@b.co');
          expect(controller.state.vendor).toBe('iron');
          expect(controller.state.sessionStatus).toBeNull();
        },
      );
    });

    it('uses default state when none is provided', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual(getDefaultKycControllerState());
      });
    });
  });

  describe('startSession', () => {
    it('creates a UKYC session when the vendor has no latest session', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getGeoCountry.mockResolvedValue('USA');
        handlers.getSessionStatusForVendor.mockResolvedValue(null);

        const result = await controller.startSession({
          vendor: 'iron',
          email: 'a@b.co',
        });

        expect(handlers.createVendorCustomer).toHaveBeenCalledWith({
          vendor: 'iron',
          email: 'a@b.co',
        });
        expect(handlers.createUkycSession).toHaveBeenCalledWith(
          expect.objectContaining({
            residenceCountry: 'USA',
            vendor: 'iron',
          }),
        );
        expect(
          handlers.createVendorCustomer.mock.invocationCallOrder[0],
        ).toBeLessThan(handlers.createUkycSession.mock.invocationCallOrder[0]);
        expect(handlers.setAuthorizations).toHaveBeenCalled();
        expect(result).toStrictEqual(sessionStatus('approved'));
        expect(controller.state.sessionStatus).toStrictEqual(result);
        expect(controller.state.email).toBe('a@b.co');
        expect(controller.state.vendor).toBe('iron');
        expect(controller.state.geoCountry).toBe('USA');
      });
    });

    it('stores a latest vendor session instead of creating one', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getGeoCountry.mockResolvedValue('USA');
        handlers.getSessionStatusForVendor.mockResolvedValue(
          sessionStatus('pending'),
        );

        const result = await controller.startSession({
          vendor: 'iron',
          email: 'a@b.co',
        });

        expect(handlers.createVendorCustomer).not.toHaveBeenCalled();
        expect(handlers.createUkycSession).not.toHaveBeenCalled();
        expect(result).toStrictEqual(sessionStatus('pending'));
        expect(controller.state.sessionStatus).toStrictEqual(
          sessionStatus('pending'),
        );
      });
    });

    it('returns the existing session without creating another', async () => {
      await withController(
        {
          options: {
            state: {
              email: 'a@b.co',
              vendor: 'iron',
              geoCountry: 'USA',
              sessionStatus: sessionStatus('pending'),
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.getGeoCountry.mockResolvedValue('USA');

          expect(
            await controller.startSession({ vendor: 'iron', email: 'a@b.co' }),
          ).toStrictEqual(sessionStatus('pending'));
          expect(handlers.getSessionStatusForVendor).not.toHaveBeenCalled();
          expect(handlers.createVendorCustomer).not.toHaveBeenCalled();
          expect(handlers.createUkycSession).not.toHaveBeenCalled();
        },
      );
    });

    it('throws when email does not match the initialized session', async () => {
      await withController(
        { options: { state: { email: 'a@b.co' } } },
        async ({ controller }) => {
          await expect(
            controller.startSession({ vendor: 'iron', email: 'other@b.co' }),
          ).rejects.toThrow(
            'KycController already initialized with a different email',
          );
        },
      );
    });

    it('does not create a UKYC session when creating the vendor customer fails', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue(null);
        handlers.createVendorCustomer.mockRejectedValue(
          new Error('customer failed'),
        );

        await expect(
          controller.startSession({ vendor: 'iron', email: 'a@b.co' }),
        ).rejects.toThrow('customer failed');
        expect(handlers.createUkycSession).not.toHaveBeenCalled();
        expect(controller.state.sessionStatus).toBeNull();
      });
    });
  });

  describe('reset and clearState', () => {
    it('clears session fields', async () => {
      await withController(
        {
          options: {
            state: {
              email: 'a@b.co',
              vendor: 'iron',
              geoCountry: 'USA',
              sessionStatus: sessionStatus('pending'),
            },
          },
        },
        async ({ controller }) => {
          await controller.reset();
          expect(controller.state).toStrictEqual(
            getDefaultKycControllerState(),
          );
        },
      );
    });
  });

  describe('getSessionStatusForVendor', () => {
    it('forwards the vendor to KycService', async () => {
      await withController(async ({ controller, handlers }) => {
        handlers.getSessionStatusForVendor.mockResolvedValue(
          sessionStatus('approved'),
        );

        expect(
          await controller.getSessionStatusForVendor('iron'),
        ).toStrictEqual(sessionStatus('approved'));
        expect(handlers.getSessionStatusForVendor).toHaveBeenCalledWith('iron');
      });
    });
  });

  describe('refreshSessionStatus', () => {
    it('throws when no session is available', async () => {
      await withController(({ controller }) => {
        expect(() => controller.refreshSessionStatus()).toThrow(
          'No session was found',
        );
      });
    });

    it('returns the current session and starts polling when not terminal', async () => {
      await withController(
        {
          options: { state: { sessionStatus: sessionStatus('pending') } },
        },
        async ({ controller, handlers }) => {
          handlers.getSessionStatus.mockResolvedValue(sessionStatus('pending'));

          expect(controller.refreshSessionStatus()).toStrictEqual(
            sessionStatus('pending'),
          );
          await Promise.resolve();
          await Promise.resolve();
          expect(handlers.getSessionStatus).toHaveBeenCalledWith({
            sessionId: 'sid',
          });
        },
      );
    });
  });

  describe('startSessionStatusPolling', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    /**
     * Lets the in-flight poll tick settle.
     */
    async function flushPoll(): Promise<void> {
      await Promise.resolve();
      await Promise.resolve();
    }

    it('throws when no session id is available', async () => {
      await withController(({ controller }) => {
        expect(() => controller.startSessionStatusPolling()).toThrow(
          'No session was found',
        );
      });
    });

    it('updates state when the fetched session status differs', async () => {
      await withController(
        {
          options: { state: { sessionStatus: sessionStatus('pending') } },
        },
        async ({ controller, handlers }) => {
          handlers.getSessionStatus.mockResolvedValueOnce({
            ...sessionStatus('pending'),
            kycStatus: 'in_review',
          });

          controller.startSessionStatusPolling();
          await flushPoll();

          expect(handlers.getSessionStatus).toHaveBeenCalledWith({
            sessionId: 'sid',
          });
          expect(controller.state.sessionStatus?.kycStatus).toBe('in_review');
        },
      );
    });

    it.each(['approved', 'rejected', 'retry'])(
      'stops polling once finalStatus is %s',
      async (finalStatus) => {
        jest.useFakeTimers();
        await withController(
          {
            options: { state: { sessionStatus: sessionStatus('pending') } },
          },
          async ({ controller, handlers }) => {
            handlers.getSessionStatus.mockResolvedValue(
              sessionStatus(finalStatus),
            );

            controller.startSessionStatusPolling();
            await flushPoll();
            expect(handlers.getSessionStatus).toHaveBeenCalledTimes(1);

            await jest.advanceTimersByTimeAsync(30_000);
            expect(handlers.getSessionStatus).toHaveBeenCalledTimes(1);
          },
        );
      },
    );

    it('discards an in-flight poll after reset', async () => {
      await withController(
        {
          options: { state: { sessionStatus: sessionStatus('pending') } },
        },
        async ({ controller, handlers }) => {
          handlers.getSessionStatus.mockImplementation(async () => {
            await controller.reset();
            return sessionStatus('approved');
          });

          controller.startSessionStatusPolling();
          await flushPoll();

          expect(controller.state.sessionStatus).toBeNull();
        },
      );
    });
  });

  describe('fetchSessionDisclaimers', () => {
    it('fetches by session id', async () => {
      await withController(async ({ controller, handlers }) => {
        expect(
          await controller.fetchSessionDisclaimers({ sessionId: 'sid' }),
        ).toStrictEqual(MOCK_SESSION_DISCLAIMERS);
        expect(
          handlers.fetchSessionDisclaimersBySessionId,
        ).toHaveBeenCalledWith({ sessionId: 'sid' });
      });
    });

    it('fetches by country', async () => {
      await withController(async ({ controller, handlers }) => {
        const catalog = { idOS: [], kycProvider: [] };
        handlers.fetchSessionDisclaimersByCountry.mockResolvedValue(catalog);

        expect(
          await controller.fetchSessionDisclaimers({ country: 'USA' }),
        ).toStrictEqual(catalog);
        expect(handlers.fetchSessionDisclaimersByCountry).toHaveBeenCalledWith({
          country: 'USA',
        });
      });
    });

    it('throws when neither sessionId nor country is provided', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.fetchSessionDisclaimers(
            {} as { sessionId: string } | { country: string },
          ),
        ).rejects.toThrow(/provide exactly one of sessionId or country/u);
      });
    });
  });

  describe('recordSessionDisclaimers', () => {
    it('throws when no session exists', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.recordSessionDisclaimers({
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
            credentialReusabilityConsentGiven: true,
          }),
        ).rejects.toThrow('No session was found');
      });
    });

    it('submits consents and persists accepted records', async () => {
      await withController(
        { options: { state: { sessionStatus: sessionStatus('pending') } } },
        async ({ controller, handlers }) => {
          await controller.recordSessionDisclaimers({
            providerDisclaimersAccepted: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            idosDisclaimersAccepted: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
            credentialReusabilityConsentGiven: true,
          });

          expect(handlers.submitSessionDisclaimers).toHaveBeenCalledWith({
            sessionId: 'sid',
            idOS: MOCK_IDOS_DISCLAIMERS_ACCEPTED,
            kycProvider: MOCK_SUMSUB_DISCLAIMERS_ACCEPTED,
            credentialReusabilityConsentGiven: true,
          });
          expect(
            controller.state.providerDisclaimersAccepted.sumsub,
          ).toStrictEqual(MOCK_SUMSUB_DISCLAIMERS_ACCEPTED);
          expect(controller.state.idosDisclaimersAccepted).toStrictEqual(
            MOCK_IDOS_DISCLAIMERS_ACCEPTED,
          );
          expect(controller.state.credentialReusabilityConsentGiven).toBe(true);
        },
      );
    });
  });

  describe('hasCompletedSessionDisclaimers', () => {
    it('throws when no session exists', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.hasCompletedSessionDisclaimers(),
        ).rejects.toThrow('No session was found');
      });
    });

    it('returns true when the fetched catalog is fully consented', async () => {
      await withController(
        { options: { state: { sessionStatus: sessionStatus('pending') } } },
        async ({ controller, handlers }) => {
          handlers.fetchSessionDisclaimersBySessionId.mockResolvedValue({
            ...MOCK_SESSION_DISCLAIMERS,
            credentialReusabilityConsentGiven: true,
            idOS: MOCK_SESSION_DISCLAIMERS.idOS.map((document) => ({
              ...document,
              consented: true,
            })),
            kycProvider: MOCK_SESSION_DISCLAIMERS.kycProvider.map(
              (document) => ({
                ...document,
                consented: true,
              }),
            ),
          });

          expect(await controller.hasCompletedSessionDisclaimers()).toBe(true);
        },
      );
    });
  });

  describe('fetchVendorDisclaimers', () => {
    it('forwards vendor and country to KycService.fetchVendorDisclaimers', async () => {
      await withController(async ({ controller, handlers }) => {
        const disclaimers = [{ id: '1', display_name: 'T', url: 'u' }];
        handlers.fetchVendorDisclaimers.mockResolvedValue(disclaimers);

        expect(
          await controller.fetchVendorDisclaimers({
            vendor: 'iron',
            country: 'USA',
          }),
        ).toStrictEqual(disclaimers);
        expect(handlers.fetchVendorDisclaimers).toHaveBeenCalledWith({
          vendor: 'iron',
          country: 'USA',
        });
      });
    });
  });

  describe('recordVendorDisclaimers', () => {
    it('throws when vendor is missing', async () => {
      await withController(
        { options: { state: { email: 'a@b.co' } } },
        async ({ controller, handlers }) => {
          await expect(
            controller.recordVendorDisclaimers({ disclaimerIds: ['d1'] }),
          ).rejects.toThrow('No vendor was found');
          expect(handlers.submitVendorDisclaimers).not.toHaveBeenCalled();
        },
      );
    });

    it('throws when email is missing', async () => {
      await withController(
        { options: { state: { vendor: 'iron' } } },
        async ({ controller, handlers }) => {
          await expect(
            controller.recordVendorDisclaimers({ disclaimerIds: ['d1'] }),
          ).rejects.toThrow('No email was found');
          expect(handlers.submitVendorDisclaimers).not.toHaveBeenCalled();
        },
      );
    });

    it('submits accepted ids and persists them', async () => {
      const signings = [
        { id: 'sign-1', customer_id: 'cust-1', content_id: 'd1' },
      ];
      await withController(
        { options: { state: { vendor: 'iron', email: 'a@b.co' } } },
        async ({ controller, handlers }) => {
          handlers.submitVendorDisclaimers.mockResolvedValue(signings);

          expect(
            await controller.recordVendorDisclaimers({ disclaimerIds: ['d1'] }),
          ).toStrictEqual(signings);
          expect(handlers.createVendorCustomer).not.toHaveBeenCalled();
          expect(handlers.submitVendorDisclaimers).toHaveBeenCalledWith({
            vendor: 'iron',
            disclaimerIds: ['d1'],
          });
          expect(
            controller.state.vendorDisclaimersAccepted.iron?.disclaimerIds,
          ).toStrictEqual(['d1']);
        },
      );
    });
  });

  describe('hasCompletedVendorDisclaimers', () => {
    it('throws when vendor is missing', async () => {
      await withController(
        { options: { state: { geoCountry: 'USA' } } },
        async ({ controller }) => {
          await expect(
            controller.hasCompletedVendorDisclaimers(),
          ).rejects.toThrow('No vendor was found');
        },
      );
    });

    it('returns true when persisted Iron ids cover the fetched catalog', async () => {
      await withController(
        {
          options: {
            state: {
              vendor: 'iron',
              geoCountry: 'USA',
              vendorDisclaimersAccepted: {
                moonpay: null,
                iron: { disclaimerIds: ['d1', 'd2'] },
              },
            },
          },
        },
        async ({ controller, handlers }) => {
          handlers.fetchVendorDisclaimers.mockResolvedValue([
            { id: 'd1', display_name: 'T1', url: 'u1' },
            { id: 'd2', display_name: 'T2', url: 'u2' },
          ]);

          expect(await controller.hasCompletedVendorDisclaimers()).toBe(true);
        },
      );
    });
  });

  describe('launchProviderFlow', () => {
    it('launches SumSub when a session exists', async () => {
      await withController(
        { options: { state: { sessionStatus: sessionStatus('pending') } } },
        async ({ controller, handlers, launcher }) => {
          launcher.launch.mockResolvedValue({ status: 'Completed' });

          await controller.launchProviderFlow({ locale: 'en', debug: false });

          expect(handlers.createJourney).toHaveBeenCalledWith('sid');
          expect(launcher.launch).toHaveBeenCalled();
        },
      );
    });
  });

  describe('messenger actions', () => {
    it('exposes fetchSessionDisclaimers', async () => {
      await withController(async ({ rootMessenger, handlers }) => {
        handlers.fetchSessionDisclaimersBySessionId.mockResolvedValue(
          MOCK_SESSION_DISCLAIMERS,
        );

        expect(
          await rootMessenger.call('KycController:fetchSessionDisclaimers', {
            sessionId: 'sid',
          }),
        ).toStrictEqual(MOCK_SESSION_DISCLAIMERS);
      });
    });
  });
});

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<KycControllerMessenger>,
  MessengerEvents<KycControllerMessenger>
>;

type ServiceHandlers = {
  getGeoCountry: jest.Mock;
  fetchVendorDisclaimers: jest.Mock;
  createMoonpaySession: jest.Mock;
  createVendorCustomer: jest.Mock;
  submitVendorDisclaimers: jest.Mock;
  fetchSessionDisclaimersByCountry: jest.Mock;
  fetchSessionDisclaimersBySessionId: jest.Mock;
  submitSessionDisclaimers: jest.Mock;
  fetchIdosEnclaveJwks: jest.Mock;
  fetchIdosRelayJwks: jest.Mock;
  createUkycSession: jest.Mock;
  setAuthorizations: jest.Mock;
  createJourney: jest.Mock;
  getSessionStatus: jest.Mock;
  getSessionStatusForVendor: jest.Mock;
  performGetStorage: jest.Mock;
  performSetStorage: jest.Mock;
};

type Launcher = {
  isAvailable: jest.Mock;
  launch: jest.Mock;
};

type WithControllerCallback<ReturnValue> = (payload: {
  controller: KycController;
  rootMessenger: RootMessenger;
  handlers: ServiceHandlers;
  launcher: Launcher;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof KycController>[0]>;
};

const ENCRYPTION_SCHEMA = {
  serverPublicKey: { kty: 'OKP', crv: 'X25519', x: 'spk-x' },
  jwtChain: 'jwt.chain.sig',
};

/**
 * Builds a UKYC session-creation payload with encryption schemas.
 *
 * @param overrides - Fields to overlay on the default session response.
 * @returns A complete session-creation response.
 */
function ukycSessionResponse(
  overrides: Partial<{
    sessionId: string;
    encryptionDataKey: typeof ENCRYPTION_SCHEMA;
    ukycCapabilityToken: typeof ENCRYPTION_SCHEMA;
  }> = {},
): {
  sessionId: string;
  encryptionDataKey: typeof ENCRYPTION_SCHEMA;
  ukycCapabilityToken: typeof ENCRYPTION_SCHEMA;
} {
  return {
    sessionId: 'sid',
    encryptionDataKey: ENCRYPTION_SCHEMA,
    ukycCapabilityToken: ENCRYPTION_SCHEMA,
    ...overrides,
  };
}

/**
 * Builds a UKYC session status payload with a given `finalStatus`.
 *
 * @param finalStatus - The overall session status.
 * @returns A complete session status object.
 */
function sessionStatus(finalStatus: string): {
  id: string;
  finalStatus: string;
  externalUserId: string;
  kycStatus: string;
  vendor: string;
  vendorStatus: string;
} {
  return {
    id: 'sid',
    finalStatus,
    externalUserId: 'ext-1',
    kycStatus: finalStatus,
    vendor: 'sumsub',
    vendorStatus: finalStatus,
  };
}

/**
 * Wraps a test with a fully-wired controller, mocked service handlers, and a
 * mocked SumSub launcher.
 *
 * @param args - Either a callback, or an options bag and a callback.
 * @returns The callback's return value.
 */
function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): ReturnValue | Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];

  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: KycControllerMessenger = new Messenger({
    namespace: 'KycController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'KycService:getGeoCountry',
      'KycService:fetchVendorDisclaimers',
      'KycService:createMoonpaySession',
      'KycService:createVendorCustomer',
      'KycService:submitVendorDisclaimers',
      'KycService:fetchSessionDisclaimersByCountry',
      'KycService:fetchSessionDisclaimersBySessionId',
      'KycService:submitSessionDisclaimers',
      'KycService:fetchIdosEnclaveJwks',
      'KycService:fetchIdosRelayJwks',
      'KycService:createUkycSession',
      'KycService:setAuthorizations',
      'KycService:createJourney',
      'KycService:getSessionStatus',
      'KycService:getSessionStatusForVendor',
      'UserStorageController:performGetStorage',
      'UserStorageController:performSetStorage',
    ],
    events: [],
    messenger,
  });

  const handlers: ServiceHandlers = {
    getGeoCountry: jest.fn().mockResolvedValue('USA'),
    fetchVendorDisclaimers: jest.fn().mockResolvedValue([]),
    createMoonpaySession: jest.fn().mockResolvedValue({ sessionToken: 'sess' }),
    createVendorCustomer: jest.fn().mockResolvedValue({
      id: 'cust-1',
      email: 'a@b.co',
      status: 'SigningsRequired',
    }),
    submitVendorDisclaimers: jest.fn().mockResolvedValue([]),
    fetchSessionDisclaimersByCountry: jest.fn().mockResolvedValue({
      idOS: [],
      kycProvider: [],
    }),
    fetchSessionDisclaimersBySessionId: jest
      .fn()
      .mockResolvedValue(MOCK_SESSION_DISCLAIMERS),
    submitSessionDisclaimers: jest.fn().mockResolvedValue({
      ...MOCK_SESSION_DISCLAIMERS,
      credentialReusabilityConsentGiven: true,
    }),
    fetchIdosEnclaveJwks: jest.fn().mockResolvedValue({ keys: [] }),
    fetchIdosRelayJwks: jest.fn().mockResolvedValue({ keys: [] }),
    createUkycSession: jest.fn().mockResolvedValue(ukycSessionResponse()),
    setAuthorizations: jest.fn().mockResolvedValue(sessionStatus('approved')),
    createJourney: jest
      .fn()
      .mockResolvedValue({ status: 'ok', applicantAccessToken: 'aat' }),
    getSessionStatus: jest.fn().mockResolvedValue(sessionStatus('approved')),
    getSessionStatusForVendor: jest.fn().mockResolvedValue(null),
    performGetStorage: jest.fn().mockResolvedValue(null),
    performSetStorage: jest.fn().mockResolvedValue(undefined),
  };

  rootMessenger.registerActionHandler(
    'KycService:getGeoCountry',
    handlers.getGeoCountry,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchVendorDisclaimers',
    handlers.fetchVendorDisclaimers,
  );
  rootMessenger.registerActionHandler(
    'KycService:createMoonpaySession',
    handlers.createMoonpaySession,
  );
  rootMessenger.registerActionHandler(
    'KycService:createVendorCustomer',
    handlers.createVendorCustomer,
  );
  rootMessenger.registerActionHandler(
    'KycService:submitVendorDisclaimers',
    handlers.submitVendorDisclaimers,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchSessionDisclaimersByCountry',
    handlers.fetchSessionDisclaimersByCountry,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchSessionDisclaimersBySessionId',
    handlers.fetchSessionDisclaimersBySessionId,
  );
  rootMessenger.registerActionHandler(
    'KycService:submitSessionDisclaimers',
    handlers.submitSessionDisclaimers,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchIdosEnclaveJwks',
    handlers.fetchIdosEnclaveJwks,
  );
  rootMessenger.registerActionHandler(
    'KycService:fetchIdosRelayJwks',
    handlers.fetchIdosRelayJwks,
  );
  rootMessenger.registerActionHandler(
    'KycService:createUkycSession',
    handlers.createUkycSession,
  );
  rootMessenger.registerActionHandler(
    'KycService:setAuthorizations',
    handlers.setAuthorizations,
  );
  rootMessenger.registerActionHandler(
    'KycService:createJourney',
    handlers.createJourney,
  );
  rootMessenger.registerActionHandler(
    'KycService:getSessionStatus',
    handlers.getSessionStatus,
  );
  rootMessenger.registerActionHandler(
    'KycService:getSessionStatusForVendor',
    handlers.getSessionStatusForVendor,
  );
  rootMessenger.registerActionHandler(
    'UserStorageController:performGetStorage',
    handlers.performGetStorage,
  );
  rootMessenger.registerActionHandler(
    'UserStorageController:performSetStorage',
    handlers.performSetStorage,
  );

  mockVerifyJwtChain.mockReturnValue({
    sessionServerPublicKeyX: 'spk-x',
    nonce: 'n',
  });
  mockWrapEncryptionKey.mockReturnValue({
    data: 'enc',
    nonce: 'nonce',
  });

  const launcher: Launcher = {
    isAvailable: jest.fn().mockReturnValue(true),
    launch: jest.fn().mockResolvedValue({ ok: true }),
  };

  const controller = new KycController({
    messenger,
    sumsubLauncher: launcher as unknown as KycSumSubLauncher,
    ...options,
  });

  return testFunction({
    controller,
    rootMessenger,
    handlers,
    launcher,
  });
}
