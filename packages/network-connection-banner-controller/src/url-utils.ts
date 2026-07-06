import ipRegex from 'ip-regex';
import { get as pslGet } from 'psl';

/**
 * Check if a hostname is localhost or an IP address (v4 or v6). Public RPC
 * providers use domain names, not raw IP addresses, so a `true` result means
 * the host should not be reduced to an eTLD+1.
 *
 * @param hostname - The hostname to check.
 * @returns True if the hostname is localhost or an IP address.
 */
export function isLocalhostOrIPAddress(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();

  if (lowerHostname === 'localhost') {
    return true;
  }

  // Remove brackets from IPv6 addresses for testing (e.g., [::1] -> ::1)
  const hostnameWithoutBrackets = lowerHostname.replace(/^\[|\]$/gu, '');

  return ipRegex({ exact: true }).test(hostnameWithoutBrackets);
}

/**
 * Registrable domain (eTLD+1) for a URL, computed via the Public Suffix List
 * so multi-part suffixes like ".co.uk" resolve correctly. Used to group RPC
 * endpoints by provider so a single provider's wide outage (e.g. *.infura.io)
 * is treated as one failure rather than many.
 *
 * Localhost, IP literals, and single-label hosts are returned verbatim rather
 * than reduced to a domain (psl returns null or garbage for those, and callers
 * grouping by domain still need to distinguish them).
 *
 * @param urlString - The URL to extract a domain from.
 * @returns The domain, or null if the URL is invalid.
 */
export function getDomain(urlString: string): string | null {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  const { hostname } = url;

  if (!hostname.includes('.') || isLocalhostOrIPAddress(hostname)) {
    return hostname;
  }

  return pslGet(hostname) ?? hostname;
}

/**
 * Whether an RPC URL is a MetaMask Infura endpoint. Matches the
 * `{infuraProjectId}` placeholder form that lives on stored network
 * configurations before the wallet substitutes the real project id at
 * request time. URLs that already carry a substituted key are treated as
 * custom (we do not have the project id in this package).
 *
 * @param url - The RPC URL to check.
 * @returns True if the URL is the placeholder form of a MetaMask Infura
 * endpoint.
 */
export function getIsInfuraEndpoint(url: string): boolean {
  return /^https:\/\/[^./]+\.infura\.io\/v3\/\{infuraProjectId\}$/u.test(url);
}
