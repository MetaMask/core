# Introduction to Data Services

## What is a data service?

A data service provides a singular abstraction around an external API.

Data services are classes that inherit from `BaseDataService`. Each method represents a unique type of interaction with the API (such as a HTTP API endpoint request or a WebSocket API lifecycle operation).

Like controllers, data services ship with messengers which allows them to be used anywhere in the stack, even outside controllers.

## What features do data services support?

- **Request caching**: Requests are identified by a cache key; when another request using the same key is made, the cached response is returned without hitting the API. You can customize the cache expiration time, and you can manually invalidate the existing cache for a request.
- **Request deduplication**: If a request identified by a key is in flight, another request using the same key will reuse the result of the first request without hitting the API again.
- **Paginated requests & "infinite" queries:** APIs that support pagination are easy to work with, not only to navigate between pages but also to request all pages.
- **Graceful error handling:** Requests that end up in a failure state — server errors, timeout errors, connection errors, or other ephemeral errors — are automatically retried. They are even paused temporarily if the API returns too many errors in a row to prevent spamming in case of an outage.
- **Integration across full stack, including client UI:** In clients, data services are designed to be used not only at the platform level, but within UI components and hooks as well.

## When to use a data service?

Use a data service any time you want to fetch data from an external source. If one does not exist for your API, make one (either in an existing package or a new package).
