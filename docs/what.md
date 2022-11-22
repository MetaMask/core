# All about controllers

If you've come here from the [README](../README.md), you already know that this repo holds controllers. But what even _is_ a controller?

The short answer is that it's our solution to managing and disseminating state changes within our products.

Every application needs to manage state. Some state is temporary. Perhaps the
user is on a screen which keeps track of whether a button is clickable/tappable depending on whether a request is taking place; but as soon as the user leaves that screen, that information is discarded. But some state is more permanent. Perhaps a screen needs to reuse information that was gathered on a previous screen, in which case the state is cached in memory; or perhaps the entire application needs to load all of the user's data when it starts, in which case the state is persisted to disk. Either way, we need a place to store that state, and that's where controllers come into play.

Currently, there are two styles of creating controllers which we've dubbed [BaseController v1](../packages/base-controller/src/BaseController.ts) and [BaseController v2](../packages/base-controller/src/BaseControllerV2.ts). Both versions offer the same set of basic functionality:

- The developer can preload the state (say, from a persistent location) when initializing.
- The application can update the state at any time.
- In another location, the application can listen for and respond to state changes (or stop listening altogether).

v2 includes a number of improvements over v1, resulting in a more simplified and solidified API. One aspect worth noting with v2, however, is that not only can controllers communicate with the application, but controllers can also communicate with each other — and this is done in a way that doesn't require the controller package that's doing the receiving to depend on the controller that's doing the sending. This capability is provided by [ControllerMessenger](../packages/base-controller/src/ControllerMessenger.ts).
