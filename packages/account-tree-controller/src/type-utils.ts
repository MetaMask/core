/**
 * Updatable field with timestamp tracking for persistence and synchronization.
 */
export type UpdatableField<T> = {
  value: T;
  lastUpdatedAt: number;
};

/**
 * Type utility to extract value from UpdatableField or return field as-is.
 */
export type ExtractFieldValue<Field> =
  Field extends UpdatableField<unknown> ? Field['value'] : Field;

/**
 * Type utility to extract plain values from an object with UpdatableField properties.
 */
export type ExtractFieldValues<ObjectValue extends Record<string, unknown>> = {
  [Key in keyof ObjectValue]: ExtractFieldValue<ObjectValue[Key]>;
};
