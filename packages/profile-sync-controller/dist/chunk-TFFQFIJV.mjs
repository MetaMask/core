// src/sdk/errors.ts
var NonceRetrievalError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "NonceRetrievalError";
  }
};
var SignInError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SignInError";
  }
};
var PairError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PairError";
  }
};
var UserStorageError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UserStorageError";
  }
};
var ValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
};
var UnsupportedAuthTypeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedAuthTypeError";
  }
};
var NotFoundError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
};

export {
  NonceRetrievalError,
  SignInError,
  PairError,
  UserStorageError,
  ValidationError,
  UnsupportedAuthTypeError,
  NotFoundError
};
//# sourceMappingURL=chunk-TFFQFIJV.mjs.map