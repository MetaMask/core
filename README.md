![gaba logo](https://raw.githubusercontent.com/bitpshr/gaba/master/logo.png)

The **gaba** engine is a collection of platform-agnostic modules for creating secure data models for cryptocurrency wallets. Every module exposes a common store interface for configuration, state management, and subscription. Modules are single-purpose and can be composed together into a single store that can be used as a robust data model for wallet frontends regardless of their intended platform.

View the [API documentation](https://bitpshr.github.io/gaba/) for information on each module.

[![Build Status](https://travis-ci.org/bitpshr/gaba.svg?branch=master)](https://travis-ci.org/bitpshr/gaba)

## Usage

1. Install the package.
    ```
    npm i @metamask/gaba
    ```
2. Compose stores to create a data model.
    ```js
	import {
		AddressBookController,
		ComposableController,
		CurrencyRateController,
		NetworkStatusController,
		TokenRatesController
	} from '@metamask/gaba';

	const datamodel = new ComposableController([
		new AddressBookController(),
		new CurrencyRateController(),
		new NetworkStatusController,
		new TokenRatesController()
	]);
	
	datamodel.subscribe((state) => { /* data model has changed */ });
    ```

## License

[MIT](./LICENSE)
