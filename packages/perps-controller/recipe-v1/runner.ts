/**
 * Recipe v1 — standalone headless runner for the perps controller.
 *
 * This is the ADR-58 non-UI verification example for MetaMask core. It executes
 * Recipe v1 workflow nodes that call PerpsController public methods directly and
 * emits the standard Recipe v1 artifact package (recipe.json / summary.json /
 * trace.json / artifact-manifest.json).
 *
 * No Farmslot dependency: this reference runner uses only Node built-ins and the
 * package under test.
 */
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { InitializationState, PerpsController } from '../src';
import type {
  AccountState,
  ClosePositionParams,
  GetMarketsParams,
  MarketInfo,
  OrderParams,
  OrderResult,
  PerpsControllerMessenger,
  PerpsPlatformDependencies,
  PerpsProvider,
  PerpsProviderType,
  Position,
  UpdatePositionTPSLParams,
} from '../src';

const HARNESS_NAME = '@metamask/perps-recipe-runner';
const HARNESS_VERSION = '0.1.0';
const SOURCE_PACKAGE = '@metamask/perps-controller';
const MAX_OUTPUT_BYTES = 4096;
const PROJECT_ROOT = resolve(__dirname, '..');
const RECIPE_V1_DIR = __dirname;

type RunStatus = 'pass' | 'fail';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type CommandOutput = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type CommandNode = {
  action: 'command';
  cmd: string;
  timeout_ms?: number;
  next?: string;
  proofTarget?: string;
};

type PerpsControllerCallNode = {
  action: 'perps_controller.call';
  method: PerpsControllerMethod;
  params?: JsonValue;
  next?: string;
  proofTarget?: string;
};

type AssertExitCodeNode = {
  action: 'assert_exit_code';
  source: string;
  equals: number;
  next?: string;
};

type AssertOutputNode = {
  action: 'assert_output';
  source: string;
  stream?: 'stdout' | 'stderr';
  contains: string;
  next?: string;
};

type AssertJsonNode = {
  action: 'assert_json';
  source: string;
  path: string;
  equals?: JsonValue;
  includes?: JsonValue;
  minLength?: number;
  next?: string;
};

type EndNode = {
  action: 'end';
  status: RunStatus;
};

type WorkflowNode =
  | CommandNode
  | PerpsControllerCallNode
  | AssertExitCodeNode
  | AssertOutputNode
  | AssertJsonNode
  | EndNode;

type Recipe = {
  schema_version: number;
  title: string;
  description?: string;
  proofTargets?: { id: string; claim: string }[];
  validate: {
    workflow: {
      entry: string;
      nodes: Record<string, WorkflowNode>;
    };
  };
};

type Manifest = {
  runner_protocol_version: number;
  action_registry_version: number;
  supported_official_actions: string[];
  custom_actions: string[];
};

type NodeResult = {
  output?: CommandOutput;
  result?: JsonValue;
};

type TraceEntry = {
  nodeId: string;
  action: WorkflowNode['action'];
  ok: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  output?: CommandOutput;
  result?: JsonValue;
  error?: string;
};

type PerpsControllerMethod =
  | 'getMarkets'
  | 'getPositions'
  | 'getAccountState'
  | 'placeOrder'
  | 'updatePositionTPSL'
  | 'closePosition';

class RecipePerpsController extends PerpsController {
  public markInitialized(): void {
    this.isInitialized = true;
    this.update((state) => {
      state.initializationState = InitializationState.Initialized;
    });
  }

  public setProvider(provider: PerpsProvider): void {
    this.providers = new Map<PerpsProviderType, PerpsProvider>([
      ['hyperliquid', provider],
    ]);
    this.activeProviderInstance = provider;
  }
}

function truncate(value: string): string {
  if (Buffer.byteLength(value, 'utf8') <= MAX_OUTPUT_BYTES) {
    return value;
  }
  return `${value.slice(0, MAX_OUTPUT_BYTES)}\n…[truncated]`;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 60) || 'recipe'
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error) {
      return false;
    }
    throw error;
  }
}

async function readJson<Type>(filePath: string): Promise<Type> {
  return JSON.parse(await readFile(filePath, 'utf8')) as Type;
}

