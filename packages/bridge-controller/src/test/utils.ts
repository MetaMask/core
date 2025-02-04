export function flushPromises() {
  return new Promise(jest.requireActual('timers').setImmediate);
}
