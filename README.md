![metamask-core logo](https://metamask.io/img/metamask.png)

Foo is a core collection of platform-agnostic modules for creating secure data models for cryptocurrency wallets. Every module exposes a common store interface for configuration, state management, and subscription. Modules can be composed together into a single store that can be used as a robust data model for wallet frontends regardless of their intended platform.

## Usage

1. Install the package.
    ```
    npm i @metamask/foo
    ```
2. Compose stores to create a data model.
    ```js
	import {
		AddressBookController,
		ComposableController,
		CurrencyRateController,
		NetworkStatusController,
		TokenRatesController
	} from '@metamask/foo';

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
