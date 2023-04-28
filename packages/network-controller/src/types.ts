import type EventEmitter from 'events';
import type { Provider as EthQueryProvider } from 'eth-query';

export type Provider = EventEmitter & EthQueryProvider & { stop: () => void };

export type BlockTracker = any;
