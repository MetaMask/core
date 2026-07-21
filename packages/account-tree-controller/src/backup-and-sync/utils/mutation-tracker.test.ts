import { createSyncMutationTracker } from './mutation-tracker.js';

describe('BackupAndSync - Utils - createSyncMutationTracker', () => {
  it('starts with no recorded writes', () => {
    const tracker = createSyncMutationTracker();

    expect(tracker.hasOccurred()).toBe(false);
    expect(tracker.getLocalWrite()).toBe(false);
  });

  it('records remote writes', () => {
    const tracker = createSyncMutationTracker();

    tracker.setRemoteWrite(true);

    expect(tracker.hasOccurred()).toBe(true);
  });

  it('records local writes', () => {
    const tracker = createSyncMutationTracker();

    tracker.setLocalWrite(true);

    expect(tracker.hasOccurred()).toBe(true);
    expect(tracker.getLocalWrite()).toBe(true);
  });

  it('clears all writes on reset', () => {
    const tracker = createSyncMutationTracker();

    tracker.setRemoteWrite(true);
    tracker.setLocalWrite(true);
    tracker.reset();

    expect(tracker.hasOccurred()).toBe(false);
    expect(tracker.getLocalWrite()).toBe(false);
  });

  it('reverts local writes to a captured value', () => {
    const tracker = createSyncMutationTracker();

    const before = tracker.getLocalWrite();
    tracker.setLocalWrite(true);
    expect(tracker.hasOccurred()).toBe(true);

    tracker.setLocalWrite(before);

    expect(tracker.hasOccurred()).toBe(false);
  });

  it('keeps durable remote writes when local writes are reverted', () => {
    const tracker = createSyncMutationTracker();

    tracker.setRemoteWrite(true);
    const before = tracker.getLocalWrite();
    tracker.setLocalWrite(true);

    tracker.setLocalWrite(before);

    // Local write is gone, but the durable remote write still counts.
    expect(tracker.hasOccurred()).toBe(true);
  });
});
