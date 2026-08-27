/**
 * PerpsController funding-session action tests.
 *
 * These cover the controller methods that wrap the pure transition guards
 * (services/fundingSessionTransitions.ts) against `state.fundingSessions`:
 * find-by-id, apply transition, replace in state, prune terminal sessions.
 *
 * Pruning policy (D8): at most 20 terminal (completed/failed) sessions are
 * retained, evicting oldest-first by updatedAt. Non-terminal sessions
 * (preflight/active/paused) are never pruned.
 */

import {
  PerpsController,
  getDefaultPerpsControllerState,
} from '../../src/PerpsController.js';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import type { PerpsPlatformDependencies } from '../../src/types/index.js';
import type { FundingLeg, FundingSession } from '../../src/types/index.js';
import { createMockHyperLiquidProvider } from '../helpers/providerMocks.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks.js';

jest.mock('@nktkas/hyperliquid', () => ({}));
jest.mock('@myx-trade/sdk', () => ({
  MyxClient: jest.fn(),
  OrderStatusEnum: { Successful: 9 },
}));
jest.mock('../../src/providers/HyperLiquidProvider');
jest.mock('../../src/providers/MYXProvider');
jest.mock('@metamask/utils', () => ({
  ...jest.requireActual('@metamask/utils'),
  formatAccountToCaipAccountId: jest
    .fn()
    .mockReturnValue('eip155:1:0x1234567890123456789012345678901234567890'),
}));

const ACCOUNT_ADDRESS = '0xAbC0000000000000000000000000000000000001';

/**
 * A representative template leg as the funding composer would pass it.
 *
 * @param overrides - Optional leg field overrides.
 * @returns A template leg.
 */
const buildTemplateLeg = (overrides: Partial<FundingLeg> = {}): FundingLeg => ({
  kind: 'swap',
  capability: { requiresDeviceSignature: false, silent: true },
  status: 'pending',
  ...overrides,
});

/**
 * A persisted session seed for find-by-id action tests.
 *
 * @param overrides - Optional session field overrides.
 * @returns A seeded session.
 */
const buildSeedSession = (
  overrides: Partial<FundingSession> = {},
): FundingSession => ({
  id: 'funding-test-1',
  accountAddress: ACCOUNT_ADDRESS.toLowerCase(),
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  status: 'active',
  legs: [
    buildTemplateLeg({ status: 'confirmed' }),
    buildTemplateLeg({ kind: 'deposit' }),
  ],
  ...overrides,
});

/**
 * A terminal session seed for pruning tests, keyed by updatedAt.
 *
 * @param updatedAt - The updatedAt timestamp (also used to build the id).
 * @param status - Which terminal status the session has.
 * @returns A terminal session.
 */
const buildTerminalSession = (
  updatedAt: number,
  status: 'completed' | 'failed' = 'completed',
): FundingSession => ({
  id: `funding-terminal-${updatedAt}`,
  accountAddress: ACCOUNT_ADDRESS.toLowerCase(),
  createdAt: updatedAt - 1_000,
  updatedAt,
  status,
  legs: [buildTemplateLeg({ status: 'confirmed' })],
});

