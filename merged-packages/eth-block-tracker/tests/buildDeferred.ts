/**
 * Builds a promise and exposes its `resolve` function such that the promise can
 * be awaited and resolved outside of the Promise constructor.
 *
 * @returns The promise and its `resolve` function.
 */
export default function buildDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let unwrappedResolve: (value: T) => void;
  const promise = new Promise<T>((r) => (unwrappedResolve = r));
  const resolve = (value: T) => unwrappedResolve(value);
  return { promise, resolve };
}
