import getCreateRandomId from 'json-rpc-random-id';
import { JsonRpcNotification, JsonRpcSuccess } from 'json-rpc-engine';
import { BaseBlockTracker, Provider } from './BaseBlockTracker';

const createRandomId = getCreateRandomId();

interface SubscribeBlockTrackerArgs {
  provider: Provider;
  blockResetDuration?: number;
}

interface SubscriptionNotificationParams {
  subscription: string;
  result: { number: string };
}

export class SubscribeBlockTracker extends BaseBlockTracker {

  private _provider: Provider;

  private _subscriptionId: string | null;

  constructor(opts: Partial<SubscribeBlockTrackerArgs> = {}) {
    // parse + validate args
    if (!opts.provider) {
      throw new Error('SubscribeBlockTracker - no provider specified.');
    }

    // BaseBlockTracker constructor
    super(opts);
    // config
    this._provider = opts.provider;
    this._subscriptionId = null;
  }

  async checkForLatestBlock(): Promise<string> {
    return await this.getLatestBlock();
  }

  protected async _start(): Promise<void> {
    if (this._subscriptionId === undefined || this._subscriptionId === null) {
      try {
        const blockNumber = await this._call('eth_blockNumber') as string;
        this._subscriptionId = await this._call('eth_subscribe', 'newHeads', {}) as string;
        this._provider.on('data', this._handleSubData.bind(this));
        this._newPotentialLatest(blockNumber);
      } catch (e) {
        this.emit('error', e);
      }
    }
  }

  protected async _end() {
    if (this._subscriptionId !== null && this._subscriptionId !== undefined) {
      try {
        await this._call('eth_unsubscribe', this._subscriptionId);
        this._subscriptionId = null;
      } catch (e) {
        this.emit('error', e);
      }
    }
  }

  private _call(method: string, ...params: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this._provider.sendAsync({
        id: createRandomId(), method, params, jsonrpc: '2.0',
      }, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve((res as JsonRpcSuccess<unknown>).result);
        }
      });
    });
  }

  private _handleSubData(_: unknown, response: JsonRpcNotification<SubscriptionNotificationParams>): void {
    if (response.method === 'eth_subscription' && response.params?.subscription === this._subscriptionId) {
      this._newPotentialLatest(response.params.result.number);
    }
  }
}
