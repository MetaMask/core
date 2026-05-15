/**
 * A documented parameter for an action handler or event payload — name from
 * the JSDoc `@param` tag, description from the tag's comment body.
 */
export type ParamDoc = {
  name: string;
  description: string;
};

/**
 * One messenger capability — an action or event registered with the platform
 * — distilled from its TypeScript definition.
 */
export type ExtractedMessengerCapabilityType = {
  typeName: string; // e.g. "NetworkControllerGetStateAction"
  typeString: string; // e.g. "NetworkController:getState"
  kind: 'action' | 'event';
  jsDoc: string; // Cleaned description body — content above the first tag.
  /**
   * Documented parameters — populated from `@param` tags, in source order.
   * For actions these describe the handler's arguments; for events they
   * describe the payload tuple's positional elements.
   */
  params: ParamDoc[];
  /** Documented return value — populated from a `@returns` tag, if any. */
  returns: string;
  handlerOrPayload: string; // Raw type text of handler / payload
  sourceFile: string; // Relative path from repo root
  line: number;
  deprecated: boolean;
};

export type NamespaceGroup = {
  namespace: string;
  actions: ExtractedMessengerCapabilityType[];
  events: ExtractedMessengerCapabilityType[];
};

/**
 * Info about a class method, used to resolve `ClassName['methodName']`
 * handlers — captures both the textual signature and the documented
 * parameters / return so the capability inherits the method's JSDoc when
 * the type alias itself has none.
 */
export type MethodInfo = {
  jsDoc: string;
  params: ParamDoc[];
  returns: string;
  signature: string; // e.g. "(fields: AddNetworkFields) => NetworkConfiguration"
};
