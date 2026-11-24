# Hand-rolled Multicall3 aggregate3 codecs

- Date: 2026-10-26
- Status: Accepted
- Package: `@metamask/assets-controller`

How balance batches encode and decode Multicall3 `aggregate3` without walking
the general Ethers ABI coder on the hot path.

## What this change is about

A balance refresh asks many contracts for `balanceOf`, and asks Multicall3
itself for native `getEthBalance`. Those calls go out as one
`aggregate3((address target, bool allowFailure, bytes callData)[])`.

The client used to encode that call and decode the return value with
`@ethersproject/abi`. That coder parses an ABI and handles every Solidity
type. This call has one shape, and it runs for every account and chain on
each refresh. On some low-end Android devices, encoding the batch and
decoding the response each took about 4 seconds
([Slack thread](https://consensys.slack.com/archives/C0AKX44EGH4/p1793027613955669?thread_ts=1793027586.285609&cid=C0AKX44EGH4)).

The hot path now uses a codec that only knows this function. The Ethers
functions stay in the tree so tests can require the two implementations to
return the same bytes.

## Where the code lives

| Piece                                                          | Role                                                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/data-sources/evm-rpc-services/clients/aggregate3Codec.ts` | Hand-rolled `encodeAggregate3`, `decodeAggregate3Response`, and `decodeUint256`. `MulticallClient` calls these.         |
| `MulticallClient.ts` in the same folder                        | `encodeAggregate3WithEthers`, `decodeAggregate3ResponseWithEthers`, and `decodeUint256WithEthers`. The reference coder. |
| `aggregate3Codec.test.ts`                                      | Readable batches compared with the Ethers codecs, plus inputs Ethers rejects.                                           |

`balanceOf` and `getEthBalance` call data is still built with the Ethers
interface. That data depends only on the account, and the client caches it.
The hand-rolled codec is the part that runs again for every batch.

## How the bytes are laid out

The call data starts with selector `82ad56cb`, then a single dynamic array.

```text
selector                         82ad56cb
word                             offset of the array, always 0x20
word                             number of calls, N
N words                          offset of each call, from the first of these words
each call, in order
  word                           target, left-padded to 32 bytes
  word                           allowFailure, 0 or 1
  word                           offset of callData, always 0x60
  word                           callData length, in bytes
  32-byte-padded bytes           callData
```

The first call starts at `32 * N` because that is the size of the offset
table. Each following call starts at the previous offset plus the padded
size of the previous body. A body is 128 bytes (address, bool, callData
offset, and the length word) plus `callData` rounded up to 32 bytes.

An `eth_call` response has no selector. Its first word points at the result
array. That array is a length, then one offset per result, then
`(bool success, bytes returnData)` tuples. `success` is the tuple's first
word. `returnData` is a length prefix plus bytes. A uint256 balance is the
first 32 bytes of that payload, read as a decimal string. Empty or short
payloads decode as `0`, which is what the Ethers `balanceOf` decoder returns
for the same input.

Addresses follow the Ethers coder as well: a `0x` prefix, hex digits, and at
most 32 bytes. A target that is not 20 bytes is left-padded. Rejecting those
would change calldata that Ethers currently produces, so the parity tests
cover a 39-nibble target and a 41-nibble target on purpose.

## Measured cost

On some low-end Android devices, encoding an aggregate3 balance batch and
decoding the response each took about 4 seconds
([Slack thread](https://consensys.slack.com/archives/C0AKX44EGH4/p1793027613955669?thread_ts=1793027586.285609&cid=C0AKX44EGH4)).
That is the device cost to use when judging this path.

A desktop Hermes 1.0.0 microbenchmark of the hand-rolled helpers is a
different machine. For a 300-call batch, the median of three optimized runs
was 1.125 ms for the full codec path, 0.625 ms to encode, 0.300 ms to decode,
and 0.200 ms to read a uint256. Splitting the body into the helpers in
`aggregate3Codec.ts` left those desktop medians unchanged.
[MetaMask/core#11010](https://github.com/MetaMask/core/pull/11010) compared
the same style of encoder with the Ethers coder on an earlier Hermes build,
where the Ethers coder dominated that bench.

## What we gain

- The batch path writes known words and reads them back, for this one ABI
  shape, on every call in the batch.
- The output matches the Ethers coder byte for byte, including the address
  widths above. The codec tests run the same batches through both
  implementations and compare.
- There is no new dependency. The codec is a pure module, and its tests do
  not construct a provider or a `MulticallClient`.

## What we take on

The layout is now ours to keep correct. A change to the Multicall3 `aggregate3`
ABI would not show up by itself. The Ethers functions are the spec: the codec
tests encode and decode with both and compare. Those Ethers functions stay
until a later change removes them; they are not what `MulticallClient` calls.
