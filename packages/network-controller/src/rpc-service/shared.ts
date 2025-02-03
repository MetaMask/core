/**
 * Equivalent to the built-in `FetchOptions` type, but renamed for clarity.
 */
export type FetchOptions = RequestInit;

/**
 * Extends an event listener that Cockatiel uses so that when it is called, more
 * data can be supplied in the event object.
 */
export type AddToCockatielEventData<EventListener, AdditionalData> =
  EventListener extends (data: infer Data) => void
    ? // Prevent Data from being split if it's a type union
      [Data] extends [void]
      ? (data: AdditionalData) => void
      : (data: Data & AdditionalData) => void
    : never;
