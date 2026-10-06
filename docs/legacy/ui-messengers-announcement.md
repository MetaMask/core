# Using messengers in UI files

## tl;dr

The Core Platform team has developed a strategy for using messengers in UI components. **We are asking all teams to start using this strategy going forward when creating or updating features.**

Using messengers in UI components looks like this:

```tsx
import { useMessenger } from '../../../../hooks/useMessenger';
import type { RouteMessengerInstance } from '../messenger';

export function MyComponent() {
  const messenger = useMessenger<RouteMessengerInstance>();

  // ... later ...

  messenger.call('SomeController:someAction');
}
```

You can see examples here:

- [Extension](https://github.com/MetaMask/metamask-extension/pull/42115/changes)
- [Mobile](https://github.com/MetaMask/metamask-mobile/pull/29653/changes)

## Introduction

### Technical background

- **Controllers** and **services** are abstractions used within the extension and mobile app which hold state and business logic for features and represent interactions with external systems.
  - An example of a controller is [KeyringController](https://github.com/MetaMask/core/blob/f3b3fd574e786645dbb9ed72b5ec223fbdba0fc5/packages/keyring-controller/src/KeyringController.ts), which is responsible for managing the user’s encrypted store of private keys and facilitating operations which make use of this store.
  - An example of a service is [MoneyAccountBalanceService](https://github.com/MetaMask/core/blob/f3b3fd574e786645dbb9ed72b5ec223fbdba0fc5/packages/money-account-balance-service/src/money-account-balance-service.ts), which is responsible for fetching money account balances using the Money API.
- **Messengers** are abstractions which govern interactions between different domains within the clients. Each component (such as a controller or service) has a messenger which represents its _capabilities_. It declares a sort of contract which states the kinds of things it grants other domains to do, and what kinds of things it has been granted from other domains. This allows boundaries to be drawn around these domains, decoupling them and making them easier to test.
  - There are two kinds of **capabilities**: _actions_ that can be called and _events_ that can be subscribed to. They are identified by strings which are namespaced by the controller or service where they are defined, e.g. `KeyringController:addNewAccountForKeyring`, `MoneyAccountBalanceService:getMoneyAccountBalance`, etc.
- Furthermore, each client has a **message bus** (also sometimes called the _root messenger_)**.** If controllers and services act as the beating heart behind the product, the message bus is the backbone, because it combines all of the capabilities from all messengers across all domains, **creating an API that any part of the stack can use to “do stuff”.**
  - The root messenger for the extension is here: https://github.com/MetaMask/metamask-extension/blob/8f66b8fc55c950a3a1a71ba82b9da3316154e37e/app/scripts/lib/messenger.ts
  - The root messenger for the mobile app is here: https://github.com/MetaMask/metamask-mobile/blob/084957e32166bb98c5e01101305d702fb3d42046/app/core/Engine/types.ts#L979

> [!NOTE]
> All of these pieces fit into the vision of the “Wallet Framework”, an initiative being developed by the Core Platform team.

### The problem

One of the goals of the Core Platform team is to develop infrastructure so that product teams within MetaMask can deliver higher-quality features faster. So far we have done that by consolidating common functionality across clients into composable, reusable modules and developing a framework for all of these modules to sit in. The architecture we’ve developed works well at the “core layer”, but is ultimately incomplete. **We would now like to turn our attention to the UI layer.**

Today, React components and hooks access controllers and services in an inconsistent fashion across clients:

- The extension is divided into a “background” and “UI” process. Controllers and services are held in the background, so the UI must use them by exchanging messages through a bespoke RPC layer and object in `MetamaskController` as well as a series of wrappers (e.g. `submitRequestToBackground`).
- The mobile runs within one process, so its architecture is simpler than the extension. However, sometimes it accesses controllers and services through the root messenger, and sometimes it accesses them directly.

Although seemingly innocuous, these inconsistencies act as barriers to developing and testing features. Engineers who work in both clients must constantly remember them, and they must make constant decisions about which path is “correct”. Having two distinct, incompatible solutions also bloats clients with custom code, and it places a limit on the amount of infrastructure that can be shared.

### What’s changing

To solve this problem, the Core Platform team has developed a strategy for using messengers in UI components. **We are asking all teams to start using this strategy going forward when creating or updating features.**

Here’s how this strategy works:

1. We assume that each route in the client (e.g. `/perps`, `/send`) already serves as a logical grouping of related components, hooks, and other UI files. We also assume that a message bus for the UI exists (which is separate from the “core” message bus).
2. You create a messenger for a route, using the UI message bus to declare _only_ the capabilities that the route’s UI files need. (For instance, if you’re adding a button to a modal and you only need `NetworkController:setActiveNetwork`, then you would declare this action on the route where this button lives .)
3. Within a UI file, instead of using `useDispatch` to call a Redux action (or directly accessing the root messenger), you use `useMessenger` to access the route’s messenger and call an action or subscribe to an event directly.
4. That’s it!

### Benefits of using messengers in the UI

This strategy has the following advantages:

- It decreases the amount of differences both _within_ clients and _across_ clients:
  - It establishes a _singular, consistent_ pattern for using messengers in UI files, thereby **reducing cognitive overhead** for teams when developing and testing features.
  - It makes the architecture more homogenous. If messengers are used to “do things” on the UI side, and messengers are also used to “do things” in the core layer, there are fewer differences within the stack itself that have to be understood, which **makes the client codebases easier to maintain**.
- It surfaces reusable logic and behavior used at a feature level via an easily browseable API:
  - If an engineer is developing a new feature and wants to understand the capabilities that are already present within the architecture, using messengers makes it possible to generate and publish an up-to-date directory for reference purposes, **helping engineers feel less lost** and — more importantly — **helping them understand which team to contact if they need help.**
  - This browseable API can be split between the “core layer” and “UI layer”, making the distinction between UI functionality vs. non-UI functionality more obvious, **helping client platform teams understand and maintain the architecture more easily.**
  - _Note: We are working on producing a docsite which lists all actions and events in this API, so the “browseable” part isn’t quite done yet, but will be soon._
- It establishes clearer boundaries around UI files:
  - Messengers provide engineers with contact points to easily **trace the activity of the client** and **understand performance problems**. If all actions and events flow through a message bus, there is a singular place where tracing can be selectively added. Furthermore, tracing can be added for a single action/event, for all actions/events belonging to a feature, or for all actions/events belonging to a team.
  - Messengers also **improve the security posture of MetaMask**, because it gives client and product teams a way to ensure that no one part of the application has access to more capabilities than it truly needs. (For example: a network selector dropdown should not be able to make a request to create a money account order, or fetch gas fees, etc. The ability to declare restrictions like this is baked into messengers.)

## How to use messengers in the UI

### 1. Define & assign messenger capabilities to routes

If you want to access a controller or service from a React component or hook, you must have a messenger object, and it must be configured with the appropriate capabilities.

It’s important to understand that a messenger used in a UI file is defined not at the component level, but at the _route_ level. Since a component or hook may be used in multiple places, that means you must configure each route where that component or hook is used.

Before setting up your component/hook to use a messenger, there are three questions you need to answer:

1. What are all of the routes where my component/hook is used? (A “route” in this case is a page or screen that maps to a navigatable ID, e.g. `/send` or `/perps/home`. In Extension this is a URL path, in Mobile this is just a string.)
2. Where are these routes defined? (In Extension, look at [routes.component.tsx](https://github.com/MetaMask/metamask-extension/blob/main/ui/pages/routes/routes.component.tsx) or look for instances of `<Routes>` or `<Route>` throughout the UI code; in mobile, look for [MainNavigator.js](https://github.com/MetaMask/metamask-mobile/blob/6d17478eb773eaaaa6f203ddea6595614fc19b3b/app/components/Nav/Main/MainNavigator.js) or instances of `<Stack.Screen>` or `<Stack.Modal>` throughout the UI code.)
3. Where are the _entrypoints_ for these routes defined? (An “entrypoint” is the component that is rendered when the route is navigated to, e.g. `Home` or `PerpsHomePage`.)

Once you’ve answered these questions, you can proceed to one of two paths:

#### Extension

To define capabilities for a route:

1. Find the directory that holds the route entrypoint, then add a file called `messenger.ts`. (**Example:** `/` maps to `Home` , and `Home` is kept in `ui/pages/home`, so you’d add a file called `ui/pages/home/messenger.ts`.)

> [!WARNING]
>
> Do not use RouteMessengerProvider to wrap a component just to be able to give it access to a route messenger, unless it is being done while also defining sub-routes or unless you have a good reason.
>
> If you are attempting to use a messenger in a component or hook that is used across multiple routes, you will need to follow these steps **for each route in which that component/hook is used**.

2. Fill in the file with something like this:

   ```tsx
   import { defineAllowedRouteCapabilities } from '../../../helpers/route-messenger-helpers';
   import type { RouteMessengerFromCapabilities } from '../../../messengers/route-messenger';

   export const ALLOWED_CAPABILITIES = defineAllowedRouteCapabilities({
     actions: [
       /* actions go here */
     ],
     events: [
       /* events go here */
     ],
   });

   export type RouteMessengerInstance = RouteMessengerFromCapabilities<
     typeof ALLOWED_CAPABILITIES
   >;
   ```

   Fill the `actions` and/or `events` arrays with the actions or events that you want to access in your component. (**Example:** Say you want to call `NetworkController.setActiveNetwork`; you would add `"NetworkController:setActiveNetwork"` to the set of `actions`.)

To assign the capabilities to a route:

1. Import `ALLOWED_CAPABILITIES`, renaming it to fit the route. For example:

   ```tsx
   import { ALLOWED_CAPABILITIES as HOME_ROUTE_ALLOWED_CAPABILITIES } from '../../pages/home/messenger';
   ```

2. Wrap the route object using `createRouteWithMessenger`, passing the capabilities. For instance:

   ```tsx
   createRouteWithMessenger({
     path: HOME_ROUTE,
     capabilities: HOME_ROUTE_ALLOWED_CAPABILITIES,
     element: <Home />,
   });
   ```

[**Here’s a PR where we’ve followed these steps.**](https://github.com/MetaMask/metamask-extension/pull/42115/changes)

#### Mobile

To define capabilities for a route:

1. Find the directory that holds the route entrypoint*,* then add a file called `messenger.ts`. (**Example:** `/` maps to `Wallet` , and `Wallet` is kept in `app/components/Views/Wallet`, so you’d add a file called `app/components/Views/Wallet/messenger.ts`.)

> [!WARNING]
>
> Do not use RouteMessengerProvider to wrap a component just to be able to give it access to a route messenger, unless it is being done while also defining sub-routes or unless you have a good reason.
>
> If you are attempting to use a messenger in a component or hook that is used across multiple routes, you will need to follow these steps **for each route in which that component/hook is used**.

2. Fill in the file with something like this:

   ```tsx
   import { defineAllowedRouteCapabilities } from '../../../../messengers/helpers/route-messenger-helpers';
   import type { RouteMessengerFromCapabilities } from '../../../../messengers/route-messenger';

   export const ALLOWED_CAPABILITIES = defineAllowedRouteCapabilities({
     actions: [
       /* actions go here */
     ],
     events: [
       /* events go here */
     ],
   });

   export type RouteMessengerInstance = RouteMessengerFromCapabilities<
     typeof ALLOWED_CAPABILITIES
   >;
   ```

   Fill the `actions` and/or `events` arrays with the actions or events that you want to access in your component. (**Example:** Say you want to call `NetworkController.setActiveNetwork`; you would add `"NetworkController:setActiveNetwork"` to the set of `actions`.)

To assign the capabilities to a route:

1. Import `ALLOWED_CAPABILITIES`, renaming it to fit the route. For example:

   ```tsx
   import { ALLOWED_CAPABILITIES as HOME_ROUTE_ALLOWED_CAPABILITIES } from '../../Views/Wallet/messenger';
   ```

2. Wrap the route entrypoint using `withMessenger`, passing the capabilities, and save it to a variable. For instance:

   ```tsx
   const HomeWithMessenger = withMessenger(Home, {
     capabilities: HOME_ROUTE_ALLOWED_CAPABILITIES,
   });
   ```

3. In your route, use this component instead of the original one. For example:

   ```tsx
   <NativeStack.Screen
     name={Routes.WALLET.HOME}
     component={HomeWithMessenger}
   />
   ```

[**Here’s a PR where we’ve followed these steps.**](https://github.com/MetaMask/metamask-mobile/pull/29653/changes)

### 2. Access actions and events in UI files

Now you can use the messenger to call actions and subscribe to events within UI files.

How you do this depends on whether your React component or hook is shared between other routes, or whether it is only accessed within its route.

#### Non-shared UI files

Let’s start with the easier case.

To call a messenger action or subscribe to a messenger within a non-shared UI file, follow these steps:

1. Import `useMessenger`. This is a React hook that is usable anywhere.
2. Import `RouteMessengerInstance`. This type is defined in `messenger.ts` — the one you added above — within the directory that represents the route.
3. In your component or hook, call `useMessenger` and pass `RouteMessengerInstance` as a type parameter. This gives you a messenger that only has the capabilities that you added earlier (i.e. the TypeScript type will reflect those capabilities).
4. To call an action, say `messenger.call('<action name>')`. To subscribe to an event, say `messenger.subscribe('<event name>')`.
5. That’s it.

For instance:

```tsx
import { useMessenger } from '../../../../hooks/useMessenger';
import type { RouteMessengerInstance } from '../messenger';

export function MyComponent() {
  const messenger = useMessenger<RouteMessengerInstance>();

  // ... later ...

  messenger.call('SomeController:someAction');
}
```

**See `useUpdate.ts` in [this pull request](https://github.com/MetaMask/metamask-extension/pull/42115/changes).**

#### Shared UI files

Accessing messengers in shared UI files is similar as for non-shared files, but there are two differences:

1. You don’t need to import `RouteMessengerInstance` or pass it to `useMessenger`.
2. The TypeScript type of the resulting messenger object won’t just contain the capabilities you defined earlier; it will contain every single possible capability (an overly broad type).
   1. What this means is that if you attempt to call an action, you may get a runtime error (because your route doesn’t know about it).
   2. To fix this, make sure that every route in which your shared UI file is used declares the capabilities you want to access. (Essentially, go back to the “Declare capabilities for routes” section.)
   3. The best way to make sure you don’t have runtime errors is by writing tests.

For instance:

```tsx
import { useMessenger } from '../../../../hooks/useMessenger';

export function MyComponent() {
  const messenger = useMessenger();

  // ... later ...

  messenger.call('SomeController:someAction');
}
```

## Learn more

- ADR: https://github.com/MetaMask/decisions/blob/main/decisions/core/0020-integrate-messengers-into-ui.md

## I need help!

If you have any questions, comments, suggestions, concerns or other feedback, feel free to reach out to the Core Platform team.
