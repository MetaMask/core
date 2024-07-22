"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/sdk/errors.ts
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









exports.NonceRetrievalError = NonceRetrievalError; exports.SignInError = SignInError; exports.PairError = PairError; exports.UserStorageError = UserStorageError; exports.ValidationError = ValidationError; exports.UnsupportedAuthTypeError = UnsupportedAuthTypeError; exports.NotFoundError = NotFoundError;
//# sourceMappingURL=chunk-MBTBE4P5.js.map