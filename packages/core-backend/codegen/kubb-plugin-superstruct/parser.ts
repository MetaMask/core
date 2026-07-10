import type { Schema, SchemaKeywordMapper } from '@kubb/plugin-oas';
import { isKeyword, schemaKeywords } from '@kubb/plugin-oas';

/**
 * Options for {@link parse}.
 */
export type ParserOptions = {
  /**
   * Collects the names of the `@metamask/superstruct` helpers that were used
   * while parsing, so the generator can emit a matching import statement.
   */
  usedHelpers: Set<string>;
};

/**
 * The subset of Kubb schema keywords that produce a struct on their own.
 * Everything else (min/max/optional/nullable/describe/...) decorates one of
 * these.
 */
const BASE_KEYWORDS: string[] = [
  schemaKeywords.object,
  schemaKeywords.array,
  schemaKeywords.tuple,
  schemaKeywords.enum,
  schemaKeywords.union,
  schemaKeywords.and,
  schemaKeywords.const,
  schemaKeywords.ref,
  schemaKeywords.matches,
  schemaKeywords.string,
  schemaKeywords.number,
  schemaKeywords.integer,
  schemaKeywords.bigint,
  schemaKeywords.boolean,
  schemaKeywords.datetime,
  schemaKeywords.date,
  schemaKeywords.time,
  schemaKeywords.email,
  schemaKeywords.uuid,
  schemaKeywords.url,
  schemaKeywords.firstName,
  schemaKeywords.lastName,
  schemaKeywords.password,
  schemaKeywords.phone,
  schemaKeywords.blob,
  schemaKeywords.null,
  schemaKeywords.undefined,
  schemaKeywords.any,
  schemaKeywords.unknown,
  schemaKeywords.void,
];

/**
 * Quotes an object property name when it is not a valid JavaScript
 * identifier.
 *
 * @param name - The property name.
 * @returns The property name, quoted if necessary.
 */
function formatPropertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) ? name : JSON.stringify(name);
}

/**
 * Serializes a literal value (from `const`, `default` or `enum` keywords)
 * into source code.
 *
 * @param value - The literal value.
 * @param format - Optional format hint provided by Kubb.
 * @returns The serialized value.
 */
