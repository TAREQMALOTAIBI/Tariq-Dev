const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const orderQueueClass = `
class OrderQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private minDelayMs: number;

  constructor(minDelayMs = 200) {
    this.minDelayMs = minDelayMs;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
      await new Promise((r) => setTimeout(r, this.minDelayMs));
    }

    this.processing = false;
  }
}
const orderQueue = new OrderQueue(250);
`;

code = code.replace('const app = express();', orderQueueClass + '\nconst app = express();');
fs.writeFileSync('server.ts', code);
