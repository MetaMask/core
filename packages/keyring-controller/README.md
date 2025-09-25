# `@metamask/keyring-controller`

A controller that manages cryptographic identities (keyrings) in MetaMask. This controller handles the creation, storage, and management of user accounts, including HD wallets, hardware wallets, and other types of keyrings. It also manages the encryption and decryption of sensitive data in the vault.

## Features

- **Multiple Keyring Types**: Support for various keyring types (HD, Simple, Hardware)
- **Secure Vault**: Encrypted storage of private keys and sensitive data
- **Account Management**: Create, import, and manage multiple accounts
- **Hardware Wallet Support**: Integration with hardware wallet devices
- **State Management**: Maintains state of keyrings and vault status
- **Encryption**: Built-in encryption/decryption of sensitive data
- **Type Safety**: Written in TypeScript for enhanced type safety
- **Atomic Operations**: Supports atomic operations with rollback capability
- **Event System**: Rich event system for keyring lifecycle events

## Installation

```bash
yarn add @metamask/keyring-controller
```

or

```bash
npm install @metamask/keyring-controller
```

## Usage

Here's how to use the KeyringController:

```typescript
import { KeyringController } from '@metamask/keyring-controller';

// Initialize the controller
const controller = new KeyringController({
  encryptor: {
    // Custom encryptor implementation
    encrypt(password: string, dataObj: unknown) {
      return '...'; // Return encrypted string
    },
    decrypt(password: string, text: string) {
      return {}; // Return decrypted object
    },
  },
  // Optional: Add custom keyring builders
  keyringBuilders: [
    {
      type: 'Custom Keyring',
      (): CustomKeyring {
        return new CustomKeyring();
      },
    },
  ],
  // Optional: Cache encryption key
  cacheEncryptionKey: false,
});

// Create new vault and keyring
await controller.createNewVaultAndKeychain('strong password');

// Create new vault and restore HD wallet
await controller.createNewVaultAndRestore('strong password', 'seed words...');

// Add new account
const newAccount = await controller.addNewAccount();

// Export account
const privateKey = await controller.exportAccount('0x...');

// Sign data
const signature = await controller.signMessage({
  from: '0x...',
  data: '0x...',
});

// Sign transaction
const signedTx = await controller.signTransaction({
  from: '0x...',
  to: '0x...',
  value: '0x0',
  gas: '0x5208',
  gasPrice: '0x...',
  nonce: '0x0',
});

// Get encryption public key
const publicKey = await controller.getEncryptionPublicKey('0x...');

// Subscribe to state changes
messenger.subscribe('KeyringController:stateChange', (state) => {
  console.log('New state:', state);
});

// Lock/unlock vault
await controller.setLocked(); // Lock
await controller.submitPassword('password'); // Unlock
```

## State Management

The controller maintains state with the following structure:

```typescript
interface KeyringControllerState {
  vault?: string; // Encrypted keyring data
  isUnlocked: boolean; // Vault unlock status
  keyrings: KeyringObject[]; // Array of keyring objects
  encryptionKey?: string; // Optional cached encryption key
  encryptionSalt?: string; // Salt used for encryption
}

interface KeyringObject {
  accounts: string[]; // Accounts in the keyring
  type: string; // Keyring type
  metadata: {
    id: string; // Unique keyring ID
    name: string; // Keyring name
  };
}
```

## Keyring Operations

The controller provides methods for various keyring operations:

```typescript
// Add new keyring
const hdKeyring = await controller.addNewKeyring('HD Key Tree');

// Get accounts from a specific keyring type
const accounts = await controller.getKeyringsByType('HD Key Tree');

// Get keyring for specific account
const keyring = await controller.getKeyringForAccount('0x...');

// Remove keyring
await controller.removeKeyring('keyring-id');

// Verify a keyring's password
const isValid = await controller.verifyPassword('password');
```

## Error Handling

The controller provides comprehensive error handling:

```typescript
try {
  await controller.addNewAccount();
} catch (error) {
  if (error.message.includes('Controller is locked')) {
    // Handle locked controller error
  } else if (error.message.includes('Keyring not found')) {
    // Handle missing keyring error
  }
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
