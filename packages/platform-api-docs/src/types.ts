/**
 * A documented parameter for an action handler or event payload — name from
 * the JSDoc `@param` tag, description from the tag's comment body.
 */
export type DocumentedParameter = {
  name: string;
  description: string;
};

/**
 * Information about a messenger action or event extracted from its type
 * in a source file.
 */
export type MessengerCapabilityPacket = {
  /** The capability type's TypeScript identifier, e.g. `NetworkControllerGetStateAction`. */
  typeName: string;
  /** The capability's messenger key, e.g. `NetworkController:getState`. */
  typeString: string;
  /** Whether the capability is an action (request/response) or an event (broadcast). */
  kind: 'action' | 'event';
  /** Cleaned description body — content above the first JSDoc tag. */
  jsDoc: string;
  /**
   * Documented parameters — populated from `@param` tags, in source order.
   * For actions these describe the handler's arguments; for events they
   * describe the payload tuple's positional elements.
   */
  params: DocumentedParameter[];
  /** Documented return value — populated from a `@returns` tag, if any. */
  returns: string;
  /** Raw type text of the handler (action) or payload (event). */
  handlerOrPayload: string;
  /** Path to the file the capability was declared in, relative to the project root. */
  sourceFile: string;
  /** 1-based line number of the capability declaration. */
  line: number;
  /** Whether the capability is marked `@deprecated`. */
  deprecated: boolean;
};

/**
 * A namespace's actions and events, after dedup and sorting.
 */
export type NamespaceGroup = {
  namespace: string;
  actions: MessengerCapabilityPacket[];
  events: MessengerCapabilityPacket[];
};

/**
 * Info about a class method, used to resolve `ClassName['methodName']`
 * handlers — captures both the textual signature and the documented
 * parameters / return so the capability inherits the method's JSDoc when
 * the type alias itself has none.
 */
export type MethodInfo = {
  /** Cleaned description body — content above the first JSDoc tag. */
  jsDoc: string;
  /** Documented parameters from the method's `@param` tags. */
  params: DocumentedParameter[];
  /** Documented return value from the method's `@returns` tag, if any. */
  returns: string;
  /** Method signature in TypeScript syntax, e.g. `(fields: AddNetworkFields) => NetworkConfiguration`. */
  signature: string;
};
