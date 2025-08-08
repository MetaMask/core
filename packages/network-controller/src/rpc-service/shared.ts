/**
 * Equivalent to the built-in `FetchOptions` type, but renamed for clarity.
 */
export type FetchOptions = RequestInit;

/**
 * Extends an event listener that Cockatiel uses so that when it is called, more
 * data can be supplied in the event object.
 */
// If we have:
//
//     AddToCockatielEventData<
//       (data: void | { error: Error } | { value: unknown }) => void,
//       { foo: 'bar' }
//     >
//
// we want this to resolve as:
//
//    (data: { foo: 'bar' } | ({ error: Error } & { foo: 'bar' }) | ({ value: unknown } & { foo: 'bar' })) => void
//
// To do this we need to get TypeScript to distribute
// `void | { error: Error } | { value: unknown }) => void` over the condition
// (`Data extends void ? ... : ...`). The key to doing this right is placing the
// condition right at the point where we need to know what `Data` is and not
// before (that is, before `(data ...) => void`). If we did this, the above
// would resolve as:
//
//    (data: ((void | { error: Error } | { value: unknown }) & { foo: 'bar' }) => void
//
// which distributes to:
//
//    (data: (void & { foo: 'bar' }) | ({ error: Error } & { foo: 'bar' }) | ({ value: unknown } & { foo: 'bar' })) => void
//
// (which is not correct because `void & { foo: 'bar' }` doesn't make sense).
//
// There is some information on distributive conditional types here:
// <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-8.html#distributive-conditional-types>
// It is pretty technical, but the key insight is: "Distributive conditional
// types are automatically distributed over union types during instantiation."
// In this case, we need to place the condition so it becomes a part of the type
// that we want to "return" from this utility type and is not used to simply
// determine the return type. This way TypeScript evaluates the condition
// when that return type is used and not beforehand.
//
export type AddToCockatielEventData<EventListener, AdditionalData> =
  EventListener extends (data: infer Data) => void
    ? (data: Data extends void ? AdditionalData : Data & AdditionalData) => void
    : never;
