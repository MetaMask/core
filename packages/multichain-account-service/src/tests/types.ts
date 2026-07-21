/**
 * A utility type that makes all properties of a type optional, recursively.
 */
export type DeepPartial<Type> = Type extends string
  ? Type
  : {
      [Property in keyof Type]?: Type[Property] extends (infer Value)[]
        ? DeepPartial<Value>[]
        : Type[Property] extends readonly (infer Value)[]
          ? readonly DeepPartial<Value>[]
          : Type[Property] extends object
            ? DeepPartial<Type[Property]>
            : Type[Property];
    };
