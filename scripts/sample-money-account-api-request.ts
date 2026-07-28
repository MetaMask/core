import fetchFunction from 'isomorphic-fetch';

const DEFAULT_API_URL = 'https://money.api.cx.metamask.io';

type RequiredEnvironmentVariable =
  | 'MONEY_ACCOUNT_JWT'
  | 'MONEY_ACCOUNT_ADDRESS';

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Money Account API request failed: ${message}`);
  process.exitCode = 1;
});

/**
 * Sends an authenticated request to the Money Account positions endpoint and
 * prints a redacted request/response transcript that is safe to share.
 */
async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    printUsage();
    return;
  }

  const token = getRequiredEnvironmentVariable('MONEY_ACCOUNT_JWT');
  const address = getRequiredEnvironmentVariable(
    'MONEY_ACCOUNT_ADDRESS',
  ).toLowerCase();
  // eslint-disable-next-line n/no-process-env
  const baseUrl = process.env.MONEY_ACCOUNT_API_URL ?? DEFAULT_API_URL;
  const url = new URL(`/v1/positions/${encodeURIComponent(address)}`, baseUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('MONEY_ACCOUNT_API_URL must use HTTP or HTTPS');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  printJson('Request', {
    method: 'GET',
    url: url.toString(),
    headers: {
      Authorization: 'Bearer <redacted>',
    },
  });

  const response = await fetchFunction(url, { headers });
  const responseText = await response.text();

  printJson('Response', {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: parseResponseBody(responseText),
  });

  if (!response.ok) {
    throw new Error(`API returned HTTP ${response.status}`);
  }
}

/**
 * Gets a required environment variable without exposing its value.
 *
 * @param name - The environment variable name.
 * @returns The trimmed environment variable value.
 */
function getRequiredEnvironmentVariable(
  name: RequiredEnvironmentVariable,
): string {
  // eslint-disable-next-line n/no-process-env
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Parses a response body as JSON when possible.
 *
 * @param responseText - The raw response body.
 * @returns The parsed JSON value or original text.
 */
function parseResponseBody(responseText: string): unknown {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

/**
 * Prints a labelled JSON value.
 *
 * @param label - The output label.
 * @param value - The value to serialize.
 */
function printJson(label: string, value: unknown): void {
  console.log(`${label}:`);
  console.log(JSON.stringify(value, null, 2));
}

/**
 * Prints usage instructions.
 */
function printUsage(): void {
  console.log(`Usage:
  MONEY_ACCOUNT_JWT='<profile JWT>' \\
  MONEY_ACCOUNT_ADDRESS='0x...' \\
  MONEY_ACCOUNT_API_URL='${DEFAULT_API_URL}' \\
  yarn money-account-api:sample-request

MONEY_ACCOUNT_API_URL is optional and defaults to the dev environment.
The JWT is sent to the API but is always redacted from script output.`);
}
