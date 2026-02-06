import type { Client } from 'openapi-fetch';
import createClient from 'openapi-fetch';

import type { paths } from './bridge-api';
import { BRIDGE_PROD_API_BASE_URL } from './constants/bridge';

export const createBridgeApiClient = (
  baseUrl = BRIDGE_PROD_API_BASE_URL,
): Client<paths> => createClient<paths>({ baseUrl });
