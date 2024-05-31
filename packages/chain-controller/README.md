# `@metamask/chain-controller`

Manages chain-agnostic providers implementing the chain API.

## Installation

`yarn add @metamask/chain-controller`

or

`npm install @metamask/chain-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).

## Description

This controller is responsible to "bridge" Snaps that implements the [Chain API] and a MetaMask
client.

The controller maps a "chain provider" to its CAIP-2 (chain id) identifier
(named `scope` in the [Chain API]).
The MetaMask client can then use an external source (outside for current controllers that
only support EVM networks) to fetch information from a non-EVM network.

The controller itself also implements the [Chain API]. Its uses the `scope` (that is always
required for any methods) to identify the chain provider and then forward the method call to this
provider.

The calls are dispatched through the `SnapsController:handleRequest`'s action.

Here's the high-level flow when invoking a [Chain API]'s method:

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}}}%%
sequenceDiagram
  autonumber

  participant MetaMask
  participant ChainController
  participant Snap


  box Metamask Client
    participant MetaMask
    participant ChainController
  end

  MetaMask -> Snap: Retrieves Snap ID
  MetaMask ->> ChainController: registerProvider(scope, snapId)
  note over MetaMask,Snap: Provider must be registered first


  MetaMask ->> ChainController: chain_method(scope, ...)
  activate MetaMask

  alt If there is a chain client for this scope
      ChainController ->> ChainController: client = getProviderClient(scope)

      ChainController ->> Snap: client.chain_method(scope, ...)
      Snap ->> Snap: Process Chain API request
      Snap -->> ChainController: Chain API response
  end

  ChainController -->> MetaMask: Chain API Response

  deactivate MetaMask
```

Clients and Snap interactions:

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}}}%%
sequenceDiagram
  autonumber

  participant ChainController
  participant SnapChainProviderClient
  participant SnapHandlerClient
  participant SnapsController

  ChainController ->> SnapChainProviderClient: chain_method(scope, ...)
  activate ChainController

  note over SnapChainProviderClient: This client also implements the Chain API methods

  SnapChainProviderClient ->> SnapHandlerClient: submitRequest({ snapId, origin, handler, request })

  SnapHandlerClient ->> SnapsController: :handleRequest(...)
  SnapsController -->> SnapHandlerClient: Response

  SnapHandlerClient -->> SnapChainProviderClient: Response

  SnapChainProviderClient -->> ChainController: Response

  deactivate ChainController
```

## Resources

- [Chain API](https://github.com/MetaMask/chain-api/)
