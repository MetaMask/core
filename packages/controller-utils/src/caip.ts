import {getCaipChainIdString, parseCaipChainIdString, isCaipChainIdString} from "@metamask/utils"

export function isEthCaipChainId(caipChainId: string): boolean {
  if (!isCaipChainIdString(caipChainId)) {
    return false
  }
  const { namespace } = parseCaipChainIdString(caipChainId)
  return namespace === 'eip155'
}

export function getCaipChainIdFromEthChainId(ethChainId: string): string {
  const chainIdDecimal = ethChainId.startsWith('0x') // need to handle 0X?
    ? parseInt(ethChainId, 16).toString(10)
    : ethChainId;

  if (Number.isNaN(parseInt(chainIdDecimal, 10))) {
    return ""
  }
  return getCaipChainIdString('eip155', chainIdDecimal)
}

export function getEthChainIdDecFromCaipChainId(caipChainId: string): string {
  const { reference } = parseCaipChainIdString(caipChainId)
  return reference
}

export function getEthChainIdHexFromCaipChainId(caipChainId: string): string {
  const { reference } = parseCaipChainIdString(caipChainId)
  return `0x${parseInt(reference, 10).toString(16)}`;
}

export function getEthChainIdIntFromCaipChainId(caipChainId: string): number {
  const { reference } = parseCaipChainIdString(caipChainId)
  return parseInt(reference, 10)
}
