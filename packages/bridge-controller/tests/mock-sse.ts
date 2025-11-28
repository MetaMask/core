// eslint-disable-next-line @typescript-eslint/no-shadow
import { ReadableStream } from 'node:stream/web';

import { flushPromises } from '../../../tests/helpers';
import type { QuoteResponse, Trade } from '../src';

export const advanceToNthTimer = (n = 1) => {
  for (let i = 0; i < n; i++) {
    jest.advanceTimersToNextTimer();
  }
};

export const advanceToNthTimerThenFlush = async (n = 1) => {
  advanceToNthTimer(n);
  await flushPromises();
};

/**
 * Generates a unique event id for the server event. This matches the id
 * used by the bridge-api
 *
 * @param index - the index of the event
 * @returns a unique event id
 */
const getEventId = (index: number) => {
  return `${Date.now().toString()}-${index}`;
};

const emitLine = (
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  controller: ReadableStreamDefaultController,
  line: string,
) => {
  controller.enqueue(Buffer.from(line));
};

/**
 * This simulates responses from the fetch function for unit tests
 *
 * @param mockQuotes - a list of quotes to stream
 * @param delay - the delay in milliseconds
 * @returns a delayed stream of quotes
 */
export const mockSseEventSource = (
  mockQuotes: QuoteResponse[],
  delay: number = 3000,
) => {
  return {
    status: 200,
    ok: true,
    body: new ReadableStream({
      start(controller) {
        setTimeout(() => {
          mockQuotes.forEach((quote, id) => {
            emitLine(controller, `event: quote\n`);
            emitLine(controller, `id: ${getEventId(id + 1)}\n`);
            emitLine(controller, `data: ${JSON.stringify(quote)}\n\n`);
          });
          controller.close();
        }, delay);
      },
    }),
  };
};

/**
 * This simulates responses from the fetch function for unit tests
 *
 * @param mockQuotes - a list of quotes to stream
 * @param delay - the delay in milliseconds
 * @returns a stream of quotes with multiple delays in between each quote
 */
export const mockSseEventSourceWithMultipleDelays = async (
  mockQuotes: QuoteResponse<Trade, Trade>[],
  delay: number = 4000,
) => {
  return {
    status: 200,
    ok: true,
    body: new ReadableStream({
      async start(controller) {
        mockQuotes.forEach((quote, id) => {
          setTimeout(
            () => {
              emitLine(controller, `event: quote\n`);
              emitLine(controller, `id: ${getEventId(id + 1)}\n`);
              emitLine(controller, `data: ${JSON.stringify(quote)}\n\n`);
              if (id === mockQuotes.length - 1) {
                controller.close();
              }
            },
            delay * (id + 1),
          );
        });
      },
    }),
  };
};

/**
 * This simulates responses from the fetch function for unit tests
 *
 * @param errorMessage - the error message to rethrow
 * @param delay - the delay in milliseconds
 * @returns a delayed stream of quotes
 */
export const mockSseServerError = (
  errorMessage: string,
  delay: number = 3000,
) => {
  return {
    status: 200,
    ok: true,
    body: new ReadableStream({
      start(controller) {
        setTimeout(() => {
          emitLine(controller, `event: error\n`);
          emitLine(controller, `id: ${getEventId(1)}\n`);
          emitLine(controller, `data: ${errorMessage}\n\n`);
          controller.close();
        }, delay);
      },
    }),
  };
};
