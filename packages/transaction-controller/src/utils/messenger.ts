import type { ExtractEventHandler } from '@metamask/base-controller';

import type {
  TransactionControllerEvents,
  TransactionControllerMessenger,
} from '../TransactionController';
import type { TransactionMeta } from '../types';

type TransactionControllerEventType = TransactionControllerEvents['type'];

/**
 *
 * @param transactionId -
 * @param messenger -
 * @returns -
 */
export function getTransactionMetadataFromMessenger(
  transactionId: string,
  messenger: TransactionControllerMessenger,
): TransactionMeta | undefined {
  const state = messenger.call('TransactionController:getState');
  return state.transactions.find((tx) => tx.id === transactionId);
}

/**
 *
 * @param messenger -
 * @param eventType -
 * @param handler -
 * @param criteria -
 * @returns -
 */
export function messengerSubscribeOnceIf<
  EventType extends TransactionControllerEventType,
  Event extends TransactionControllerEvents & { type: EventType },
  HandlerParameters extends Event['payload'],
  Handler extends (...args: HandlerParameters) => void,
>(
  messenger: TransactionControllerMessenger,
  eventType: EventType,
  handler: Handler,
  criteria: (...args: HandlerParameters) => boolean,
): Handler {
  const internalHandler = ((...data: HandlerParameters) => {
    if (!criteria || criteria(...data)) {
      messengerTryUnsubscribe(messenger, eventType, internalHandler);
      handler(...data);
    }
  }) as ExtractEventHandler<Event>;

  messenger.subscribe(eventType, internalHandler);

  return internalHandler;
}

/**
 *
 * @param messenger -
 * @param eventType -
 * @param handler -
 */
function messengerTryUnsubscribe<
  EventType extends TransactionControllerEventType,
  Event extends TransactionControllerEvents & { type: EventType },
  HandlerParameters extends Event['payload'],
  Handler extends (...args: HandlerParameters) => void,
>(
  messenger: TransactionControllerMessenger,
  eventType: EventType,
  handler: Handler,
) {
  if (!handler) {
    return;
  }

  try {
    messenger.unsubscribe(eventType, handler as ExtractEventHandler<Event>);
  } catch (e) {
    // Ignore
  }
}
