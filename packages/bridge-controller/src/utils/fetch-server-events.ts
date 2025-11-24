/**
 * Streams server-sent events from the given URL
 *
 * @param url - The URL to stream events from
 * @param options - The options for the SSE stream
 * @param options.onMessage - The function to call when a message is received
 * @param options.onError - The function to call when an error occurs
 * @param options.onClose - The function to call when the stream finishes successfully
 * @param options.fetchFn - The function to use to fetch the events. Consumers need to provide a fetch function that supports server-sent events.
 */
export const fetchServerEvents = async (
  url: string,
  {
    onMessage,
    onError,
    onClose,
    fetchFn,
    ...requestOptions
  }: RequestInit & {
    onMessage: (data: Record<string, unknown>, eventName?: string) => void;
    onError?: (err: unknown) => void;
    onClose?: () => void | Promise<void>;
    fetchFn: typeof fetch;
  },
) => {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetchFn(url, requestOptions);
    if (!response.ok || !response.body) {
      throw new Error(`${response.status}`);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Split SSE messages at double newlines
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      // Split chunks into lines and parse the data
      for (const chunk of parts) {
        const lines = chunk.split('\n');
        let eventName: string | undefined;
        const dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (eventName === 'error') {
          throw new Error(`Bridge-api error: ${dataLines.join('\n')}`);
        }
        if (dataLines.length > 0) {
          const parsedJSONData = JSON.parse(dataLines.join('\n'));
          onMessage(parsedJSONData, eventName);
        }
      }
    }
    await onClose?.();
  } catch (error) {
    onError?.(error);
  } finally {
    try {
      await reader?.cancel();
    } catch (error) {
      console.error('Error cleaning up stream reader', error);
    }
  }
};
