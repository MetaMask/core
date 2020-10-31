type Anonymizer<T> = (value: T) => T;

export type Schema<T> = {
  [P in keyof T]: {
    persist: boolean;
    anonymous: boolean | Anonymizer<T[P]>;
  };
};

// This function acts as a type guard. Using a `typeof` conditional didn't seem to work.
function isAnonymizingFunction<T>(x: boolean | Anonymizer<T>): x is Anonymizer<T> {
  return typeof x === 'function';
}

export function getPersistedState<S extends Record<string, any>>(state: S, schema: Schema<S>) {
  return Object.keys(state).reduce((persistedState, _key) => {
    const key: keyof S = _key; // https://stackoverflow.com/questions/63893394/string-cannot-be-used-to-index-type-t
    if (schema[key].persist) {
      persistedState[key] = state[key];
    }
    return persistedState;
  }, {} as Partial<S>);
}

export function getAnonymizedState<S extends Record<string, any>>(state: S, schema: Schema<S>) {
  return Object.keys(state).reduce((anonymizedState, _key) => {
    const key: keyof S = _key; // https://stackoverflow.com/questions/63893394/string-cannot-be-used-to-index-type-t
    const schemaValue = schema[key].anonymous;
    if (isAnonymizingFunction(schemaValue)) {
      anonymizedState[key] = schemaValue(state[key]);
    } else if (schemaValue) {
      anonymizedState[key] = state[key];
    }
    return anonymizedState;
  }, {} as Partial<S>);
}