function runProcess(
  command: string,
  options: { cwd: string; timeoutMs?: number },
): Promise<CommandOutput> {
  return new Promise((fulfill) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, options.timeoutMs)
      : undefined;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      fulfill({
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr: timedOut ? `${stderr}\n[recipe] command timed out` : stderr,
      });
    });
  });
}

async function resolveGitRef(): Promise<string> {
  const result = await runProcess('git rev-parse HEAD', { cwd: PROJECT_ROOT });
  if (result.exitCode === 0) {
    return result.stdout.trim() || 'local';
  }
  return 'local';
}

function createMessenger(): PerpsControllerMessenger {
  const messenger = {
    call(action: string) {
      if (action === 'RemoteFeatureFlagController:getState') {
        return { remoteFeatureFlags: {} };
      }
      if (
        action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
      ) {
        return [
          {
            address: '0x1234567890abcdef1234567890abcdef12345678',
            type: 'eip155:eoa',
          },
        ];
      }
      if (action === 'NetworkController:getNetworkClientById') {
        return { configuration: { chainId: '0x1' } };
      }
      if (action === 'NetworkController:getState') {
        return { selectedNetworkClientId: 'mainnet' };
      }
      if (action === 'AuthenticationController:getBearerToken') {
        return Promise.resolve('recipe-bearer-token');
      }
      return undefined;
    },
    publish() {
      return undefined;
    },
    subscribe() {
      return undefined;
    },
    unsubscribe() {
      return undefined;
    },
    registerActionHandler() {
      return undefined;
    },
    registerMethodActionHandlers() {
      return undefined;
    },
    unregisterActionHandler() {
      return undefined;
    },
    registerEventHandler() {
      return undefined;
    },
    registerInitialEventPayload() {
      return undefined;
    },
    unregisterEventHandler() {
      return undefined;
    },
    clearEventSubscriptions() {
      return undefined;
    },
  };
  return messenger as unknown as PerpsControllerMessenger;
}

function createInfrastructure(): PerpsPlatformDependencies {
  const noOperation = () => undefined;
  return {
    logger: {
      error: noOperation,
    },
    debugLogger: {
      log: noOperation,
    },
    metrics: {
      trackEvent: noOperation,
      isEnabled: () => true,
      trackPerpsEvent: noOperation,
    },
    performance: {
      now: () => Date.now(),
    },
    tracer: {
      trace: noOperation,
      endTrace: noOperation,
      setMeasurement: noOperation,
      addBreadcrumb: noOperation,
    },
    streamManager: {
      pauseChannel: noOperation,
      resumeChannel: noOperation,
      clearAllChannels: noOperation,
    },
    featureFlags: {
      validateVersionGated: noOperation,
    },
    marketDataFormatters: {
      formatVolume: (value: number) => `$${value.toFixed(0)}`,
      formatPerpsFiat: (value: number) => `$${value.toFixed(2)}`,
      formatPercentage: (value: number) => `${value.toFixed(2)}%`,
      priceRangesUniversal: [],
    },
    cacheInvalidator: {
      invalidate: noOperation,
      invalidateAll: noOperation,
    },
    rewards: {
      getPerpsDiscountForAccount: async () => 0,
    },
    diskCache: {
      getItem: async () => null,
      getItemSync: () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    },
  } as PerpsPlatformDependencies;
}

function createPosition(): Position {
  return {
    symbol: 'BTC',
    size: '0.01',
    entryPrice: '50000',
    positionValue: '500',
    unrealizedPnl: '0',
    marginUsed: '50',
    leverage: { type: 'cross', value: 10 },
    liquidationPrice: '45000',
    maxLeverage: 50,
    returnOnEquity: '0',
    cumulativeFunding: {
      allTime: '0',
      sinceOpen: '0',
      sinceChange: '0',
    },
    roi: '0',
    takeProfitPrice: '55000',
    stopLossPrice: '47500',
    takeProfitCount: 1,
    stopLossCount: 1,
    marketPrice: '50100',
    timestamp: Date.now(),
  };
}

