
import { IEthereumRpcError } from 'eth-rpc-errors/@types'

/** A String specifying the version of the JSON-RPC protocol. MUST be exactly "2.0". */
export type JsonRpcVersion = "2.0";

/** Method names that begin with the word rpc followed by a period character
 * (U+002E or ASCII 46) are reserved for rpc-internal methods and extensions
 *  and MUST NOT be used for anything else. */
export type JsonRpcReservedMethod = string;

/** An identifier established by the Client that MUST contain a String, Number,
 *  or NULL value if included. If it is not included it is assumed to be a
 *  notification. The value SHOULD normally not be Null and Numbers SHOULD
 *  NOT contain fractional parts [2] */
export type JsonRpcId = number | string | void;

interface JsonRpcError<T> extends IEthereumRpcError<T> {}

interface JsonRpcRequest<T> {
  jsonrpc: JsonRpcVersion;
  method: string;
  id: JsonRpcId;
  params?: T;
}

interface JsonRpcNotification<T> extends JsonRpcResponse<T> {
  jsonrpc: JsonRpcVersion;
  params?: T;
}

interface JsonRpcResponse<T> {
  result?: any;
  error?: JsonRpcError<any>;
  jsonrpc: JsonRpcVersion;
  id: JsonRpcId;
}

interface JsonRpcSuccess<T> extends JsonRpcResponse<T> {
    result: any;
}

interface JsonRpcFailure<T> extends JsonRpcResponse<T> {
    error: JsonRpcError<T>;
}

type JsonRpcEngineEndCallback = (error?: JsonRpcError<any>) => void;
type JsonRpcEngineNextCallback = (returnFlightCallback?: (done: () => void) => void) => void;

interface JsonRpcMiddleware {
  (
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ) : void;
}

interface JsonRpcEngine {
  push: (middleware: JsonRpcMiddleware) => void;
  handle: (req: JsonRpcRequest<any>, callback: (error: JsonRpcError<any>, res: JsonRpcResponse<any>) => void) => void;
}

