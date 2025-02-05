export const flushPromises = () =>
  new Promise((resolve) => jest.requireActual('timers').setImmediate(resolve));
