# `@metamask/ramps-controller`

Manages on-ramp and off-ramp operations for MetaMask.

## Installation

`yarn add @metamask/ramps-controller`

or

`npm install @metamask/ramps-controller`

## Usage

```typescript
import { RampsController, type Country } from '@metamask/ramps-controller';

// Create controller with custom API host (optional)
const rampsController = new RampsController({
  messenger,
  onRampApiHost: 'https://your-api-host.com', // Optional
});

// Get list of countries
const countries: Country[] = await messenger.call(
  'RampsController:getCountries'
);
```

## Features

- Fetch available countries for ramps
- Configure API host for staging/production environments
- Start on-ramp and off-ramp operations
- Manage ramp operation lifecycle

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).

