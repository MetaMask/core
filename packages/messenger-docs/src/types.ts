/**
 * One messenger capability — an action or event registered with the platform
 * — distilled from its TypeScript definition.
 */
export type ExtractedMessengerCapabilityType = {
  typeName: string; // e.g. "NetworkControllerGetStateAction"
  typeString: string; // e.g. "NetworkController:getState"
  kind: 'action' | 'event';
  jsDoc: string; // Cleaned JSDoc body text (empty if none)
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
 * Info about a class method, used to resolve `ClassName['methodName']` handlers.
 */
export type MethodInfo = {
  jsDoc: string;
  signature: string; // e.g. "(fields: AddNetworkFields) => NetworkConfiguration"
};
