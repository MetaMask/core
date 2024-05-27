const METAMASK_ENVIRONMENT = 'production';

// flushAt controls how many events are sent to segment at once. Segment will
// hold onto a queue of events until it hits this number, then it sends them as
// a batch. This setting defaults to 20, but in development we likely want to
// see events in real time for debugging, so this is set to 1 to disable the
// queueing mechanism.
const SEGMENT_FLUSH_AT = METAMASK_ENVIRONMENT === 'production' ? undefined : 1;

/**
 * Creates a mock segment module for usage in test environments. This is used
 * when building the application in test mode to catch event calls and prevent
 * them from being sent to segment. It is also used in unit tests to mock and
 * spy on the methods to ensure proper behavior
 *
 * @param flushAt - number of events to queue before sending to segment
 * @returns
 */
export const createSegmentMock = (flushAt = SEGMENT_FLUSH_AT) => {
  const segmentMock = {
    // Internal queue to keep track of events and properly mimic segment's
    // queueing behavior.
    queue: [],

    /**
     * Used to immediately send all queued events and reset the queue to zero.
     * For our purposes this simply triggers the callback method registered with
     * the event.
     */
    flush() {
      segmentMock.queue.forEach(([_, callback]) => {
        callback();
      });
      segmentMock.queue = [];
    },

    /**
     * Track an event and add it to the queue. If the queue size reaches the
     * flushAt threshold, flush the queue.
     *
     * @param payload
     * @param callback
     */
    track(payload, callback = () => undefined) {
      segmentMock.queue.push([payload, callback]);

      if (segmentMock.queue.length >= flushAt) {
        segmentMock.flush();
      }
    },

    /**
     * A true NOOP, these methods are either not used or do not await callback
     * and therefore require no functionality.
     */
    page() {
      // noop
    },
    identify() {
      // noop
    },
  };

  return segmentMock;
};
