type ReturnTypeOfMethod<T> = T extends (...args: any[]) => any ? ReturnType<T> : any;
type ReturnTypeOfMethodIfExists<T, S> = S extends keyof T ? ReturnTypeOfMethod<T[S]> : any;
type MethodParams<T> = T extends (...args: infer P) => any ? P[0] : T;
type MethodParamsIfExists<T, S> = S extends keyof T ? MethodParams<T[S]> : S;

interface PreferencesActions {
  what: (num: number) => number;
  get: () => void;
}

interface RequestType<N, P = any> {
  name: N;
  params?: P;
}

const options: PreferencesActions = {
  what: (num: number) => num + num,
  get: () => { },
};

export function call<N extends keyof PreferencesActions>(request: RequestType<N, MethodParamsIfExists<PreferencesActions, N>>): ReturnTypeOfMethodIfExists<PreferencesActions, N> {
  // we get callsite inference so these casts are okay, in this case.
  return options[request.name](request.params as any) as any;
}

const x = call({ name: 'what', params: 4 });
