// Trace types later will be imported from '@metamask/controller-utils'
/** A context in which to execute a trace, in order to generate nested timings. */
export type TraceContext = unknown;

/** Request to trace an operation. */
export type TraceRequest = {
  /** Additional data to include in the trace. */
  data?: Record<string, number | string | boolean>;

  /** Name of the operation. */
  name: string;

  /**
   * Unique identifier for the trace.
   * Required if starting a trace and not providing a callback.
   */
  id?: string;

  /** Trace context in which to execute the operation. */
  parentContext?: TraceContext;

  /** Additional tags to include in the trace to filter results. */
  tags?: Record<string, number | string | boolean>;
};

/** Callback that traces the performance of an operation. */
export type TraceCallback = <ReturnType>(
  /** Request to trace the performance of an operation. */
  request: TraceRequest,

  /**
   * Callback to trace.
   * Thrown errors will not be caught, but the trace will still be recorded.
   * @param context - The context in which the operation is running.
   */
  fn?: (context?: TraceContext) => ReturnType,
) => Promise<ReturnType>;
