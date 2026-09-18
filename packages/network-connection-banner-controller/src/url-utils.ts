/**
 * Escape a string for literal use inside a regular expression.
 *
 * @param value - The string to escape.
 * @returns The escaped string.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Whether an RPC URL is a MetaMask Infura endpoint. Built-in network
 * configurations keep the `{infuraProjectId}` placeholder (substitution
 * happens at request time), while some flows (e.g. adding a popular network)
 * persist the URL with the wallet's own project id already substituted, so
 * both shapes are matched.
 *
 * @param url - The RPC URL to check.
 * @param infuraProjectId - The wallet's Infura project id.
 * @returns True if the URL is a MetaMask Infura endpoint.
 */
export function getIsInfuraEndpoint(
  url: string,
  infuraProjectId: string,
): boolean {
  return new RegExp(
    `^https://[^./]+\\.infura\\.io/v3/(?:\\{infuraProjectId\\}|${escapeRegExp(infuraProjectId)})$`,
    'u',
  ).test(url);
}
