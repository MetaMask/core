const { AssetsContractController } = require('.');
const { NetworkController } = require('../network-controller');
const HttpProvider = require('ethjs-provider-http');
const { Contract } = require('@ethersproject/contracts');
const { Web3Provider } = require('@ethersproject/providers');

const benchmark = async (provider, iterations) => {
  const tokenAddress = "0x5974D2B77eedae32B576b0ADF32373a339d73833";
  const userAddress = "0x9f36f6073a1e27d93c767d899470fb8eeaf8ae86";

  // Existing approach of multiple RPC calls
  const controller = new AssetsContractController({
    chainId: 11155111, // sepolia
    onPreferencesStateChange: () => { },
    onNetworkStateChange: () => { },
    getNetworkClientById: () => ({provider})
  });

  // Take average time of <n> requests
  let start = performance.now();
  for (let i = 0; i < iterations; i++) {
    details = await controller.getTokenStandardAndDetails(
      tokenAddress, userAddress, undefined, 'sepolia');
  }
  console.log("Existing multi RPC calls:")
  console.log((performance.now() - start) / iterations);
  console.log(details);
  
  // Smart contract approach
  const abi = [
    {
      "name": "getTokenStandardAndDetails", "stateMutability": "view", "type": "function",
      "inputs": [
        { "internalType": "address", "name": "tokenAddress", "type": "address" },
        { "internalType": "address", "name": "userAddress", "type": "address" }
      ],
      "outputs": [{
        "components": [
          { "internalType": "string", "name": "standard", "type": "string" },
          { "internalType": "string", "name": "tokenURI", "type": "string" },
          { "internalType": "string", "name": "symbol", "type": "string" },
          { "internalType": "string", "name": "name", "type": "string" },
          { "internalType": "uint8", "name": "decimals", "type": "uint8" },
          { "internalType": "uint256", "name": "balance", "type": "uint256" }
        ],
        "internalType": "struct GetTokenStandardAndDetails.StandardAndDetails",
        "name": "", "type": "tuple"
      }],
    },
    // 2 other function overloads are omitted
  ];

  const contract = new Contract("0xa596fefb77219145394151c5d7380932abfacc73",
    abi, new Web3Provider(provider))['getTokenStandardAndDetails(address,address)'];

  // Take average time of <n> requests
  start = performance.now();
  for (let i = 0; i < iterations; i++) {
    details = await contract(tokenAddress, userAddress);
  }
  console.log("Contract with 1 RPC call:")
  console.log((performance.now() - start) / iterations);
  const { decimals, symbol, balance, standard } = details;
  console.log({ decimals, symbol, balance, standard })

  // TODO: benchmark multicall3: https://github.com/mds1/multicall
}

(async function main() {
  const iterations = process.argv[2] ?? 1;
  const infuraProjectId = '<OMITTED>';

  // Benchmark with same provider as product
  const networkController = new NetworkController({
    infuraProjectId,
    messenger: {
      registerActionHandler: () => {},
      publish: () => {},
      subscribe: () => {},
      unsubscribe: () => {},
    }
  });
  networkController.setProviderType('sepolia');
  let {provider} = networkController.getProviderAndBlockTracker();
  console.log(`NetworkController provider, ${iterations} iterations:`)
  await benchmark(provider, iterations);
  console.log();

  // Benchmark with normal provider
  provider = new HttpProvider(`https://sepolia.infura.io/v3/${infuraProjectId}`);
  console.log(`HttpProvider, ${iterations} iterations:`)
  await benchmark(provider, iterations);

})().catch(e => { console.error(e) })

// Results:
//
// NetworkController provider, 1 iterations:
//   Existing multi RPC calls: 1127.5343329906464
//   Contract with 1 RPC call: 184.28245800733566
//
// NetworkController provider, 10 iterations:
//   Existing multi RPC calls: 507.6427625000477
//   Contract with 1 RPC call: 20.540170902013777
//
// HttpProvider, 1 iterations:
//   Existing multi RPC calls: 2203.581832975149
//   Contract with 1 RPC call: 555.5011250078678
//
// HttpProvider, 10 iterations:
//   Existing multi RPC calls: 2101.5782083004715
//   Contract with 1 RPC call: 392.4244249999523
//
// Question: Why is NetworkController faster with more iterations?
//           Is there some caching going on?

