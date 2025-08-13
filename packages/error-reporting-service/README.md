# `@metamask/error-reporting-service`

Reports errors to an external app such as Sentry but in an agnostic fashion.

## Installation

`yarn add @metamask/error-reporting-service`

or

`npm install @metamask/error-reporting-service`

## Usage

This package is designed to be used in another module via a messenger, but can also be used on its own if needed.

### Using the service via a messenger

In most cases, you will want to use the error reporting service in your module via a messenger object.

In this example, we have a controller, and something bad happens, but we want to report an error instead of throwing it.

#### 1. Controller file

```typescript
// We need to get the type for the `ErrorReportingService:captureException`
// action.
import type { ErrorReportingServiceCaptureExceptionAction } from '@metamask/error-reporting-service';

// Now let's set up our controller, starting with the messenger.
// Note that we grant the `ErrorReportingService:captureException` action to the
// messenger.
type AllowedActions = ErrorReportingServiceCaptureExceptionAction;
type ExampleControllerMessenger = RestrictedMessenger<
  'ExampleController',
  AllowedActions,
  never,
  AllowedActions['type'],
  never
>;

// Finally, we define our controller.
class ExampleController extends BaseController<
  'ExampleController',
  ExampleControllerState,
  ExampleControllerMessenger
> {
  doSomething() {
    // Now imagine that we do something that produces an error and we want to
    // report the error.
    this.messagingSystem.call(
      'ErrorReportingService:captureException',
      new Error('Something went wrong'),
    );
  }
}
```

#### 2A. Initialization file (browser)

```typescript
// We need a version of `captureException` from somewhere. Here, we are getting
// it from `@sentry/browser`.
import { captureException } from '@sentry/browser';

// We also need to get the ErrorReportingService.
import { ErrorReportingService } from '@metamask/error-reporting-service';

// And we need our controller.
import { ExampleController } from './example-controller';

// We need to have a global messenger.
const globalMessenger = new Messenger();

// We need to create a restricted messenger for the ErrorReportingService, and
// then we can create the service itself.
const errorReportingServiceMessenger = globalMessenger.getRestricted({
  allowedActions: [],
  allowedEvents: [],
});
const errorReportingService = new ErrorReportingService({
  messenger: errorReportingServiceMessenger,
  captureException,
});

// Now we can create a restricted messenger for our controller, and then
// we can create the controller too.
// Note that we grant the `ErrorReportingService:captureException` action to the
// messenger.
const exampleControllerMessenger = globalMessenger.getRestricted({
  allowedActions: ['ErrorReportingService:captureException'],
  allowedEvents: [],
});
const exampleController = new ExampleController({
  messenger: exampleControllerMessenger,
});
```

#### 2B. Initialization file (React Native)

```typescript
// We need a version of `captureException` from somewhere. Here, we are getting
// it from `@sentry/react-native`.
import { captureException } from '@sentry/react-native';

// We also need to get the ErrorReportingService.
import { ErrorReportingService } from '@metamask/error-reporting-service';

// And we need our controller.
import { ExampleController } from './example-controller';

// We need to have a global messenger.
const globalMessenger = new Messenger();

// We need to create a restricted messenger for the ErrorReportingService, and
// then we can create the service itself.
const errorReportingServiceMessenger = globalMessenger.getRestricted({
  allowedActions: [],
  allowedEvents: [],
});
const errorReportingService = new ErrorReportingService({
  messenger: errorReportingServiceMessenger,
  captureException,
});

// Now we can create a restricted messenger for our controller, and then
// we can create the controller too.
// Note that we grant the `ErrorReportingService:captureException` action to the
// messenger.
const exampleControllerMessenger = globalMessenger.getRestricted({
  allowedActions: ['ErrorReportingService:captureException'],
  allowedEvents: [],
});
const exampleController = new ExampleController({
  messenger: exampleControllerMessenger,
});
```

#### 3. Using the controller

```typescript
// Now this will report an error without throwing it.
exampleController.doSomething();
```

### Using the service directly

You probably don't need to use the service directly, but if you do, here's how.

In this example, we have a function, and we use the error reporting service there.

#### 1. Function file

```typescript
export function doSomething(
  errorReportingService: AbstractErrorReportingService,
) {
  errorReportingService.captureException(new Error('Something went wrong'));
}
```

#### 2A. Calling file (browser)

```typescript
// We need a version of `captureException` from somewhere. Here, we are getting
it from `@sentry/browser`.
import { captureException } from '@sentry/browser';

// We also need to get the ErrorReportingService.
import { ErrorReportingService } from '@metamask/error-reporting-service';

// We also bring in our function.
import { doSomething } from './do-something';

// We create a new instance of the ErrorReportingService.
const errorReportingService = new ErrorReportingService({ captureException });

// Now we call our function, and it will report the error in Sentry.
doSomething(errorReportingService);
```

#### 2A. Calling file (React Native)

```typescript
// We need a version of `captureException` from somewhere. Here, we are getting
it from `@sentry/react-native`.
import { captureException } from '@sentry/react-native';

// We also need to get the ErrorReportingService.
import { ErrorReportingService } from '@metamask/error-reporting-service';

// We also bring in our function.
import { doSomething } from './do-something';

// We create a new instance of the ErrorReportingService.
const errorReportingService = new ErrorReportingService({ captureException });

// Now we call our function, and it will report the error in Sentry.
doSomething(errorReportingService);
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
