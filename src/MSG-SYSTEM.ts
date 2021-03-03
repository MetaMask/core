import { EventEmitter } from 'events';

interface AttenuatedMessageSystem {
  subscriptionIds: string[];
  call: () => void;
}

export function attenuatedMessageSystem(
  eventEmitter: EventEmitter,
  actionMap: Map<string, any>,
  allowedActions: string[],
  allowedSubscriptions: string[]
): AttenuatedMessageSystem {
  return Object.freeze({
    subscriptionIds: [],
    call: () => {},
  });
}
