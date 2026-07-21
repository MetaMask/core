import { jest } from '@jest/globals';
import { ReadableStream } from 'node:stream/web';

import { flushPromises } from '../../../tests/helpers.js';
import type { QuoteStreamCompleteData, TokenFeature } from '../src/index.js';
import { QuoteResponseV1 } from '../src/validators/quote-response-v1.js';

type MockSseResponse = { status: number; ok: boolean; body: ReadableStream };

export const advanceToNthTimer = (nth = 1): void => {
  for (let i = 0; i < nth; i++) {
    jest.advanceTimersToNextTimer();
  }
};

export const advanceToNthTimerThenFlush = async (nth = 1): Promise<void> => {
  advanceToNthTimer(nth);
  await flushPromises();
};

/**
 * Generates a unique event id for the server event. This matches the id
 * used by the bridge-api
 *
 * @param index - the index of the event
 * @returns a unique event id
 */
const getEventId = (index: number): string => {
  return `${Date.now().toString()}-${index}`;
};

const emitLine = (
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  controller: ReadableStreamDefaultController,
  line: string,
): void => {
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
  mockQuotes: QuoteResponseV1[],
  delay: number = 3000,
): MockSseResponse => {
  return {
    status: 200,
    ok: true,
    body: new ReadableStream({
      start(controller): void {
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
 * @returns a delayed stream of quotes
 */
export const mockSseBatchSellEventSource = (
  mockQuotes: QuoteResponseV1[][],
  delay: number = 3000,
): MockSseResponse => {
  return {
    status: 200,
    ok: true,
    body: new ReadableStream({
      start(controller): void {
        setTimeout(() => {
          mockQuotes.forEach((quotes) => {
            quotes.forEach((quote, quoteIndex) => {
              emitLine(controller, `event: quote\n`);
              emitLine(controller, `id: ${getEventId(quoteIndex + 1)}\n`);
              emitLine(controller, `data: ${JSON.stringify(quote)}\n\n`);
            });
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
  mockQuotes: QuoteResponseV1[],
  delay: number = 4000,
): Promise<MockSseResponse> => {
  return {
    status: 200,
    ok: true,
    body: new ReadableStream({
      async start(controller): Promise<void> {
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
 * Simulates an SSE stream that emits both quote and token_warning events
 *
 * @param mockQuotes - a list of quotes to stream
 * @param mockWarnings - a list of token warnings to stream
 * @param delay - the delay in milliseconds
 * @returns a delayed stream of quotes and token warnings
 */
export const mockSseEventSourceWithWarnings = (
  mockQuotes: QuoteResponseV1[],
  mockWarnings: TokenFeature[],
  delay: number = 3000,
): MockSseResponse => {
  return {
    status: 200,
    ok: true,
    body: new ReadableStream({
      start(controller): void {
        setTimeout(() => {
          let eventIndex = 0;
          mockWarnings.forEach((warning) => {
            emitLine(controller, `event: token_warning\n`);
            // eslint-disable-next-line no-plusplus
            emitLine(controller, `id: ${getEventId(eventIndex++)}\n`);
            emitLine(controller, `data: ${JSON.stringify(warning)}\n\n`);
          });
          mockQuotes.forEach((quote) => {
            emitLine(controller, `event: quote\n`);
            // eslint-disable-next-line no-plusplus
            emitLine(controller, `id: ${getEventId(eventIndex++)}\n`);
            emitLine(controller, `data: ${JSON.stringify(quote)}\n\n`);
          });
          controller.close();
        }, delay);
      },
    }),
  };
};

/**
 * Simulates an SSE stream that emits quote, token_warning, and complete events
 *
 * @param mockQuotes - a list of quotes to stream
 * @param mockWarnings - a list of token warnings to stream
 * @param mockComplete - the complete event data to emit
 * @param delay - the delay in milliseconds
 * @returns a delayed stream of quotes, token warnings, and a complete event
 */
export const mockSseEventSourceWithComplete = (
  mockQuotes: QuoteResponseV1[],
  mockWarnings: TokenFeature[],
  mockComplete: QuoteStreamCompleteData,
  delay: number = 3000,
): MockSseResponse => {
  return {
    status: 200,
    ok: true,
    body: new ReadableStream({
      start(controller): void {
        setTimeout(() => {
          let eventIndex = 0;
          mockWarnings.forEach((warning) => {
            emitLine(controller, `event: token_warning\n`);
            // eslint-disable-next-line no-plusplus
            emitLine(controller, `id: ${getEventId(eventIndex++)}\n`);
            emitLine(controller, `data: ${JSON.stringify(warning)}\n\n`);
          });
          mockQuotes.forEach((quote) => {
            emitLine(controller, `event: quote\n`);
            // eslint-disable-next-line no-plusplus
            emitLine(controller, `id: ${getEventId(eventIndex++)}\n`);
            emitLine(controller, `data: ${JSON.stringify(quote)}\n\n`);
          });
          emitLine(controller, `event: complete\n`);
          // eslint-disable-next-line no-plusplus
          emitLine(controller, `id: ${getEventId(eventIndex++)}\n`);
          emitLine(controller, `data: ${JSON.stringify(mockComplete)}\n\n`);
          controller.close();
        }, delay);
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
): MockSseResponse => {
  return {
    status: 200,
    ok: true,
    body: new ReadableStream({
      start(controller): void {
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