function createProvider(): PerpsProvider {
  const markets: MarketInfo[] = [
    { name: 'BTC', szDecimals: 5, maxLeverage: 50, marginTableId: 1 },
    { name: 'ETH', szDecimals: 4, maxLeverage: 25, marginTableId: 2 },
  ];
  const positions = [createPosition()];
  const accountState: AccountState = {
    totalBalance: '1000',
    spendableBalance: '950',
    withdrawableBalance: '950',
    marginUsed: '50',
    unrealizedPnl: '0',
    returnOnEquity: '0',
  };

  return {
    protocolId: 'hyperliquid',
    initialize: async () => undefined,
    isReadyToTrade: () => true,
    toggleTestnet: async () => ({ success: true }),
    getPositions: async () => positions,
    getAccountState: async () => accountState,
    getHistoricalPortfolio: async () => ({
      totalBalance24hAgo: '1000',
      totalBalance7dAgo: '1000',
      totalBalance30dAgo: '1000',
    }),
    getMarkets: async (params?: GetMarketsParams) => {
      if (!params?.symbols?.length) {
        return markets;
      }
      return markets.filter((market) => params.symbols?.includes(market.name));
    },
    placeOrder: async (params: OrderParams): Promise<OrderResult> => ({
      success: true,
      orderId: `recipe-open-${params.symbol}`,
      filledSize: params.size,
      averagePrice: String(
        params.currentPrice ?? params.priceAtCalculation ?? 50000,
      ),
    }),
    editOrder: async (): Promise<OrderResult> => ({ success: true }),
    cancelOrder: async () => ({ success: true }),
    cancelOrders: async () => ({
      success: true,
      successCount: 1,
      failureCount: 0,
    }),
    closePosition: async (
      params: ClosePositionParams,
    ): Promise<OrderResult> => ({
      success: true,
      orderId: `recipe-close-${params.symbol}`,
      filledSize: params.size ?? positions[0].size,
      averagePrice: String(params.currentPrice ?? 50100),
    }),
    closePositions: async () => ({
      success: true,
      successCount: 1,
      failureCount: 0,
    }),
    withdraw: async () => ({ success: true, txHash: '0xrecipe' }),
    getDepositRoutes: async () => [],
    getWithdrawalRoutes: () => [],
    validateDeposit: async () => ({ isValid: true }),
    validateOrder: async () => ({ isValid: true }),
    validateClosePosition: async () => ({ isValid: true }),
    validateWithdrawal: async () => ({ isValid: true }),
    subscribeToPrices: () => noOpUnsubscribe,
    subscribeToPositions: () => noOpUnsubscribe,
    subscribeToOrderFills: () => noOpUnsubscribe,
    setLiveDataConfig: noOperation,
    disconnect: async () => undefined,
    updatePositionTPSL: async (
      params: UpdatePositionTPSLParams,
    ): Promise<OrderResult> => ({
      success: true,
      orderId: `recipe-tpsl-${params.symbol}`,
    }),
    calculateLiquidationPrice: async () => '45000',
    calculateMaintenanceMargin: async () => 50,
    getMaxLeverage: async () => 50,
    calculateFees: async () => ({ totalFee: 0 }),
    getMarketDataWithPrices: async () => [],
    getBlockExplorerUrl: () => 'https://app.hyperliquid.xyz',
    getOrderFills: async () => [],
    getOrders: async () => [],
    getFunding: async () => [],
    getCurrentAccountId: async () =>
      'eip155:1:0x1234567890abcdef1234567890abcdef12345678',
    getIsFirstTimeUser: async () => false,
    getOpenOrders: async () => [],
    subscribeToOrders: () => noOpUnsubscribe,
    subscribeToAccount: () => noOpUnsubscribe,
    setUserFeeDiscount: noOperation,
    getWebSocketConnectionState: () => 'disconnected',
    subscribeToConnectionState: () => noOpUnsubscribe,
    reconnect: async () => undefined,
  } as PerpsProvider;
}

function noOperation(): void {
  return undefined;
}

function noOpUnsubscribe(): void {
  return undefined;
}

function createController(): RecipePerpsController {
  const controller = new RecipePerpsController({
    messenger: createMessenger(),
    infrastructure: createInfrastructure(),
    deferEligibilityCheck: true,
  });
  controller.setProvider(createProvider());
  controller.markInitialized();
  return controller;
}

