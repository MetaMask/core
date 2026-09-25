# Data services

## What is a data service?

A **data service** is a pattern for making interactions with an external API (fetching token prices, storing accounts, etc.). It is implemented as a plain TypeScript class with methods that are exposed through a messenger.

## Tutorial

We've written a [tutorial](./packages/wallet-framework-docs/content/data-services/writing-data-services) which walks you through writing a data service and discusses various use cases.

## Guidelines

When adding or updating data services in packages, follow these guidelines:

- Data services should define a public messenger type.
- All methods defined on the service class should be exposed through the messenger.
- All messenger actions and events should be publicly defined.
- All actions and events the messenger uses from other services should also be declared in the messenger type.
- The constructor should take `messenger` and `fetch` options at a minimum.
- The constructor should construct a policy using the `createServicePolicy` function.
- Each method in a service class should represent a single endpoint of an API.
- Use the policy to wrap each request to the endpoint.
- If a request has a non-2xx response, throw an error.
- Validate each request's response (throwing an error if invalid) before returning its data.
- Service classes should also define `onRetry`, `onBreak`, and `onDegraded` methods.
- Make sure to write comprehensive tests for the service class.
