export class EventQueue {
  queue: (() => Promise<void>)[] = [];

  public push(callback: () => Promise<void>) {
    this.queue.push(callback);
  }

  public async run() {
    while (this.queue.length > 0) {
      const event = this.queue[0];

      try {
        await event();
      } finally {
        this.queue = this.queue.filter((e) => e !== event);
      }
    }
  }
}