async function callControllerMethod(
  controller: RecipePerpsController,
  method: PerpsControllerMethod,
  params?: JsonValue,
): Promise<JsonValue> {
  switch (method) {
    case 'getMarkets':
      return (await controller.getMarkets(
        params as GetMarketsParams,
      )) as JsonValue;
    case 'getPositions':
      return (await controller.getPositions()) as JsonValue;
    case 'getAccountState':
      return (await controller.getAccountState()) as JsonValue;
    case 'placeOrder':
      return (await controller.placeOrder(params as OrderParams)) as JsonValue;
    case 'updatePositionTPSL':
      return (await controller.updatePositionTPSL(
        params as UpdatePositionTPSLParams,
      )) as JsonValue;
    case 'closePosition':
      return (await controller.closePosition(
        params as ClosePositionParams,
      )) as JsonValue;
    default: {
      const unsupported: never = method;
      throw new Error(`Unsupported PerpsController method: ${unsupported}`);
    }
  }
}

function readPath(
  value: JsonValue | undefined,
  path: string,
): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (path === '$') {
    return value;
  }
  return path.split('.').reduce<JsonValue | undefined>((current, segment) => {
    if (current === undefined || current === null) {
      return undefined;
    }
    const arrayIndex = Number(segment);
    if (Array.isArray(current) && Number.isInteger(arrayIndex)) {
      return current[arrayIndex];
    }
    if (typeof current === 'object' && !Array.isArray(current)) {
      return current[segment];
    }
    return undefined;
  }, value);
}

function assertJson(
  node: AssertJsonNode,
  result: JsonValue | undefined,
): string | undefined {
  const actual = readPath(result, node.path);
  if (node.equals !== undefined) {
    if (JSON.stringify(actual) !== JSON.stringify(node.equals)) {
      return `expected ${node.path} to equal ${JSON.stringify(
        node.equals,
      )}, got ${JSON.stringify(actual)}`;
    }
  }
  if (node.includes !== undefined) {
    if (!Array.isArray(actual) || !actual.includes(node.includes)) {
      return `expected ${node.path} to include ${JSON.stringify(node.includes)}`;
    }
  }
  if (node.minLength !== undefined) {
    if (!Array.isArray(actual) || actual.length < node.minLength) {
      return `expected ${node.path} length >= ${node.minLength}, got ${
        Array.isArray(actual) ? actual.length : 'non-array'
      }`;
    }
  }
  return undefined;
}

async function executeWorkflow(recipe: Recipe): Promise<{
  status: RunStatus;
  trace: TraceEntry[];
}> {
  const { entry, nodes } = recipe.validate.workflow;
  const trace: TraceEntry[] = [];
  const nodeResults: Record<string, NodeResult> = {};
  const controller = createController();

  let currentId: string | undefined = entry;
  let status: RunStatus = 'fail';
  let failed = false;

  while (currentId) {
    const node = nodes[currentId];
    if (!node) {
      throw new Error(`Workflow references unknown node: ${currentId}`);
    }

    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    let ok = false;
    let output: CommandOutput | undefined;
    let result: JsonValue | undefined;
    let error: string | undefined;
    let next: string | undefined;

    switch (node.action) {
      case 'command':
        output = await runProcess(node.cmd, {
          cwd: PROJECT_ROOT,
          timeoutMs: node.timeout_ms,
        });
        nodeResults[currentId] = { output };
        ok = true;
        next = node.next;
        break;

      case 'perps_controller.call':
        result = await callControllerMethod(
          controller,
          node.method,
          node.params,
        );
        nodeResults[currentId] = { result };
        ok = true;
        next = node.next;
        break;

      case 'assert_exit_code': {
        const source = nodeResults[node.source]?.output;
        if (!source) {
          error = `assert_exit_code references node without command output: ${node.source}`;
        } else {
          ok = source.exitCode === node.equals;
          if (!ok) {
            error = `expected exit code ${node.equals}, got ${source.exitCode}`;
          }
        }
        next = ok ? node.next : undefined;
        break;
      }

      case 'assert_output': {
        const source = nodeResults[node.source]?.output;
        const stream = node.stream ?? 'stdout';
        if (!source) {
          error = `assert_output references node without command output: ${node.source}`;
        } else {
          ok = source[stream].includes(node.contains);
          if (!ok) {
            error = `expected ${stream} to contain ${JSON.stringify(
              node.contains,
            )}`;
          }
        }
        next = ok ? node.next : undefined;
        break;
      }

      case 'assert_json': {
        error = assertJson(node, nodeResults[node.source]?.result);
        ok = error === undefined;
        next = ok ? node.next : undefined;
        break;
      }

      case 'end':
        ok = true;
        status = failed ? 'fail' : node.status;
        next = undefined;
        break;

      default: {
        const unknown = node as { action: string };
        throw new Error(`Unsupported action: ${unknown.action}`);
      }
    }

    const endedAt = new Date().toISOString();
    trace.push({
      nodeId: currentId,
      action: node.action,
      ok,
      startedAt,
      endedAt,
      durationMs: Date.now() - startMs,
      ...(output
        ? {
            output: {
              exitCode: output.exitCode,
              stdout: truncate(output.stdout),
              stderr: truncate(output.stderr),
            },
          }
        : {}),
      ...(result ? { result } : {}),
      ...(error ? { error } : {}),
    });

    if (!ok) {
      failed = true;
      status = 'fail';
      break;
    }

    currentId = next;
  }

  return { status, trace };
}

