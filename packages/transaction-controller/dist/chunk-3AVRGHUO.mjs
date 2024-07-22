import {
  simulateTransactions
} from "./chunk-K4KOSAGM.mjs";
import {
  SimulationError,
  SimulationInvalidResponseError,
  SimulationRevertedError
} from "./chunk-HQSNKCXI.mjs";
import {
  ABI_SIMULATION_ERC20_WRAPPED,
  ABI_SIMULATION_ERC721_LEGACY
} from "./chunk-O6ZZVIFH.mjs";
import {
  projectLogger
} from "./chunk-UQQWZT6C.mjs";

// src/utils/simulation.ts
import { Interface } from "@ethersproject/abi";
import { hexToBN, toHex } from "@metamask/controller-utils";
import { abiERC20, abiERC721, abiERC1155 } from "@metamask/metamask-eth-abis";
import { createModuleLogger } from "@metamask/utils";
var SupportedToken = /* @__PURE__ */ ((SupportedToken2) => {
  SupportedToken2["ERC20"] = "erc20";
  SupportedToken2["ERC721"] = "erc721";
  SupportedToken2["ERC1155"] = "erc1155";
  SupportedToken2["ERC20_WRAPPED"] = "erc20Wrapped";
  SupportedToken2["ERC721_LEGACY"] = "erc721Legacy";
  return SupportedToken2;
})(SupportedToken || {});
var log = createModuleLogger(projectLogger, "simulation");
var SUPPORTED_EVENTS = [
  "Transfer",
  "TransferSingle",
  "TransferBatch",
  "Deposit",
  "Withdrawal"
];
var SUPPORTED_TOKEN_ABIS = {
  ["erc20" /* ERC20 */]: {
    abi: abiERC20,
    standard: "erc20" /* erc20 */
  },
  ["erc721" /* ERC721 */]: {
    abi: abiERC721,
    standard: "erc721" /* erc721 */
  },
  ["erc1155" /* ERC1155 */]: {
    abi: abiERC1155,
    standard: "erc1155" /* erc1155 */
  },
  ["erc20Wrapped" /* ERC20_WRAPPED */]: {
    abi: ABI_SIMULATION_ERC20_WRAPPED,
    standard: "erc20" /* erc20 */
  },
  ["erc721Legacy" /* ERC721_LEGACY */]: {
    abi: ABI_SIMULATION_ERC721_LEGACY,
    standard: "erc721" /* erc721 */
  }
};
var REVERTED_ERRORS = ["execution reverted", "insufficient funds for gas"];
async function getSimulationData(request) {
  const { chainId, from, to, value, data } = request;
  log("Getting simulation data", request);
  try {
    const response = await simulateTransactions(chainId, {
      transactions: [
        {
          data,
          from,
          maxFeePerGas: "0x0",
          maxPriorityFeePerGas: "0x0",
          to,
          value
        }
      ],
      withCallTrace: true,
      withLogs: true
    });
    const transactionError = response.transactions?.[0]?.error;
    if (transactionError) {
      throw new SimulationError(transactionError);
    }
    const nativeBalanceChange = getNativeBalanceChange(request.from, response);
    const events = getEvents(response);
    log("Parsed events", events);
    const tokenBalanceChanges = await getTokenBalanceChanges(request, events);
    return {
      nativeBalanceChange,
      tokenBalanceChanges
    };
  } catch (error) {
    log("Failed to get simulation data", error, request);
    let simulationError = error;
    if (REVERTED_ERRORS.some(
      (revertErrorMessage) => simulationError.message?.includes(revertErrorMessage)
    )) {
      simulationError = new SimulationRevertedError();
    }
    const { code, message } = simulationError;
    return {
      tokenBalanceChanges: [],
      error: {
        code,
        message
      }
    };
  }
}
function getNativeBalanceChange(userAddress, response) {
  const transactionResponse = response.transactions[0];
  if (!transactionResponse) {
    return void 0;
  }
  const { stateDiff } = transactionResponse;
  const previousBalance = stateDiff?.pre?.[userAddress]?.balance;
  const newBalance = stateDiff?.post?.[userAddress]?.balance;
  if (!previousBalance || !newBalance) {
    return void 0;
  }
  return getSimulationBalanceChange(previousBalance, newBalance);
}
function getEvents(response) {
  const logs = extractLogs(
    response.transactions[0]?.callTrace ?? {}
  );
  log("Extracted logs", logs);
  const interfaces = getContractInterfaces();
  return logs.map((currentLog) => {
    const event = parseLog(currentLog, interfaces);
    if (!event) {
      log("Failed to parse log", currentLog);
      return void 0;
    }
    const inputs = event.abi.find((e) => e.name === event.name)?.inputs;
    if (!inputs) {
      log("Failed to find inputs for event", event);
      return void 0;
    }
    if (!SUPPORTED_EVENTS.includes(event.name)) {
      log("Ignoring unsupported event", event.name, event);
      return void 0;
    }
    log("Normalizing event args", event.name, event);
    const args = normalizeEventArgs(event.args, inputs);
    return {
      contractAddress: currentLog.address,
      tokenStandard: event.standard,
      name: event.name,
      args,
      abi: event.abi
    };
  }).filter((e) => e !== void 0);
}
function normalizeEventArgs(args, abiInputs) {
  return args.reduce((result, arg, index) => {
    const name = abiInputs[index].name.replace("_", "");
    const value = normalizeEventArgValue(arg);
    result[name] = value;
    return result;
  }, {});
}
function normalizeEventArgValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeEventArgValue);
  }
  let normalizedValue = value;
  normalizedValue = normalizedValue.toHexString?.() ?? normalizedValue;
  normalizedValue = normalizedValue.toLowerCase?.() ?? normalizedValue;
  return normalizedValue;
}
async function getTokenBalanceChanges(request, events) {
  const balanceTxs = getTokenBalanceTransactions(request, events);
  log("Generated balance transactions", [...balanceTxs.after.values()]);
  const transactions = [
    ...balanceTxs.before.values(),
    request,
    ...balanceTxs.after.values()
  ];
  if (transactions.length === 1) {
    return [];
  }
  const response = await simulateTransactions(request.chainId, {
    transactions
  });
  log("Balance simulation response", response);
  if (response.transactions.length !== transactions.length) {
    throw new SimulationInvalidResponseError();
  }
  let prevBalanceTxIndex = 0;
  return [...balanceTxs.after.keys()].map((token, index) => {
    const previousBalanceCheckSkipped = !balanceTxs.before.get(token);
    const previousBalance = previousBalanceCheckSkipped ? "0x0" : getValueFromBalanceTransaction(
      request.from,
      token,
      // eslint-disable-next-line no-plusplus
      response.transactions[prevBalanceTxIndex++]
    );
    const newBalance = getValueFromBalanceTransaction(
      request.from,
      token,
      response.transactions[index + balanceTxs.before.size + 1]
    );
    const balanceChange = getSimulationBalanceChange(
      previousBalance,
      newBalance
    );
    if (!balanceChange) {
      return void 0;
    }
    return {
      ...token,
      ...balanceChange
    };
  }).filter((change) => change !== void 0);
}
function getTokenBalanceTransactions(request, events) {
  const tokenKeys = /* @__PURE__ */ new Set();
  const before = /* @__PURE__ */ new Map();
  const after = /* @__PURE__ */ new Map();
  const userEvents = events.filter(
    (event) => [event.args.from, event.args.to].includes(request.from)
  );
  log("Filtered user events", userEvents);
  for (const event of userEvents) {
    const tokenIds = getEventTokenIds(event);
    log("Extracted token IDs", tokenIds);
    for (const tokenId of tokenIds) {
      const simulationToken = {
        address: event.contractAddress,
        standard: event.tokenStandard,
        id: tokenId
      };
      const tokenKey = JSON.stringify(simulationToken);
      if (tokenKeys.has(tokenKey)) {
        log(
          "Ignoring additional event with same contract and token ID",
          simulationToken
        );
        continue;
      }
      tokenKeys.add(tokenKey);
      const data = getBalanceTransactionData(
        event.tokenStandard,
        request.from,
        tokenId
      );
      const transaction = {
        from: request.from,
        to: event.contractAddress,
        data
      };
      if (skipPriorBalanceCheck(event)) {
        after.set(simulationToken, transaction);
      } else {
        before.set(simulationToken, transaction);
        after.set(simulationToken, transaction);
      }
    }
  }
  return { before, after };
}
function skipPriorBalanceCheck(event) {
  return event.name === "Transfer" && event.tokenStandard === "erc721" /* erc721 */ && parseInt(event.args.from, 16) === 0;
}
function getEventTokenIds(event) {
  if (event.tokenStandard === "erc721" /* erc721 */) {
    return [event.args.tokenId];
  }
  if (event.tokenStandard === "erc1155" /* erc1155 */ && event.name === "TransferSingle") {
    return [event.args.id];
  }
  if (event.tokenStandard === "erc1155" /* erc1155 */ && event.name === "TransferBatch") {
    return event.args.ids;
  }
  return [void 0];
}
function getValueFromBalanceTransaction(from, token, response) {
  const normalizedReturn = normalizeReturnValue(response.return);
  if (token.standard === "erc721" /* erc721 */) {
    return normalizedReturn === from ? "0x1" : "0x0";
  }
  return normalizedReturn;
}
function getBalanceTransactionData(tokenStandard, from, tokenId) {
  switch (tokenStandard) {
    case "erc721" /* erc721 */:
      return new Interface(abiERC721).encodeFunctionData("ownerOf", [
        tokenId
      ]);
    case "erc1155" /* erc1155 */:
      return new Interface(abiERC1155).encodeFunctionData("balanceOf", [
        from,
        tokenId
      ]);
    default:
      return new Interface(abiERC20).encodeFunctionData("balanceOf", [
        from
      ]);
  }
}
function parseLog(eventLog, interfaces) {
  const supportedTokens = Object.values(SupportedToken);
  for (const token of supportedTokens) {
    try {
      const contractInterface = interfaces.get(token);
      const { abi, standard } = SUPPORTED_TOKEN_ABIS[token];
      return {
        ...contractInterface.parseLog(eventLog),
        abi,
        standard
      };
    } catch (e) {
      continue;
    }
  }
  return void 0;
}
function extractLogs(call) {
  const logs = call.logs ?? [];
  const nestedCalls = call.calls ?? [];
  return [
    ...logs,
    ...nestedCalls.map((nestedCall) => extractLogs(nestedCall)).flat()
  ];
}
function getSimulationBalanceChange(previousBalance, newBalance) {
  const differenceBN = hexToBN(newBalance).sub(hexToBN(previousBalance));
  const isDecrease = differenceBN.isNeg();
  const difference = toHex(differenceBN.abs());
  if (differenceBN.isZero()) {
    log("Balance change is zero");
    return void 0;
  }
  return {
    previousBalance,
    newBalance,
    difference,
    isDecrease
  };
}
function normalizeReturnValue(value) {
  return toHex(hexToBN(value));
}
function getContractInterfaces() {
  const supportedTokens = Object.values(SupportedToken);
  return new Map(
    supportedTokens.map((tokenType) => {
      const { abi } = SUPPORTED_TOKEN_ABIS[tokenType];
      const contractInterface = new Interface(abi);
      return [tokenType, contractInterface];
    })
  );
}

export {
  SupportedToken,
  getSimulationData,
  getEvents
};
//# sourceMappingURL=chunk-3AVRGHUO.mjs.map