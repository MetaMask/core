import type { Draft } from 'immer';
import * as sinon from 'sinon';

import { BaseController } from './BaseControllerV2';

interface MockControllerState {
  count: number;
}

class MockController extends BaseController<MockControllerState> {
  update(callback: (state: Draft<MockControllerState>) => void | MockControllerState) {
    super.update(callback);
  }

  destroy() {
    super.destroy();
  }
}

describe('BaseController', () => {
  it('should set initial state', () => {
    const controller = new MockController({ count: 0 });

    expect(controller.state).toEqual({ count: 0 });
  });

  it('should not allow mutating state directly', () => {
    const controller = new MockController({ count: 0 });

    expect(() => {
      controller.state = { count: 1 };
    }).toThrow();
  });

  it('should allow updating state by modifying draft', () => {
    const controller = new MockController({ count: 0 });

    controller.update((draft) => {
      draft.count += 1;
    });

    expect(controller.state).toEqual({ count: 1 });
  });

  it('should allow updating state by return a value', () => {
    const controller = new MockController({ count: 0 });

    controller.update(() => {
      return { count: 1 };
    });

    expect(controller.state).toEqual({ count: 1 });
  });

  it('should throw an error if update callback modifies draft and returns value', () => {
    const controller = new MockController({ count: 0 });

    expect(() => {
      controller.update((draft) => {
        draft.count += 1;
        return { count: 10 };
      });
    }).toThrow();
  });

  it('should inform subscribers of state changes', () => {
    const controller = new MockController({ count: 0 });
    const listener1 = sinon.stub();
    const listener2 = sinon.stub();

    controller.subscribe(listener1);
    controller.subscribe(listener2);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toEqual(1);
    expect(listener1.firstCall.args).toEqual([{ count: 1 }, [{ op: 'replace', path: [], value: { count: 1 } }]]);
    expect(listener2.callCount).toEqual(1);
    expect(listener2.firstCall.args).toEqual([{ count: 1 }, [{ op: 'replace', path: [], value: { count: 1 } }]]);
  });

  it('should inform a subscriber of each state change once even after multiple subscriptions', () => {
    const controller = new MockController({ count: 0 });
    const listener1 = sinon.stub();

    controller.subscribe(listener1);
    controller.subscribe(listener1);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toEqual(1);
    expect(listener1.firstCall.args).toEqual([{ count: 1 }, [{ op: 'replace', path: [], value: { count: 1 } }]]);
  });

  it('should no longer inform a subscriber about state changes after unsubscribing', () => {
    const controller = new MockController({ count: 0 });
    const listener1 = sinon.stub();

    controller.subscribe(listener1);
    controller.unsubscribe(listener1);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toEqual(0);
  });

  it('should no longer inform a subscriber about state changes after unsubscribing once, even if they subscribed many times', () => {
    const controller = new MockController({ count: 0 });
    const listener1 = sinon.stub();

    controller.subscribe(listener1);
    controller.subscribe(listener1);
    controller.unsubscribe(listener1);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toEqual(0);
  });

  it('should allow unsubscribing listeners who were never subscribed', () => {
    const controller = new MockController({ count: 0 });
    const listener1 = sinon.stub();

    expect(() => {
      controller.unsubscribe(listener1);
    }).not.toThrow();
  });

  it('should no longer update subscribers after being destroyed', () => {
    const controller = new MockController({ count: 0 });
    const listener1 = sinon.stub();
    const listener2 = sinon.stub();

    controller.subscribe(listener1);
    controller.subscribe(listener2);
    controller.destroy();
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toEqual(0);
    expect(listener2.callCount).toEqual(0);
  });
});
