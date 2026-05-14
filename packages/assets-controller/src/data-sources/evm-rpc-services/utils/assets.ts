import { CHAIN_IDS_WITH_NO_NATIVE_TOKEN } from '@metamask/controller-utils';
import { CaipChainId } from '@metamask/utils';

export function shouldSkipNativeForCaipChainId(
  caipChainId: CaipChainId,
): boolean {
  return (CHAIN_IDS_WITH_NO_NATIVE_TOKEN as readonly string[]).includes(
    caipChainId,
  );
}