function formatLiteral(
  value: string | number | boolean | undefined,
  format?: 'string' | 'number' | 'boolean',
): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (format === 'number' || format === 'boolean') {
    return String(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Registers a `@metamask/superstruct` helper as used and returns a call
 * expression for it.
 *
 * @param options - The parser options carrying the used-helper collector.
 * @param helper - The helper name, e.g. `string`.
 * @param args - The source code of the arguments.
 * @returns The call expression, e.g. `string()`.
 */
function call(
  options: ParserOptions,
  helper: string,
  ...args: string[]
): string {
  options.usedHelpers.add(helper);
  return `${helper}(${args.join(', ')})`;
}

/**
 * Converts a single base schema to a superstruct expression.
 *
 * @param current - The schema keyword to convert.
 * @param siblings - The sibling keywords of `current` (constraints such as
 * min/max live here).
 * @param options - The parser options.
 * @returns The superstruct expression for the schema.
 */
function parseBase(
  current: Schema,
  siblings: Schema[],
  options: ParserOptions,
): string {
  if (isKeyword(current, schemaKeywords.object)) {
    return parseObject(current, options);
  }

  if (isKeyword(current, schemaKeywords.array)) {
    // Kubb represents the array item type as a list of sibling keywords.
    const item = parse(current.args.items, options);
    return call(
      options,
      'array',
      item === '' ? call(options, 'unknown') : item,
    );
  }

  if (isKeyword(current, schemaKeywords.tuple)) {
    const items = current.args.items.map((item) => parse([item], options));
    return call(options, 'tuple', `[${items.join(', ')}]`);
  }

  if (isKeyword(current, schemaKeywords.enum)) {
    const values = current.args.items.map((item) =>
      formatLiteral(item.value, item.format),
    );
    const formats = new Set(current.args.items.map((item) => item.format));
    if (formats.has('boolean') || formats.size > 1) {
      // `enums()` only supports homogeneous string/number lists; fall back to
      // a union of literals for anything else.
      const literals = values.map((value) => call(options, 'literal', value));
      return call(options, 'union', `[${literals.join(', ')}]`);
    }
    return call(options, 'enums', `[${values.join(', ')}]`);
  }

  if (isKeyword(current, schemaKeywords.union)) {
    const members = current.args
      .map((member) => parse([member], options))
      .filter(Boolean);
    if (members.length === 1) {
      return members[0];
    }
    return call(options, 'union', `[${members.join(', ')}]`);
  }

  if (isKeyword(current, schemaKeywords.and)) {
    const members = current.args
      .filter((member) => BASE_KEYWORDS.includes(member.keyword))
      .map((member) => parse([member], options))
      .filter(Boolean);
    if (members.length === 1) {
      return members[0];
    }
    return call(options, 'intersection', `[${members.join(', ')}]`);
  }

  if (isKeyword(current, schemaKeywords.const)) {
    return call(
      options,
      'literal',
      formatLiteral(current.args.value, current.args.format),
    );
  }

  if (isKeyword(current, schemaKeywords.ref)) {
    // Reference the imported struct directly. `lazy()` is only necessary for
    // circular references, which we do not generate for now.
    return current.args.name;
  }

  if (isKeyword(current, schemaKeywords.matches)) {
    if (current.args) {
      return call(
        options,
        'pattern',
        call(options, 'string'),
        `new RegExp(${JSON.stringify(current.args)})`,
      );
    }
    return call(options, 'string');
  }

  if (
    isKeyword(current, schemaKeywords.number) ||
    isKeyword(current, schemaKeywords.integer)
  ) {
    let output = isKeyword(current, schemaKeywords.integer)
      ? call(options, 'integer')
      : call(options, 'number');

    const minimum = findKeyword(siblings, schemaKeywords.min)?.args;
    const maximum = findKeyword(siblings, schemaKeywords.max)?.args;
    const exclusiveMinimum = findKeyword(
      siblings,
      schemaKeywords.exclusiveMinimum,
    )?.args;
    const exclusiveMaximum = findKeyword(
      siblings,
      schemaKeywords.exclusiveMaximum,
    )?.args;

    if (minimum !== undefined) {
      output = call(options, 'min', output, String(minimum));
    }
    if (exclusiveMinimum !== undefined) {
      output = call(
        options,
        'min',
        output,
        String(exclusiveMinimum),
        '{ exclusive: true }',
      );
    }
    if (maximum !== undefined) {
      output = call(options, 'max', output, String(maximum));
    }
    if (exclusiveMaximum !== undefined) {
      output = call(
        options,
        'max',
        output,
        String(exclusiveMaximum),
        '{ exclusive: true }',
      );
    }
    return output;
  }

  if (isKeyword(current, schemaKeywords.bigint)) {
    return call(options, 'bigint');
  }

  if (isKeyword(current, schemaKeywords.boolean)) {
    return call(options, 'boolean');
  }

  if (isKeyword(current, schemaKeywords.null)) {
    return call(options, 'literal', 'null');
  }

  if (isKeyword(current, schemaKeywords.any)) {
    return call(options, 'any');
  }

  if (
    isKeyword(current, schemaKeywords.unknown) ||
    isKeyword(current, schemaKeywords.undefined) ||
    isKeyword(current, schemaKeywords.void) ||
    isKeyword(current, schemaKeywords.blob)
  ) {
    return call(options, 'unknown');
  }

  // All string-like formats (datetime, date, time, email, uuid, url, ...) are
  // plain strings on the wire.
  return call(options, 'string');
}

/**
 * Converts an object schema to a superstruct expression.
 *
 * Objects with only `additionalProperties` become `record()` structs. Objects
 * with properties become `type()` structs (which tolerate unknown properties,
 * matching how API responses evolve) unless the OpenAPI schema sets
 * `additionalProperties: false`, in which case a strict `object()` struct is
 * generated.
 *
 * @param current - The object schema keyword.
 * @param options - The parser options.
 * @returns The superstruct expression for the object.
 */
function parseObject(
  current: SchemaKeywordMapper['object'],
  options: ParserOptions,
): string {
  const propertyEntries = Object.entries(current.args?.properties ?? {});
  const additionalProperties = current.args?.additionalProperties ?? [];

  if (propertyEntries.length === 0 && additionalProperties.length > 0) {
    const value = parse(additionalProperties, options);
    return call(
      options,
      'record',
      call(options, 'string'),
      value === '' ? call(options, 'unknown') : value,
    );
  }

  const properties = propertyEntries
    .map(([propertyName, propertySchemas]) => {
      const value = parse(propertySchemas, options);
      return `${formatPropertyName(propertyName)}: ${value === '' ? call(options, 'unknown') : value}`;
    })
    .join(',\n');

  const helper = current.args?.strict ? 'object' : 'type';
  return call(options, helper, `{\n${properties}\n}`);
}

/**
 * Finds a keyword within a list of sibling schemas.
 *
 * @param siblings - The sibling schemas to search.
 * @param keyword - The keyword to search for.
 * @returns The matching schema, if any.
 */
function findKeyword<TKeyword extends keyof SchemaKeywordMapper>(
  siblings: Schema[],
  keyword: TKeyword,
): SchemaKeywordMapper[TKeyword] | undefined {
  return siblings.find((schema): schema is SchemaKeywordMapper[TKeyword] =>
    isKeyword(schema, keyword),
  );
}

/**
 * Converts a list of sibling schema keywords — Kubb's representation of a
 * single value — into a `@metamask/superstruct` expression.
 *
 * The base schema (object/array/string/...) is converted first, then
 * decorated with constraints (`min`/`max`) and modifiers
 * (`defaulted`/`nullable`/`optional`).
 *
 * @param schemas - The sibling schema keywords describing a single value.
 * @param options - The parser options.
 * @returns The superstruct expression, or an empty string when the schemas
 * contain no base keyword.
 */
export function parse(schemas: Schema[], options: ParserOptions): string {
  const base = schemas.find((schema) => BASE_KEYWORDS.includes(schema.keyword));
  if (!base) {
    return '';
  }

  let output = parseBase(base, schemas, options);

  const defaultSchema = findKeyword(schemas, schemaKeywords.default);
  if (defaultSchema?.args !== undefined) {
    // Kubb pre-serializes string defaults (quotes included), so the value can
    // be emitted as-is.
    output = call(options, 'defaulted', output, String(defaultSchema.args));
  }

  const isNullish = schemas.some((schema) =>
    isKeyword(schema, schemaKeywords.nullish),
  );
  const isNullable =
    isNullish ||
    schemas.some((schema) => isKeyword(schema, schemaKeywords.nullable));
  const isOptional =
    isNullish ||
    schemas.some((schema) => isKeyword(schema, schemaKeywords.optional));

  if (isNullable) {
    output = call(options, 'nullable', output);
  }
  if (isOptional) {
    output = call(options, 'optional', output);
  }

  return output;
}
