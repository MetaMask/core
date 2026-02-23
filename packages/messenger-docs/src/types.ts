export type MessengerItemDoc = {
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
  actions: MessengerItemDoc[];
  events: MessengerItemDoc[];
};

/**
 * Info about a class method, used to resolve `ClassName['methodName']` handlers.
 */
export type MethodInfo = {
  jsDoc: string;
  signature: string; // e.g. "(fields: AddNetworkFields) => NetworkConfiguration"
};
