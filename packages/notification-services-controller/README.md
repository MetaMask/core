# `@metamask/notification-services-controller`

Manages the notification and push notification services used in MetaMask. This includes:

- Wallet Notifications
- Feature Announcements
- Snap Notifications

## Installation

`yarn add @metamask/notification-services-controller`

or

`npm install @metamask/notification-services-controller`

## Usage

This package uses subpath exports, which help to minimize the amount of code you wish to import. It also helps to keep specific modules isolated, and can be used to import specific code (e.g. mocks, or platform specific code). You can see all the exports in the [`package.json`](./package.json), but here are a few.

Importing specific controllers/modules:

```ts
// Import the NotificationServicesController and access its types/utilities
import { ... } from '@metamask/notification-services-controller/notification-services'

// Import the NotificationServicesPushController and access its types/utilities
import { ... } from '@metamask/notification-services-controller/push-services'
```

Importing mock creation functions:

```ts
// You can import and use mocks creation functions (that are 1:1 with the types)
// Can be used for testing or storybooks
import { ... } from '@metamask/notification-services-controller/notification-services/mocks'
import { ... } from '@metamask/notification-services-controller/push-services/mocks'
```

Importing platform specific code:

```ts
// Some controllers provide an interface to inject platform specific depending on the client (e.g. web or mobile)
import { ... } from '@metamask/notification-services-controller/push-services/web'
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
