import type {
  CockatielEvent,
  CockatielEventEmitter,
} from '@metamask/controller-utils';

/**
 * Equivalent to the built-in `FetchOptions` type, but renamed for clarity.
 */
export type FetchOptions = RequestInit;

/**
 * Converts a Cockatiel event type to an event emitter type.
 */
export type CockatielEventToEventEmitter<Event> =
  Event extends CockatielEvent<infer EventData>
    ? CockatielEventEmitter<EventData>
    : never;

/**
 * Obtains the event data type from a Cockatiel event or event listener type.
 */
export type ExtractCockatielEventData<CockatielEventOrEventListener> =
  CockatielEventOrEventListener extends CockatielEvent<infer Data>
    ? Data
    : CockatielEventOrEventListener extends (data: infer Data) => void
      ? Data
      : never;

/**
 * Extends the data that a Cockatiel event listener is called with additional
 * data.
 */
export type ExtendCockatielEventData<OriginalData, AdditionalData> =
  OriginalData extends void ? AdditionalData : OriginalData & AdditionalData;

/**
 * Removes keys from the data that a Cockatiel event listner is called with.
 */
export type ExcludeCockatielEventData<
  OriginalData,
  Keys extends PropertyKey,
> = OriginalData extends void ? void : Omit<OriginalData, Keys>;

/**
 * Converts a Cockatiel event type to an event listener type, but adding the
 * requested data.
 */
export type CockatielEventToEventListenerWithData<Event, Data> = (
  data: ExtendCockatielEventData<ExtractCockatielEventData<Event>, Data>,
) => void;

/**
 * Converts a Cockatiel event listener type to an event emitter type.
 */
export type CockatielEventToEventEmitterWithData<Event, Data> =
  CockatielEventEmitter<
    ExtendCockatielEventData<ExtractCockatielEventData<Event>, Data>
  >;
