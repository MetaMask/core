import { QuoteStatusState } from './constants';
import { QuoteStatusStateFsm } from './quote-status-state-fsm';

describe('QuoteStatusStateFsm', () => {
  describe('constructor', () => {
    it('defaults to the Submitted state', () => {
      expect(new QuoteStatusStateFsm().state).toBe(QuoteStatusState.Submitted);
    });

    it('uses the provided initial state', () => {
      expect(
        new QuoteStatusStateFsm(QuoteStatusState.FinalizedSuccess).state,
      ).toBe(QuoteStatusState.FinalizedSuccess);
    });
  });

  describe('canTransitionTo', () => {
    it('returns true for an allowed transition', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Submitted);

      expect(fsm.canTransitionTo(QuoteStatusState.FinalizedSuccess)).toBe(true);
    });

    it('returns false for a disallowed transition', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Submitted);

      expect(fsm.canTransitionTo(QuoteStatusState.Completed)).toBe(false);
    });

    it('returns false from a terminal state', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Completed);

      expect(fsm.canTransitionTo(QuoteStatusState.Submitted)).toBe(false);
    });

    it('treats an unknown/legacy state as terminal', () => {
      const fsm = new QuoteStatusStateFsm('LEGACY_STATE' as QuoteStatusState);

      expect(fsm.canTransitionTo(QuoteStatusState.Submitted)).toBe(false);
    });
  });

  describe('transitionTo', () => {
    it('applies an allowed transition and returns true', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Submitted);

      const result = fsm.transitionTo(QuoteStatusState.FinalizedSuccess);

      expect(result).toBe(true);
      expect(fsm.state).toBe(QuoteStatusState.FinalizedSuccess);
    });

    it('does not apply a disallowed transition and returns false', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Submitted);

      const result = fsm.transitionTo(QuoteStatusState.Completed);

      expect(result).toBe(false);
      expect(fsm.state).toBe(QuoteStatusState.Submitted);
    });

    it('emits a state update event on a successful transition', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Submitted);
      const listener = jest.fn();
      fsm.onStateUpdate(listener);

      fsm.transitionTo(QuoteStatusState.FinalizedSuccess);

      expect(listener).toHaveBeenCalledWith({
        previousState: QuoteStatusState.Submitted,
        nextState: QuoteStatusState.FinalizedSuccess,
      });
    });

    it('does not emit an event on a failed transition', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Submitted);
      const listener = jest.fn();
      fsm.onStateUpdate(listener);

      fsm.transitionTo(QuoteStatusState.Completed);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('onStateUpdate', () => {
    it('notifies every subscribed listener', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Submitted);
      const first = jest.fn();
      const second = jest.fn();
      fsm.onStateUpdate(first);
      fsm.onStateUpdate(second);

      fsm.transitionTo(QuoteStatusState.FinalizedSuccess);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('stops notifying a listener after it unsubscribes', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Submitted);
      const listener = jest.fn();
      const unsubscribe = fsm.onStateUpdate(listener);

      unsubscribe();
      fsm.transitionTo(QuoteStatusState.FinalizedSuccess);

      expect(listener).not.toHaveBeenCalled();
    });

    it('allows a listener to unsubscribe itself during emission', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Submitted);
      const calls: string[] = [];
      const unsubscribe = fsm.onStateUpdate(() => {
        calls.push('self');
        unsubscribe();
      });
      const other = jest.fn(() => calls.push('other'));
      fsm.onStateUpdate(other);

      fsm.transitionTo(QuoteStatusState.FinalizedSuccess);

      expect(calls).toStrictEqual(['self', 'other']);
      expect(other).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeAllListeners', () => {
    it('removes every subscribed listener', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.Submitted);
      const listener = jest.fn();
      fsm.onStateUpdate(listener);

      fsm.removeAllListeners();
      fsm.transitionTo(QuoteStatusState.FinalizedSuccess);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('toJson', () => {
    it('serializes the current state to a plain object', () => {
      const fsm = new QuoteStatusStateFsm(QuoteStatusState.FinalizedFailed);

      expect(fsm.toJson()).toStrictEqual({
        state: QuoteStatusState.FinalizedFailed,
      });
    });
  });
});