async function main(): Promise<void> {
  const recipeArg =
    process.argv[2] ?? 'recipe-v1/recipes/market-data.recipe.json';
  const recipePath = resolve(PROJECT_ROOT, recipeArg);
  if (!(await fileExists(recipePath))) {
    throw new Error(`Recipe not found: ${recipePath}`);
  }

  const manifestPath = join(
    RECIPE_V1_DIR,
    'manifests',
    'perps.action-manifest.json',
  );
  const recipe = await readJson<Recipe>(recipePath);
  const manifest = await readJson<Manifest>(manifestPath);

  process.stderr.write(`[recipe] Running: ${recipe.title}\n`);

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const { status, trace } = await executeWorkflow(recipe);
  const endedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const gitRef = await resolveGitRef();
  const passed = trace.filter((entry) => entry.ok).length;
  const failedCount = trace.filter((entry) => !entry.ok).length;

  const runDir = join(
    RECIPE_V1_DIR,
    'runs',
    `${slugify(recipe.title)}-${new Date().toISOString().replace(/[:.]/gu, '-')}`,
  );
  await mkdir(runDir, { recursive: true });

  const summary = {
    status,
    total: trace.length,
    passed,
    failed: failedCount,
    startedAt,
    endedAt,
    durationMs,
    harness: {
      name: HARNESS_NAME,
      version: HARNESS_VERSION,
      runner_protocol_version: manifest.runner_protocol_version,
      action_registry_version: manifest.action_registry_version,
    },
    runner: {
      source: SOURCE_PACKAGE,
      git_ref: gitRef,
      name: SOURCE_PACKAGE,
    },
  };

  const artifactManifest = {
    version: 1,
    runStatus: status,
    provenance: { runner: { source: SOURCE_PACKAGE, git_ref: gitRef } },
    artifacts: [
      {
        path: 'recipe.json',
        type: 'recipe',
        label: 'Executed recipe',
        category: 'system',
      },
      {
        path: 'summary.json',
        type: 'summary',
        label: 'Run summary',
        category: 'system',
      },
      {
        path: 'trace.json',
        type: 'trace',
        label: 'Execution trace',
        category: 'system',
      },
    ],
  };

  await writeFile(
    join(runDir, 'recipe.json'),
    `${JSON.stringify(recipe, null, 2)}\n`,
  );
  await writeFile(
    join(runDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFile(
    join(runDir, 'trace.json'),
    `${JSON.stringify(trace, null, 2)}\n`,
  );
  await writeFile(
    join(runDir, 'artifact-manifest.json'),
    `${JSON.stringify(artifactManifest, null, 2)}\n`,
  );

  process.stderr.write(`[recipe] Artifacts written to: ${runDir}\n`);
  process.stderr.write(
    `[recipe] Status: ${status} (${passed}/${trace.length} steps ok)\n`,
  );
  process.exitCode = status === 'pass' ? 0 : 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[recipe] ${message}\n`);
  process.exitCode = 1;
});