describe('PerpsController funding sessions', () => {
  let controller: PerpsController;
  let mockInfrastructure: jest.Mocked<PerpsPlatformDependencies>;

  const buildController = (fundingSessions: FundingSession[] = []): void => {
    mockInfrastructure = createMockInfrastructure();
    const mockProvider = createMockHyperLiquidProvider();
    HyperLiquidProvider.mockImplementation(
      () => mockProvider as never as InstanceType<typeof HyperLiquidProvider>,
    );
    controller = new PerpsController({
      messenger: createMockMessenger(),
      state: { ...getDefaultPerpsControllerState(), fundingSessions },
      infrastructure: mockInfrastructure,
    });
  };

  beforeEach(() => {
    buildController();
  });

  describe('startFundingSession', () => {
    it('creates a preflight session with normalized pending legs and stores it newest-first', () => {
      // Arrange: template legs carry stale runtime fields from a prior attempt.
      const before = Date.now();
      const templateLegs: FundingLeg[] = [
        buildTemplateLeg({
          status: 'submitted',
          externalId: 'stale-tx',
          failure: { reason: 'stale', retryable: true, at: 1 },
        }),
        buildTemplateLeg({
          kind: 'deposit',
          capability: { requiresDeviceSignature: true, silent: false },
        }),
      ];

      // Act
      const session = controller.startFundingSession(
        ACCOUNT_ADDRESS,
        templateLegs,
      );

      // Assert
      expect(session.status).toBe('preflight');
      expect(session.id).toMatch(/^funding-/u);
      expect(session.accountAddress).toBe(ACCOUNT_ADDRESS.toLowerCase());
      expect(session.createdAt).toBeGreaterThanOrEqual(before);
      expect(session.updatedAt).toBeGreaterThanOrEqual(before);
      expect(session.legs).toHaveLength(2);
      for (const leg of session.legs) {
        expect(leg.status).toBe('pending');
        expect(leg.externalId).toBeUndefined();
        expect(leg.failure).toBeUndefined();
      }
      expect(controller.state.fundingSessions[0]).toStrictEqual(session);
    });
  });

  describe('markPreflightPassed', () => {
    it('transitions preflight to active and replaces the session in state', () => {
      // Arrange
      buildController([buildSeedSession({ status: 'preflight' })]);
      const before = Date.now();

      // Act
      const updated = controller.markPreflightPassed('funding-test-1');

      // Assert
      expect(updated.status).toBe('active');
      expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
      expect(controller.state.fundingSessions).toHaveLength(1);
      expect(controller.state.fundingSessions[0]).toStrictEqual(updated);
    });
  });

  describe('failPreflight', () => {
    it('transitions preflight to failed without persisting the reason', () => {
      // Arrange
      const seed = buildSeedSession({ status: 'preflight' });
      buildController([seed]);

      // Act
      const updated = controller.failPreflight('funding-test-1', 'geo blocked');

      // Assert: the reason is accepted but never stored on the session.
      expect(updated.status).toBe('failed');
      expect(controller.state.fundingSessions[0]).toStrictEqual({
        ...seed,
        status: 'failed',
        updatedAt: expect.any(Number),
      });
    });

    it('logs the preflight failure reason without persisting it', () => {
      // Arrange
      buildController([buildSeedSession({ status: 'preflight' })]);

      // Act
      controller.failPreflight('funding-test-1', 'insufficient balance');

      // Assert
      expect(mockInfrastructure.debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('preflight failed'),
        expect.objectContaining({
          sessionId: 'funding-test-1',
          reason: 'insufficient balance',
        }),
      );
    });
  });

  describe('leg lifecycle actions', () => {
    it('legAwaitingSignature moves a pending leg to awaiting_signature', () => {
      // Arrange
      buildController([buildSeedSession()]);

      // Act
      const updated = controller.legAwaitingSignature('funding-test-1', 1);

      // Assert
      expect(updated.legs[1]?.status).toBe('awaiting_signature');
      expect(updated.legs[0]?.status).toBe('confirmed');
    });

    it('legSubmitted stores the external id on the leg', () => {
      // Arrange
      buildController([
        buildSeedSession({
          legs: [
            buildTemplateLeg({ status: 'confirmed' }),
            buildTemplateLeg({ status: 'awaiting_signature' }),
          ],
        }),
      ]);

      // Act
      const updated = controller.legSubmitted(
        'funding-test-1',
        1,
        'bridge-status-tx-9',
      );

      // Assert
      expect(updated.legs[1]?.status).toBe('submitted');
      expect(updated.legs[1]?.externalId).toBe('bridge-status-tx-9');
    });

    it('legConfirmed confirms the leg and keeps the session active', () => {
      // Arrange: the last leg confirming must NOT complete the session —
      // completion is driven by mobile-side credit detection.
      buildController([
        buildSeedSession({
          legs: [
            buildTemplateLeg({ status: 'submitted' }),
            buildTemplateLeg({ status: 'submitted' }),
          ],
        }),
      ]);

      // Act
      const updated = controller.legConfirmed('funding-test-1', 1);

      // Assert
      expect(updated.legs[1]?.status).toBe('confirmed');
      expect(updated.status).toBe('active');
    });

    it('legFailed records the failure reason and retryable flag', () => {
      // Arrange
      buildController([
        buildSeedSession({
          legs: [buildTemplateLeg({ status: 'submitted' })],
        }),
      ]);

      // Act
      const updated = controller.legFailed(
        'funding-test-1',
        0,
        'bridge expired',
        true,
      );

      // Assert
      expect(updated.legs[0]?.status).toBe('failed');
      expect(updated.legs[0]?.failure).toStrictEqual(
        expect.objectContaining({
          reason: 'bridge expired',
          retryable: true,
        }),
      );
    });

    it('retryLeg returns a retryable failed leg to pending and clears the failure', () => {
      // Arrange
      buildController([
        buildSeedSession({
          legs: [
            buildTemplateLeg({ status: 'confirmed' }),
            buildTemplateLeg({
              status: 'failed',
              failure: { reason: 'slippage', retryable: true, at: 1 },
            }),
          ],
        }),
      ]);

      // Act
      const updated = controller.retryLeg('funding-test-1', 1);

      // Assert
      expect(updated.legs[1]?.status).toBe('pending');
      expect(updated.legs[1]?.failure).toBeUndefined();
      expect(updated.legs[1]?.externalId).toBeUndefined();
    });
  });

  describe('pause and resume', () => {
    it('pauseSession transitions active to paused', () => {
      // Arrange
      buildController([buildSeedSession()]);

      // Act
      const updated = controller.pauseSession('funding-test-1');

      // Assert
      expect(updated.status).toBe('paused');
      expect(controller.state.fundingSessions[0]?.status).toBe('paused');
    });

    it('resumeSession transitions paused to active', () => {
      // Arrange
      buildController([buildSeedSession({ status: 'paused' })]);

      // Act
      const updated = controller.resumeSession('funding-test-1');

      // Assert
      expect(updated.status).toBe('active');
      expect(controller.state.fundingSessions[0]?.status).toBe('active');
    });
  });

  describe('completeSession', () => {
    it('transitions active to completed', () => {
      // Arrange
      buildController([buildSeedSession()]);

      // Act
      const updated = controller.completeSession('funding-test-1');

      // Assert
      expect(updated.status).toBe('completed');
      expect(controller.state.fundingSessions[0]?.status).toBe('completed');
    });
  });

  describe('unknown session ids', () => {
    const unknownIdActions: {
      name: string;
      act: (target: PerpsController, id: string) => unknown;
    }[] = [
      {
        name: 'markPreflightPassed',
        act: (target, id) => target.markPreflightPassed(id),
      },
      {
        name: 'failPreflight',
        act: (target, id) => target.failPreflight(id, 'x'),
      },
      {
        name: 'legAwaitingSignature',
        act: (target, id) => target.legAwaitingSignature(id, 0),
      },
      {
        name: 'legSubmitted',
        act: (target, id) => target.legSubmitted(id, 0, 'ext'),
      },
      { name: 'legConfirmed', act: (target, id) => target.legConfirmed(id, 0) },
      {
        name: 'legFailed',
        act: (target, id) => target.legFailed(id, 0, 'r', false),
      },
      { name: 'retryLeg', act: (target, id) => target.retryLeg(id, 0) },
      { name: 'pauseSession', act: (target, id) => target.pauseSession(id) },
      { name: 'resumeSession', act: (target, id) => target.resumeSession(id) },
      {
        name: 'completeSession',
        act: (target, id) => target.completeSession(id),
      },
    ];

    it.each(unknownIdActions)(
      '$name throws a clear error for an unknown id',
      ({ act }) => {
        // Arrange: default (empty) state — no session exists.

        // Act + Assert
        expect(() => act(controller, 'funding-missing')).toThrow(
          'Funding session funding-missing: not found',
        );
      },
    );
  });

  describe('invalid transitions propagate from the pure guards', () => {
    it('completeSession on a preflight session throws', () => {
      // Arrange
      buildController([buildSeedSession({ status: 'preflight' })]);

      // Act + Assert
      expect(() => controller.completeSession('funding-test-1')).toThrow(
        /cannot complete from status 'preflight'/u,
      );
    });

    it('legConfirmed cannot skip awaiting_signature', () => {
      // Arrange
      buildController([buildSeedSession()]);

      // Act + Assert
      expect(() => controller.legConfirmed('funding-test-1', 1)).toThrow(
        /cannot apply 'confirmed' to leg in status 'pending'/u,
      );
    });

    it('retryLeg rejects a non-retryable failure', () => {
      // Arrange
      buildController([
        buildSeedSession({
          legs: [
            buildTemplateLeg({
              status: 'failed',
              failure: { reason: 'r', retryable: false, at: 1 },
            }),
          ],
        }),
      ]);

      // Act + Assert
      expect(() => controller.retryLeg('funding-test-1', 0)).toThrow(
        /failure is not retryable/u,
      );
    });
  });

  describe('terminal session pruning', () => {
    it('keeps at most 20 terminal sessions, evicting the oldest by updatedAt', () => {
      // Arrange: 21 terminal sessions, seeded out of order so eviction is
      // proven to depend on updatedAt, not array position (oldest is last).
      const terminal: FundingSession[] = [];
      for (let updatedAt = 1000; updatedAt <= 1020; updatedAt += 1) {
        terminal.push(buildTerminalSession(updatedAt));
      }
      buildController([terminal[20], ...terminal.slice(0, 20)]);

      // Act: any write triggers pruning.
      controller.startFundingSession(ACCOUNT_ADDRESS, [buildTemplateLeg()]);

      // Assert: the 20 newest terminals survive, fs-1000 is evicted, and the
      // new non-terminal session is untouched.
      const ids = controller.state.fundingSessions.map((session) => session.id);
      expect(ids).not.toContain('funding-terminal-1000');
      expect(ids).toContain('funding-terminal-1020');
      expect(ids).toContain('funding-terminal-1001');
      const terminalCount = controller.state.fundingSessions.filter(
        (session) =>
          session.status === 'completed' || session.status === 'failed',
      ).length;
      expect(terminalCount).toBe(20);
      expect(controller.state.fundingSessions).toHaveLength(21);
    });

    it('never prunes non-terminal sessions even when over the terminal cap', () => {
      // Arrange: 25 terminals + one session in every non-terminal status.
      const terminal: FundingSession[] = [];
      for (let updatedAt = 1000; updatedAt <= 1024; updatedAt += 1) {
        terminal.push(buildTerminalSession(updatedAt));
      }
      buildController([
        ...terminal,
        buildSeedSession({ id: 'funding-active', status: 'active' }),
        buildSeedSession({ id: 'funding-paused', status: 'paused' }),
        buildSeedSession({ id: 'funding-preflight', status: 'preflight' }),
      ]);

      // Act
      controller.startFundingSession(ACCOUNT_ADDRESS, [buildTemplateLeg()]);

      // Assert
      const ids = controller.state.fundingSessions.map((session) => session.id);
      expect(ids).toContain('funding-active');
      expect(ids).toContain('funding-paused');
      expect(ids).toContain('funding-preflight');
      expect(ids).not.toContain('funding-terminal-1000');
      expect(ids).not.toContain('funding-terminal-1004');
      expect(ids).toContain('funding-terminal-1024');
      const terminalCount = controller.state.fundingSessions.filter(
        (session) =>
          session.status === 'completed' || session.status === 'failed',
      ).length;
      expect(terminalCount).toBe(20);
    });

    it('prunes on lifecycle writes, not only on start', () => {
      // Arrange: 20 terminals + a preflight session (right at the cap).
      const terminal: FundingSession[] = [];
      for (let updatedAt = 1000; updatedAt <= 1019; updatedAt += 1) {
        terminal.push(buildTerminalSession(updatedAt));
      }
      buildController([
        ...terminal,
        buildSeedSession({ id: 'funding-preflight', status: 'preflight' }),
      ]);

      // Act: failing the preflight creates a 21st terminal session.
      controller.failPreflight('funding-preflight', 'user cancelled');

      // Assert: the oldest seeded terminal is evicted to make room.
      const ids = controller.state.fundingSessions.map((session) => session.id);
      expect(ids).not.toContain('funding-terminal-1000');
      expect(ids).toContain('funding-preflight');
      expect(controller.state.fundingSessions).toHaveLength(20);
    });
  });
});
