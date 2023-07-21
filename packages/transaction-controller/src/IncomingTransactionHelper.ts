import type { NetworkState } from '@metamask/network-controller';
import EthQuery from 'eth-query';
import {
  RemoteTransactionSource,
  Transaction,
  TransactionMeta,
  TransactionStatus,
} from './types';
import { isSmartContractCode, query } from '@metamask/controller-utils';
import { Hex } from '@metamask/utils';

const SUPPORTED_NETWORK_IDS = [
  '1', // Mainnet
  '5', // Goerli
  '11155111', // Sepolia
];

export class IncomingTransactionHelper {
  #getNetworkState: () => NetworkState;

  #getEthQuery: () => EthQuery;

  #transactionLimit: number;

  #remoteTransactionSource: RemoteTransactionSource;

  constructor({
    getNetworkState,
    getEthQuery,
    transactionLimit,
    remoteTransactionSource,
  }: {
    getNetworkState: () => NetworkState;
    getEthQuery: () => EthQuery;
    transactionLimit: number;
    remoteTransactionSource: RemoteTransactionSource;
  }) {
    this.#getNetworkState = getNetworkState;
    this.#getEthQuery = getEthQuery;
    this.#transactionLimit = transactionLimit;
    this.#remoteTransactionSource = remoteTransactionSource;
  }

  async reconcile({
    address,
    localTransactions,
    fromBlock,
    apiKey,
  }: {
    address: string;
    localTransactions: TransactionMeta[];
    fromBlock?: string;
    apiKey?: string;
  }): Promise<{
    updateRequired: boolean;
    transactions: TransactionMeta[];
    latestBlockNumber?: string;
  }> {
    const { providerConfig, networkId: currentNetworkId } =
      this.#getNetworkState();
    const { chainId: currentChainId, type: networkType } = providerConfig;

    if (
      currentNetworkId === null ||
      !SUPPORTED_NETWORK_IDS.includes(currentNetworkId)
    ) {
      return { updateRequired: false, transactions: [] };
    }

    const remoteTransactions =
      await this.#remoteTransactionSource.fetchTransactions({
        address,
        networkType,
        limit: this.#transactionLimit,
        currentChainId: currentChainId,
        currentNetworkId: currentNetworkId,
        fromBlock,
        apiKey,
      });

    const [updateRequired, transactions] = this.#reconcileTransactions(
      localTransactions,
      remoteTransactions,
    );

    this.#sortTransactionsByTime(transactions);

    const latestBlockNumber = this.#getLatestBlockNumber(
      transactions,
      address,
      currentChainId,
      currentNetworkId,
    );

    await this.#updateSmartContractProperty(transactions);

    return { updateRequired, transactions, latestBlockNumber };
  }

  async #updateSmartContractProperty(transactions: TransactionMeta[]) {
    await Promise.all(
      transactions.map(async (tx) => {
        tx.toSmartContract ??= await this.#isToSmartContract(tx.transaction);
      }),
    );
  }

  #getLatestBlockNumber(
    transactions: TransactionMeta[],
    address: string,
    currentChainId: Hex,
    currentNetworkId: string,
  ): string | undefined {
    let latestBlockNumber: string | undefined;

    for (const tx of transactions) {
      const onCurrentChain =
        tx.chainId === currentChainId ||
        (!tx.chainId && tx.networkID === currentNetworkId);

      const fromCurrentAccount =
        tx.transaction.to?.toLowerCase() === address.toLowerCase();

      const currentBlockNumberValue = tx.blockNumber
        ? parseInt(tx.blockNumber, 10)
        : -1;

      const latestBlockNumberValue = latestBlockNumber
        ? parseInt(latestBlockNumber, 10)
        : -1;

      if (
        onCurrentChain &&
        fromCurrentAccount &&
        latestBlockNumberValue < currentBlockNumberValue
      ) {
        latestBlockNumber = tx.blockNumber;
      }
    }

    return latestBlockNumber;
  }

  async #isToSmartContract(transaction: Transaction): Promise<boolean> {
    // Contract Deploy
    if (!transaction.to) {
      return false;
    }

    // Send
    if (transaction.data === '0x') {
      return false;
    }

    const ethQuery = this.#getEthQuery();
    const code = await query(ethQuery, 'getCode', [transaction.to]);

    return isSmartContractCode(code);
  }

  #sortTransactionsByTime(transactions: TransactionMeta[]) {
    transactions.sort((a, b) => (a.time < b.time ? -1 : 1));
  }

  #reconcileTransactions(
    localTxs: TransactionMeta[],
    remoteTxs: TransactionMeta[],
  ): [boolean, TransactionMeta[]] {
    const updatedTxs: TransactionMeta[] = this.#getUpdatedTransactions(
      remoteTxs,
      localTxs,
    );

    const newTxs: TransactionMeta[] = this.#getNewTransactions(
      remoteTxs,
      localTxs,
    );

    const updatedLocalTxs = localTxs.map((tx: TransactionMeta) => {
      const txIdx = updatedTxs.findIndex(
        ({ transactionHash }) => transactionHash === tx.transactionHash,
      );
      return txIdx === -1 ? tx : updatedTxs[txIdx];
    });

    const updateRequired = newTxs.length > 0 || updatedTxs.length > 0;
    const transactions = [...newTxs, ...updatedLocalTxs];

    return [updateRequired, transactions];
  }

  #getNewTransactions(
    remoteTxs: TransactionMeta[],
    localTxs: TransactionMeta[],
  ): TransactionMeta[] {
    return remoteTxs.filter((tx) => {
      const alreadyInTransactions = localTxs.find(
        ({ transactionHash }) => transactionHash === tx.transactionHash,
      );
      return !alreadyInTransactions;
    });
  }

  #getUpdatedTransactions(
    remoteTxs: TransactionMeta[],
    localTxs: TransactionMeta[],
  ): TransactionMeta[] {
    return remoteTxs.filter((remoteTx) => {
      const isTxOutdated = localTxs.find((localTx) => {
        return (
          remoteTx.transactionHash === localTx.transactionHash &&
          this.#isTransactionOutdated(remoteTx, localTx)
        );
      });
      return isTxOutdated;
    });
  }

  #isTransactionOutdated(
    remoteTx: TransactionMeta,
    localTx: TransactionMeta,
  ): boolean {
    const statusOutdated = this.#isStatusOutdated(
      remoteTx.transactionHash,
      localTx.transactionHash,
      remoteTx.status,
      localTx.status,
    );

    const gasDataOutdated = this.#isGasDataOutdated(
      remoteTx.transaction.gasUsed,
      localTx.transaction.gasUsed,
    );

    return statusOutdated || gasDataOutdated;
  }

  #isStatusOutdated(
    remoteTxHash: string | undefined,
    localTxHash: string | undefined,
    remoteTxStatus: TransactionStatus,
    localTxStatus: TransactionStatus,
  ): boolean {
    return remoteTxHash === localTxHash && remoteTxStatus !== localTxStatus;
  }

  #isGasDataOutdated(
    remoteGasUsed: string | undefined,
    localGasUsed: string | undefined,
  ): boolean {
    return remoteGasUsed !== localGasUsed;
  }
}
