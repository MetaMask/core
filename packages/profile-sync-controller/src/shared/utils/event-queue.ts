export class EventQueue {
  private queue: (() => Promise<void>)[] = [];

  public push(callback: () => Promise<void>) {
    this.queue.push(callback);
  }

  public async run() {
    while (this.queue.length > 0) {
      const event = this.queue[0];

      await event();
      this.queue = this.queue.filter((e) => e !== event);
    }
  }
}
