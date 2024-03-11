/**
 * TypeScript enforces this type for mixin constructors.
 *
 * Removing the `any` type results in the following error:
 * 'A mixin class must have a constructor with a single rest parameter of type 'any[]'.ts(2545)'
 *
 * A potential future refactor that removes the mixin pattern may be able to fix this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor = new (...args: any[]) => object;
