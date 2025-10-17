export type SSEMessage = {
  event?: string;
  data: string;
};

export type SSEOptions = RequestInit & {
  onMessage: (data: unknown, event?: string) => void;
  onError?: (err: Error) => void;
};

/**
 * Streams server-sent events from the given URL
 *
 * @param url - The URL to stream events from
 * @param options - The options for the SSE stream
 */
export const fetchServerEvents = async (url: string, options: SSEOptions) => {
  const controller = new AbortController();
  const signal = options.signal ?? controller.signal;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok || !response.body) {
      throw new Error(`${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // parse SSE messages on double newline
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

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

        if (dataLines.length > 0) {
          const rawData = dataLines.join('\n');
          options.onMessage(JSON.parse(rawData), eventName);
        }
      }
    }
  } catch (error) {
    options.onError?.(error);
  }
};
