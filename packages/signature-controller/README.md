# `@metamask/signature-controller`

A controller that manages cryptographic signature requests in MetaMask. This controller handles the creation, processing, and management of various types of signature requests, including personal signatures (personal_sign) and typed data signatures (eth_signTypedData) according to EIP-712.

## Features

- **Multiple Signature Types**: Support for personal_sign and eth_signTypedData (v1, v3, v4)
- **SIWE Support**: Built-in Sign-In with Ethereum (SIWE) message detection
- **Request Management**: Track and manage signature request lifecycle
- **Approval Flow**: Integrated with approval system for user confirmation
- **Signature Decoding**: Optional decoding of permit signatures
- **State Management**: Maintains state of all signature requests
- **Event System**: Rich event system for signature lifecycle events
- **Type Safety**: Written in TypeScript for enhanced type safety
- **Deferred Signing**: Support for deferred signature completion

## Installation

```bash
yarn add @metamask/signature-controller
```

or

```bash
npm install @metamask/signature-controller
```

## Usage

Here's how to use the SignatureController:

```typescript
import { SignatureController } from '@metamask/signature-controller';

// Initialize the controller
const controller = new SignatureController({
  messenger,
  // Optional: Enable signature decoding
  decodingApiUrl: 'https://api.example.com/decode',
  isDecodeSignatureRequestEnabled: () => true,
});

// Handle personal signature request
const signature = await controller.newUnsignedPersonalMessage(
  {
    from: '0x...',
    data: '0x...',
  },
  {
    origin: 'https://dapp.example.com',
    networkClientId: 'mainnet',
  },
);

// Handle typed data signature request (EIP-712)
const typedSignature = await controller.newUnsignedTypedMessage(
  {
    from: '0x...',
    data: {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallet', type: 'address' },
        ],
      },
      primaryType: 'Person',
      domain: {
        name: 'Example DApp',
        version: '1',
        chainId: 1,
        verifyingContract: '0x...',
      },
      message: {
        name: 'Bob',
        wallet: '0x...',
      },
    },
  },
  {
    origin: 'https://dapp.example.com',
    networkClientId: 'mainnet',
  },
  'V4', // SignTypedDataVersion
);

// Subscribe to signature events
controller.hub.on('PersonalSign:signed', ({ signature, messageId }) => {
  console.log('Personal signature completed:', { signature, messageId });
});

controller.hub.on('TypedSign:signed', ({ signature, messageId }) => {
  console.log('Typed signature completed:', { signature, messageId });
});

// Handle deferred signing
const messageId = 'signature-request-id';
controller.setTypedMessageInProgress(messageId);
// ... perform async operation ...
controller.setDeferredSignSuccess(messageId, signature);

// Reject unapproved requests
controller.rejectUnapproved('User cancelled');

// Clear unapproved requests
controller.clearUnapproved();
```

## State Management

The controller maintains state with the following structure:

```typescript
interface SignatureControllerState {
  signatureRequests: Record<string, SignatureRequest>;
}

interface SignatureRequest {
  id: string;
  type: SignatureRequestType;
  status: SignatureRequestStatus;
  messageParams: MessageParams;
  rawSig?: string;
  error?: string;
  chainId: string;
  origin: string;
  siwe?: StateSIWEMessage;
  decodingData?: DecodingResult;
  decodingLoading?: boolean;
}

enum SignatureRequestStatus {
  Unapproved = 'unapproved',
  Approved = 'approved',
  Signed = 'signed',
  Rejected = 'rejected',
  InProgress = 'in_progress',
}
```

## Error Handling

The controller provides comprehensive error handling:

```typescript
try {
  await controller.newUnsignedPersonalMessage(/* ... */);
} catch (error) {
  if (error.message.includes('User denied message signature')) {
    // Handle user rejection
  } else if (error.message.includes('Invalid parameters')) {
    // Handle invalid parameters
  }
}
```

## Compatibility

This package relies implicitly upon the `EventEmitter` module. This module is available natively in Node.js, but when using this package for the browser, make sure to use a polyfill such as `events`.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
