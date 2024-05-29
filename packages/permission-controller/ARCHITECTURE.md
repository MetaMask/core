# Architecture

The `PermissionController` is the heart of an object capability-inspired permission system.
It is the successor of the original MetaMask permission system, [`rpc-cap`](https://github.com/MetaMask/rpc-cap).

## Conceptual overview

The permission system itself belongs to a **host**, and it mediates the access to resources – called **targets** – of distinct **subjects**.
A target can belong to the host itself, or another subject.

When a subject attempts to access a target, we say that they **invoke** it.
The system ensures that subjects can only invoke a target if they have the **permission** to do so.
Permissions are associated with a subject and target, and they are part of the state of the permission system.

Permissions can have **caveats**, which are host-defined attenuations of the authority a permission grants over a particular target.

## Implementation overview

At any given moment, the `PermissionController` state tree describes the complete state of the permissions of all subjects known to the host (i.e., the MetaMask instance).
The `PermissionController` also provides methods for adding, updating, and removing permissions, and enforcing the rules described by its state tree.
Permission system concepts correspond to components of the MetaMask stack as follows:

| Concept           | Implementation                                                  |
| :---------------- | :-------------------------------------------------------------- |
| Host              | The MetaMask application                                        |
| Subjects          | Websites, Snaps, or other extensions                            |
| Targets           | JSON-RPC methods, endowments                                    |
| Invocations       | JSON-RPC requests, endowment retrieval                          |
| Permissions       | Permission objects                                              |
| Caveats           | Caveat objects                                                  |
| Permission system | The `PermissionController` and its `json-rpc-engine` middleware |

### Permission / target Types

In practice, targets can be different things, necessitating distinct implementations in order to enforce the logic of the permission system.
This being the case, the `PermissionController` defines different **permission / target types**, intended for different kinds of permission targets.
At present, there are two permission / target types.

#### JSON-RPC methods

Restricting access to JSON-RPC methods was the motivating and only supported use case for the original permission system, and its successor also implements this feature.
The `PermissionController` provides patterns for creating restricted JSON-RPC method implementations and caveats, and a `json-rpc-engine` middleware function factory.
To permission a JSON-RPC server, every JSON-RPC method must be enumerated and designated as either "restricted" or "unrestricted", and a permission middleware function must be added to the `json-rpc-engine` middleware stack.
Unrestricted methods can always be called by anyone.
Restricted methods require the requisite permission in order to be called.

Once the permission middleware is injected into the middleware stack, every JSON-RPC request will be handled in one of the following ways:

- If the requested method is neither restricted nor unrestricted, the request will be rejected with a `methodNotFound` error.
- If the requested method is unrestricted, it will pass through the middleware unmodified.
- If the requested method is restricted, the middleware will attempt to get the permission corresponding to the subject and target, and:
  - If the request is authorized, call the corresponding method with the request parameters.
  - If the request is not authorized, reject the request with an `unauthorized` error.

#### Endowments

We inherit the name "endowment" from the endowments that you may provide to a [Secure EcmaScript (SES) `Compartment`](https://github.com/endojs/endo/tree/26d991afb01cf824827db0c958c50970e038112f/packages/ses#compartment) when it is constructed.
SES endowments are simply names that appear in the compartment's global scope.
In the context of the `PermissionController`, endowments are simply "things" that subjects should not be able to access by default.
They _could_ be the names of endowments that are to be made available to a particular SES `Compartment`, but they could also be any JavaScript value, and it is the host's responsibility to make sense of them.

### Caveats

Caveats are arbitrary restrictions on restricted method requests.
Every permission has a `caveats` field, which is either an array of caveats or `null`.
Every caveat has a string `type`, and every type has an associated function that is used to apply the caveat to a restricted method request.
When the `PermissionController` is constructed, the consumer specifies the available caveat types and their implementations.

#### Caveat structure

The complete authority represented by a permissions is represented by that permission and its caveat.
Accurately and legibly representing this information to the user is one of the most important responsibilities of MetaMask itself.
Therefore, as with any data structure we will use to represent information to the user, the simpler a caveat value type is, the better.

For the same reason, it is also critical for permission authors to carefully consider the _semantics_ of caveat values.
In particular, the existence of an authority **must** be represented by the **presence** of a value.

For example, let's say there is a caveat `foo` that restricts the parameters that a method can be called with.
In theory, such a caveat could be implemented such that a value of `[1, 2]` means that the
method will only accept `1` and `2` as parameters, while an empty array `[]` means that
_all_ parameters are permitted.
**This is strictly forbidden.**
Instead, such a hypothetical caveat could use `['*']` to represent that all parameters are permitted.

We, the maintainers of the permission controller, impose this requirement for two reasons:

1. We find it more intuitive to reason about caveats structured in this manner.
2. It leaves the door open for establishing a caveat DSL, and subsequently standardized caveat value merger functions in support of [incremental permission requests](#requestpermissionsincremental).

#### Caveat merging

<!-- TODO: Remove the below "if no merger exists" qualifier when mergers are required. -->

Consumers may supply a caveat value merger function when specifying a caveat.
This is required to support [incremental permission requests](#requestpermissionsincremental).
Caveat values must be merged in the fashion of a right-biased union.
This operation is _like_ a union in set theory, except the right-hand operand overwrites
the left-hand operand in case of collisions.

Formally, let:

- `A` be the value of the existing / left-hand caveat
- `B` be the value of the requested / right-hand caveat
- `C` be the value of the resulting caveat
- `⊕` be the right-biased union operator

Then the following must be true:

- `C = A ⊕ B`
- `C ⊇ B`
- `A` and `C` may have all, some, or no values in common.
- If `A = ∅`, then `C = B`

In addition to merging the values, the caveat value merger implementation must supply
the difference between `C` and `A`, expressed in the relevant caveat value type.
This is necessary so that other parts of the application, especially the UI, can
understand how authority has changed.

Caveat value mergers should assume that the left- and right-hand values are always defined.
In practice, when the permission controller attempts to merge two permissions, it's possible
that the left-hand side does not exist.
In this case, the value of the right-hand side will also be the value of the diff, `Δ`.
Therefore, caveat value mergers **must** express their diffs in the relevant caveat value type.

If `Δ` the difference between `C` and `A`, then:

- `Δ = C - A`
  - `Δ ∩ A = ∅`
  - `Δ ⊆ C`
  - `A ⊕ Δ = C`
- `Δ ⊆ B`
- If `A = ∅`, then `Δ = C = B`

To exemplify the above in JavaScript:

```js
// A is empty.
A = undefined;
B = { foo: 'bar' };
C = { foo: 'bar' };
Delta = { foo: 'bar' };

// A and B are the same.
A = { foo: 'bar' };
B = { foo: 'bar' };
C = { foo: 'bar' };
Delta = undefined;

// A and B have no values in common.
A = { foo: 'bar' };
B = { life: 42 };
C = { foo: 'bar', life: 42 };
Delta = { life: 42 };

// B overwrites A completely.
A = { foo: 'bar' };
B = { foo: 'baz' };
C = { foo: 'baz' };
Delta = { foo: 'baz' };

// B partially overwrites A.
A = { foo: 'bar', life: 42 };
B = { foo: 'baz' };
C = { foo: 'baz', life: 42 };
Delta = { foo: 'baz' };
```

### Requesting permissions

The `PermissionController` provides two methods for requesting permissions:

#### `requestPermissions()`

This method accepts an object specifying the requested permissions and any caveats for a particular subject.
The method optionally allows existing permissions not named in the request to be preserved.
Any existing permissions named in the request will be overwritten with the value approved by the user.

#### `requestPermissionsIncremental()`

This method also accepts an object of requested permissions, but will preserve the subject's existing authority to the greatest extent possible.
In practice, this means that it will merge the requested permissions and caveats with the existing permissions and subjects.
This merger is performed by way of a right-biased union, where the requested permissions are the right-hand side.

If a caveat of the same type is encountered on both the left- and right-hand sides, the
new caveat value is determined by calling that caveat type's merger function.
This function must also perform a right-biased union, see [caveat merging](#caveat-merging) for more details.
If no merger exists for a caveat that must be merged, the request will fail.

<!-- TODO: Remove the above "if no merger exists" qualifier when mergers are required. -->

## Examples

In addition to the below examples, the [`PermissionController` unit tests](./PermissionController.test.ts) show how to set up the controller.

### Construction

```typescript
// To construct a permission controller, we first need to define the caveat
// types and restricted methods.

const caveatSpecifications = {
  filterArrayResponse: {
    type: 'filterArrayResponse',
    // If a permission has any caveats, its corresponding restricted method
    // implementation is decorated / wrapped with the implementations of its
    // caveats, using the caveat's decorator function.
    decorator:
      (
        // Restricted methods and other caveats can be async, so we have to
        // assume that the method is async.
        method: AsyncRestrictedMethod<RestrictedMethodParameters, Json>,
        caveat: FilterArrayCaveat,
      ) =>
      async (args: RestrictedMethodOptions<RestrictedMethodParameters>) => {
        const result = await method(args);
        if (!Array.isArray(result)) {
          throw Error('not an array');
        }

        return result.filter((resultValue) =>
          caveat.value.includes(resultValue),
        );
      },
    // This function is called if two caveats of this type have to be merged
    // due to an incremental permissions request. The values must be merged
    // in the fashion of a right-biased union.
    merger: (leftValue, rightValue) =>
      Array.from(new Set([...leftValue, ...rightValue])),
  },
};

// The property names of this object must be target names.
const permissionSpecifications = {
  // This is a plain restricted method.
  wallet_getSecretArray: {
    // Every permission must have this field.
    permissionType: PermissionType.RestrictedMethod,
    // i.e. the restricted method name
    targetName: 'wallet_getSecretArray',
    allowedCaveats: ['filterArrayResponse'],
    // Every restricted method must specify its implementation in its
    // specification.
    methodImplementation: (
      _args: RestrictedMethodOptions<RestrictedMethodParameters>,
    ) => {
      return ['secret1', 'secret2', 'secret3'];
    },
  },

  // This is an endowment.
  secretEndowment: {
    permissionType: PermissionType.Endowment,
    // Naming conventions for endowments are yet to be established.
    targetName: 'endowment:globals',
    // This function will be called to retrieve the subject's endowment(s).
    // Here we imagine that these are the names of globals that will be made
    // available to a SES Compartment.
    endowmentGetter: (_options: EndowmentGetterParams) => [
      'fetch',
      'Math',
      'setTimeout',
    ],
  },
};

const permissionController = new PermissionController({
  caveatSpecifications,
  messenger: controllerMessenger, // assume this was given
  permissionSpecifications,
  unrestrictedMethods: ['wallet_unrestrictedMethod'],
});
```

### Adding the permission middleware

```typescript
// This should take place where a middleware stack is created for a particular
// subject.

// The subject could be a port, stream, socket, etc.
const origin = getOrigin(subject);

const engine = new JsonRpcEngine();
engine.push(/* your various middleware*/);
engine.push(permissionController.createPermissionMiddleware({ origin }));
// Your middleware stack is now permissioned
engine.push(/* your other various middleware*/);
```

### Calling a restricted method internally

```typescript
// Sometimes, we need to call a restricted method internally, as a particular subject.
permissionController.executeRestrictedMethod(origin, 'wallet_getSecretArray');

// If the restricted method has any parameters, they are given as the third
// argument to executeRestrictedMethod().
permissionController.executeRestrictedMethod(origin, 'wallet_getSecret', {
  secretType: 'array',
});
```

### Getting endowments

```typescript
// Getting endowments internally is the only option, since the host has to apply
// them in some way external to the permission system.
const endowments = await permissionController.getEndowments(
  origin,
  'endowment:globals',
);

// Now the endowments can be applied, whatever that means.
applyEndowments(origin, endowments);
```

### Requesting and getting permissions

```typescript
// This requests the `wallet_getSecretArray` permission.
const addedPermissions = await ethereum.request({
  method: 'wallet_requestPermissions',
  params: [{
    wallet_getSecretArray: {},
  }]
})

// This gets the subject's existing permissions.
const existingPermissions = await ethereum.request({
  method: 'wallet_getPermissions',
)
console.log(existingPermissions)
// [
//   {
//     "id": "DZ_a31y3E8FKQfBqLwIcN",
//     "parentCapability": "wallet_getSecretArray",
//     "invoker": "https://subject.io",
//     "caveats": [/* ... */],
//     "date": 1713279475396
//   }
// ]
```

### Requesting permissions incrementally

```typescript
// Given an artifically truncated permission state of:
// {
//   'metamask.io': {
//     wallet_getSecretArray: {
//       caveats: [
//         { type: 'foo', value: ['a'] },
//       ],
//     },
//   },
// }

// We request:
await permissionController.requestPermissionsIncremental({
  wallet_getSecretArray: {
    caveats: [
      { type: 'foo', value: ['b'] },
      { type: 'bar', value: 42 },
    ],
  },
});

// Assuming that the caveat value merger implementation for 'foo' naively merges the
// values of the left- and right-hand sides, we end up with:
// {
//   'metamask.io': {
//     wallet_getSecretArray: {
//       caveats: [
//         { type: 'foo', value: ['a', 'b'] },
//         { type: 'bar', value: 42 },
//       ],
//     },
//   },
// }
```

### Restricted method caveat decorators

Here follows some more example caveat decorator implementations.

```typescript
// Validation / passthrough
export function onlyArrayParams(
  method: AsyncRestrictedMethod<RestrictedMethodParameters, Json>,
  _caveat: Caveat<'PassthroughCaveat', never>,
) {
  return async (args: RestrictedMethodOptions<RestrictedMethodParameters>) => {
    if (!Array.isArray(args.params)) {
      throw new EthereumJsonRpcError();
    }

    return method(args);
  };
}

// "Return handler" example
export function eth_accounts(
  method: AsyncRestrictedMethod<RestrictedMethodParameters, Json>,
  caveat: Caveat<'RestrictAccountCaveat', string[]>,
) {
  return async (args: RestrictedMethodOptions<RestrictedMethodParameters>) => {
    const accounts: string[] | Json = await method(args);
    if (!Array.isArray(args.params)) {
      throw new EthereumJsonRpcError();
    }

    return (
      accounts.filter((account: string) => caveat.value.includes(account)) ?? []
    );
  };
}
```
