import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import type { PollingBlockTracker } from 'eth-block-tracker';

export type Provider = SafeEventEmitterProvider;

export type BlockTracker = PollingBlockTracker;
