/**
 * Whether an RPC URL is a MetaMask Infura endpoint. Stored network
 * configurations keep the `{infuraProjectId}` placeholder (substitution
 * happens at request time), so we match that shape.
 *
 * @param url - The RPC URL to check.
 * @returns True if the URL is a MetaMask Infura endpoint.
 */
export function getIsInfuraEndpoint(url: string): boolean {
  return /^https:\/\/[^./]+\.infura\.io\/v3\/\{infuraProjectId\}$/u.test(url);
}
