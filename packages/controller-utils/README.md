# `@metamask/controller-utils`

A comprehensive utility package providing essential functions and data structures shared across MetaMask controllers. This package simplifies common operations like hex conversion, safe execution, fetch operations, and data validation.

## Features

- **Hex Utilities**: Convert between hex, decimal, and BN formats
- **Safe Execution**: Wrapper functions for safe async operations with timeout support
- **Network Utilities**: Enhanced fetch operations with timeout and error handling
- **Data Validation**: Functions to validate addresses, JSON, and other data types
- **Type-Safe**: Written in TypeScript with comprehensive type definitions
- **ENS Support**: Utilities for working with ENS names
- **Math Operations**: Safe mathematical operations with BN.js

## Installation

```bash
yarn add @metamask/controller-utils
```

or

```bash
npm install @metamask/controller-utils
```

## Usage

### Hex Utilities

```typescript
import {
  hexToBN,
  toHex,
  weiHexToGweiDec,
  hexToText,
} from '@metamask/controller-utils';

// Convert hex to BN
const bn = hexToBN('0xff'); // BN(255)

// Convert number to hex
const hex = toHex(255); // '0xff'

// Convert wei hex to gwei decimal
const gwei = weiHexToGweiDec('0x3b9aca00'); // '1'

// Convert hex to text
const text = hexToText('0x48656c6c6f'); // 'Hello'
```

### Safe Execution

```typescript
import {
  safelyExecute,
  safelyExecuteWithTimeout,
} from '@metamask/controller-utils';

// Execute async operation safely
const result = await safelyExecute(async () => {
  return await someAsyncOperation();
});

// Execute with timeout
const resultWithTimeout = await safelyExecuteWithTimeout(
  async () => {
    return await someAsyncOperation();
  },
  true, // log errors
  1000, // timeout in ms
);
```

### Network Operations

```typescript
import {
  handleFetch,
  timeoutFetch,
  fetchWithErrorHandling,
} from '@metamask/controller-utils';

// Simple fetch with JSON response
const data = await handleFetch('https://api.example.com/data');

// Fetch with timeout
const response = await timeoutFetch(
  'https://api.example.com/data',
  { method: 'POST' },
  1000, // timeout in ms
);

// Fetch with error handling
const result = await fetchWithErrorHandling({
  url: 'https://api.example.com/data',
  options: { method: 'GET' },
  timeout: 1000,
  errorCodesToCatch: [404, 500],
});
```

### Validation

```typescript
import {
  isValidHexAddress,
  isValidJson,
  isEqualCaseInsensitive,
} from '@metamask/controller-utils';

// Validate Ethereum address
const isValid = isValidHexAddress('0x123...'); // true/false

// Validate JSON
const isJsonValid = isValidJson({ key: 'value' }); // true

// Case-insensitive string comparison
const isEqual = isEqualCaseInsensitive('Hello', 'hello'); // true
```

## API Reference

### Hex Operations

- `hexToBN(hex: string): BN` - Converts hex string to BN
- `toHex(value: number | string | BN): string` - Converts value to hex string
- `weiHexToGweiDec(hex: string): string` - Converts wei hex to gwei decimal
- `hexToText(hex: string): string` - Converts hex to UTF-8 text

### Safe Execution

- `safelyExecute(operation: () => Promise<T>): Promise<T | undefined>`
- `safelyExecuteWithTimeout(operation: () => Promise<T>, timeout?: number): Promise<T | undefined>`

### Network Operations

- `handleFetch(request: RequestInfo): Promise<any>`
- `timeoutFetch(url: string, options?: RequestInit, timeout?: number): Promise<Response>`
- `fetchWithErrorHandling(options: FetchOptions): Promise<any>`

### Validation

- `isValidHexAddress(address: string): boolean`
- `isValidJson(value: unknown): boolean`
- `isEqualCaseInsensitive(value1: string, value2: string): boolean`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
