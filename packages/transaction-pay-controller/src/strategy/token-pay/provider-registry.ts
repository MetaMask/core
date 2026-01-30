import type { TokenPayProvider } from './types';
import { AcrossProvider } from '../across/AcrossProvider';
import { RelayProvider } from '../relay/RelayProvider';

export function getTokenPayProviders(): TokenPayProvider<unknown>[] {
  return [new RelayProvider() as never, new AcrossProvider() as never];
}
