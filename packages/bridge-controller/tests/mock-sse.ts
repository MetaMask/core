import * as eventSource from '@microsoft/fetch-event-source';

import { flushPromises } from '../../../tests/helpers';
import type { QuoteResponse, TxData } from '../src';

export const advanceToNthTimer = (n = 1) => {
  for (let i = 0; i < n; i++) {
    jest.advanceTimersToNextTimer();
  }
};

export const advanceToNthTimerThenFlush = async (n = 1) => {
  advanceToNthTimer(n);
  await flushPromises();
};

const mockOnOpen = (onOpen?: (response: Response) => Promise<void>) =>
  setTimeout(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    onOpen?.({ ok: true } as Response);
  }, 1000);

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

/**
 * This simulates responses from the fetchEventSource function for unit tests
 * onopen, onmessage and onerror callbacks are executed based on this sequence: https://github.com/Azure/fetch-event-source/blob/main/src/fetch.ts#L102-L127
 *
 * @param mockQuotes1 - a list of quotes to stream
 * @param mockQuotes2 - a list of quotes to stream
 *
 * @returns a mock of the fetchEventSource function
 */
export const mockSseEventSource = (
  mockQuotes1: QuoteResponse<string | TxData>[],
  mockQuotes2: QuoteResponse<string | TxData>[],
) =>
  jest
    .spyOn(eventSource, 'fetchEventSource')
    // Valid quotes
    .mockImplementationOnce(async (_, { onopen, onmessage, onclose }) => {
      mockOnOpen(onopen);
      setTimeout(() => {
        mockQuotes1.forEach((quote, id) => {
          onmessage?.({
            data: JSON.stringify(quote),
            event: 'quote',
            id: getEventId(id + 1),
          });
        });
        onclose?.();
      }, 4000);
    })
    // Valid quotes
    .mockImplementationOnce(async (_, { onopen, onmessage, onclose }) => {
      mockOnOpen(onopen);
      setTimeout(() => {
        onmessage?.({
          data: JSON.stringify(mockQuotes2[0]),
          event: 'quote',
          id: getEventId(1),
        });
      }, 9000);
      await Promise.resolve();
      setTimeout(() => {
        onmessage?.({
          data: JSON.stringify(mockQuotes2[1]),
          event: 'quote',
          id: getEventId(2),
        });
        onclose?.();
      }, 9000);
    })
    // Catches a network error
    .mockImplementationOnce(async (_, { onopen, onerror, onclose }) => {
      mockOnOpen(onopen);
      onerror?.('Network error');
      onclose?.();
    })
    .mockImplementationOnce(async (_, { onopen, onmessage, onclose }) => {
      mockOnOpen(onopen);
      [...mockQuotes1, ...mockQuotes1].forEach((quote, id) => {
        setTimeout(() => {
          onmessage?.({
            data: JSON.stringify(quote),
            event: 'quote',
            id: getEventId(id + 1),
          });
          // eslint-disable-next-line no-empty-function
          Promise.resolve().catch(() => {});
          if (id === mockQuotes1.length - 1) {
            onclose?.();
          }
        }, 2000 + id);
      });
    })
    // Returns valid and invalid quotes
    .mockImplementationOnce(async (_, { onopen, onmessage, onclose }) => {
      mockOnOpen(onopen);
      setTimeout(() => {
        onmessage?.({
          data: JSON.stringify({
            ...mockQuotes2[1],
            trade: { abc: '123' },
          }),
          event: 'quote',
          id: 'invalidId',
        });
      }, 2000);
      setTimeout(() => {
        onmessage?.({
          data: '',
          event: 'quote',
          id: getEventId(2),
        });
      }, 3000);
      setTimeout(() => {
        onmessage?.({
          data: JSON.stringify(mockQuotes2[0]),
          event: 'quote',
          id: getEventId(3),
        });
      }, 4000);
      setTimeout(() => {
        const { quote, ...rest } = mockQuotes1[0];
        onmessage?.({
          data: JSON.stringify(rest),
          event: 'quote',
          id: getEventId(4),
        });
        onclose?.();
      }, 6000);
    });
