import { OASSchema, OASSimpleDataType } from './openapi';

type FieldValidationSuccess = { matches: true };
type FieldValidationError = { matches: false; errorPath: string[]; error: string };
type FieldValidation = FieldValidationSuccess | FieldValidationError;

/**
 * Should generally be treated as an opaque object which can be
 * passed to s.build(...) or s.validator(...) to construct the
 * appropriate OASSchema or validator function.
 */
export type Field = {
  /**
   * The JSON type of the field.
   */
  jsonType: 'object' | 'array' | 'number' | 'string' | 'boolean';
  /**
   * True if this field, when within an object, is required.
   * False if this field, when within an object, is optional.
   * Ignored when this field is not within an object.
   */
  required: boolean;
  /**
   * Generates the corresponding schema for this field.
   * @returns The OASSchema object
   */
  build: () => OASSchema;
  /**
   * Generates a function which can be used to validate a value
   * against this field.
   * @returns The validator function
   */
  buildValidator: () => (args: unknown) => FieldValidation;
};

/** https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-6 */
type FieldMetadata = {
  /**
   * A preferrably short string generally used to relabel the field,
   * e.g., "fooBar" -> "Foo Bar".
   */
  title?: string;

  /**
   * Provides an explanation of the purpose of this instance, typically
   * analagous to adding documentation comments to the type or field.
   */
  description?: string;
};

/**
 * Describes the standard object validators; this excludes those which
 * we handle specially to reduce boilerplate, i.e., `properties` and `required`.
 */
type ObjectValidators = {
  /**
   * An object instance is valid against "maxProperties" if its number of
   * properties is less than, or equal to, the value of this keyword.
   *
   * MUST be non-negative.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.13
   */
  maxProperties?: number;

  /**
   * An object instance is valid against "minProperties" if its number of
   * properties is greater than, or equal to, the value of this keyword.
   *
   * MUST be non-negative.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.14
   */
  minProperties?: number;

  /**
   * Each property name of this object SHOULD be a valid regular expression,
   * according to the ECMA 262 regular expression dialect.  Each property value
   * of this object MUST be an object, and each object MUST be a valid JSON
   * Schema.
   *
   * For example, for an endpoint which accepts any http status code as an
   * object key, and the status message as the value, the following schema would
   * be appropriate:
   *
   * ```ts
   * const schema = s.build(
   *   s.object(
   *     {},
   *     {
   *       description: 'A map of http status codes to error messages',
   *     },
   *     {
   *       patternProperties: {
   *         '^[1-5][0-9][0-9]$': s.string(),
   *       },
   *     },
   *   )
   * )
   * ```
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.17
   */
  patternProperties?: { [key: string]: Field };

  /**
   * If "additionalProperties" is absent, it may be considered present
   * with an empty schema as a value.
   *
   * If "additionalProperties" is true, validation always succeeds.
   *
   * If "additionalProperties" is false, validation succeeds only if the
   * instance is an object and all properties on the instance were covered
   * by "properties" and/or "patternProperties".
   *
   * If "additionalProperties" is an object, validate the value as a
   * schema to all of the properties that weren't validated by
   * "properties" nor "patternProperties".
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.18
   */
  additionalProperties?: boolean | Field;

  /**
   * This keyword specifies rules that are evaluated if the instance is an
   * object and contains a certain property.
   *
   * This keyword's value MUST be an object.  Each property specifies a
   * dependency.  Each dependency value MUST be an object or an array.
   *
   * If the dependency value is an object, it MUST be a valid JSON Schema.
   * If the dependency key is a property in the instance, the dependency
   * value must validate against the entire instance.
   *
   * If the dependency value is an array, it MUST have at least one
   * element, each element MUST be a string, and elements in the array
   * MUST be unique.  If the dependency key is a property in the instance,
   * each of the items in the dependency value must be a property that
   * exists in the instance.
   *
   * ```ts
   * // Requires `foo`, and if `bar` is present, also requires `baz`
   * const schema = s.build(
   *   s.object({
   *     foo: s.string(),
   *     bar: s.optional(s.string()),
   *     baz: s.optional(s.string()),
   *   }, {}, {
   *     dependencies: {
   *       "bar": ["baz"]
   *     }
   *   })
   * )
   *
   * // Alternative form of the same schema
   * const schema = s.build(
   *   s.object({
   *     foo: s.string(),
   *     bar: s.optional(s.string()),
   *   }, {}, {
   *     dependencies: {
   *       "bar": s.object({
   *         baz: s.string()
   *       })
   *     }
   *   })
   * )
   * ```
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.19
   */
  dependencies?: Record<string, Field | string[]>;
};

/**
 * Validators for a number field. Has implied validators for integer
 * types (i.e., an int32 is implied to be within (incl) -2^31 to 2^31-1)
 */
type NumberValidators = {
  /**
   * A number, strictly greater than 0.
   *
   * A numeric instance is only valid if division by this keyword's value
   * results in an integer.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.1
   */
  multipleOf?: number;

  /**
   * A number, representing an upper limit for a numeric instance.
   *
   * If the instance is a number, then this keyword validates if
   * "exclusiveMaximum" is true and instance is less than the provided
   * value, or else if the instance is less than or exactly equal to the
   * provided value.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.2
   */
  maximum?: number;

  /**
   * A boolean, representing whether the limit in "maximum" is exclusive or not.
   * An undefined value is the same as false.
   *
   * If "exclusiveMaximum" is true, then a numeric instance SHOULD NOT be equal
   * to the value specified in "maximum".  If "exclusiveMaximum" is false (or
   * not specified), then a numeric instance MAY be equal to the value of
   * "maximum".
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.3
   */
  exclusiveMaximum?: boolean;

  /**
   * A number, representing a lower limit for a numeric instance.
   *
   * If the instance is a number, then this keyword validates if
   * "exclusiveMinimum" is true and instance is greater than the provided value,
   * or else if the instance is greater than or exactly equal to the provided
   * value.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.4
   */
  minimum?: number;

  /**
   * A boolean, representing whether the limit in "minimum" is exclusive or not.
   * An undefined value is the same as false.
   *
   * If "exclusiveMinimum" is true, then a numeric instance SHOULD NOT be equal
   * to the value specified in "minimum".  If "exclusiveMinimum" is false (or
   * not specified), then a numeric instance MAY be equal to the value of
   * "minimum".
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.5
   */
  exclusiveMinimum?: boolean;

  /**
   * This array SHOULD have at least one element.  Elements in the array SHOULD
   * be unique.
   *
   * An instance validates successfully against this keyword if its value is
   * equal to one of the elements in this keyword's array value.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.20
   */
  enum?: number[];
};

/**
 * Validators for a string field. Special types like `date` or `time` would not
 * use these validators (as most wouldn't make sense, e.g., maxLength)
 */
type StringValidators = {
  /**
   * A non-negative integer
   *
   * A string instance is valid against this keyword if its length is less than,
   * or equal to, the value of this keyword.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.6
   */
  maxLength?: number;

  /**
   * A non-negative integer
   *
   * A string instance is valid against this keyword if its length is
   * greater than, or equal to, the value of this keyword.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.7
   */
  minLength?: number;

  /**
   * This string SHOULD be a valid regular expression, according to the ECMA 262
   * regular expression dialect.
   *
   * A string instance is considered valid if the regular expression
   * matches the instance successfully.  Recall: regular expressions are
   * not implicitly anchored.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.8
   */
  pattern?: string;

  /**
   * This array SHOULD have at least one element.  Elements in the array SHOULD
   * be unique.
   *
   * An instance validates successfully against this keyword if its value is
   * equal to one of the elements in this keyword's array value.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.20
   */
  enum?: string[];
};

/**
 * Validators for an array field.
 */
type ArrayValidators = {
  /**
   * NOTE: This definition is taken from the JSON Schema definition, but their
   * definitions are adjusted by the OpenAPI Specification. Hence, these are defined
   * at https://swagger.io/specification/v3/#schema-object rather than in
   * https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5
   *
   * An array instance is valid against `items` if all the items within the array
   * are valid against the `items` Field. The `items` field MUST be present.
   */
  items: Field;

  /**
   * An array instance is valid against "minItems" if its size is greater
   * than, or equal to, the value of this keyword.
   */
  minItems?: number;

  /**
   * An array instance is valid against "maxItems" if its size is less
   * than, or equal to, the value of this keyword.
   */
  maxItems?: number;

  /**
   * An array instance is valid against a `true` uniqueItems if all the items
   * in the array are unique. An array instance is always valid against a
   * `false` uniqueItems. An undefined value is the same as `false`.
   *
   * SHOULD only be specified for basic item fields (number, boolean, string)
   * as other types (object, array) will have this check skipped.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.12
   */
  uniqueItems?: boolean;
};

type BooleanValidators = {
  /**
   * This array SHOULD have at least one element. Elements in the array SHOULD
   * be unique.
   *
   * An instance validates successfully against this keyword if its value is
   * equal to one of the elements in this keyword's array value.
   *
   * @see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-validation-00#section-5.20
   */
  enum?: boolean[];
};

const s = {
  /**
   * The intended way to generate the final OASSchema object for a routes
   * API documentation.
   *
   * ```ts
   * import s from './schemaHelpers';
   *
   * const schema = s.build(s.object({
   *   foo: s.string({ maxLength: 255 }, { description: 'The foo field' }}),
   *   bar: s.optional(s.int64({ minimum: 0 })),
   *   baz: s.array({ items: s.string(), maxLength: 5 })
   *   qux: s.enum(['a', 'b', 'c'])
   * }));
   * ```
   *
   * @param field The field to build
   * @returns The OASSchema object and the validator function
   */
  build: (field: Field): OASSchema => field.build(),

  /**
   * The intended way to create a validator to check against a received request
   * body.
   *
   * ```ts
   * import s from './schemaHelpers';
   *
   * const requestBody = s.object({
   *   foo: s.string({ maxLength: 255 }, { description: 'The foo field' }}),
   *   bar: s.optional(s.int64({ minimum: 0 })),
   *   baz: s.array({ items: s.string(), maxLength: 5 })
   *   qux: s.enum(['a', 'b', 'c'])
   * });
   *
   * const validator = s.validator(requestBody);
   *
   * // ...
   *
   * const result = validator(req.body);
   * if (!result.matches) {
   *   // handle validation error
   * }
   * ```
   */
  validator: (field: Field): ((args: unknown) => FieldValidation) => field.buildValidator(),

  /**
   * Constructs a field that represents a JSON object. Unlike
   * in the openapi 3.0 representation, the optional/required
   * attribute is specified in the individual fields, which
   * is typically more convenient.
   *
   * This object is required, but can be marked optional by
   * wrapping it in `s.optional`.
   *
   * ```ts
   * import s from './schemaHelpers';
   *
   * s.object({
   *   foo: s.string({ minLength: 5 }),
   * })
   * ```
   *
   * @param fields The fields of the object
   * @param metadata Optional metadata for the object
   * @param validators Additional validators for the object
   * @returns The field
   */
  object: (
    fields: { [key: string]: Field },
    metadata?: FieldMetadata,
    validators?: ObjectValidators
  ): Field => ({
    jsonType: 'object',
    required: true,
    build: () => ({
      type: 'object',
      required: Object.entries(fields)
        .filter(([k, f]) => f.required)
        .map(([k, v]) => k),
      properties: (() => {
        const result: Record<string, OASSchema> = {};
        for (const [k, f] of Object.entries(fields)) {
          result[k] = f.build();
        }
        return result;
      })(),
      ...metadata,
      ...validators,
    }),
    buildValidator: () => {
      const parts: {
        path: string;
        validator: (args: Record<string, unknown>) => FieldValidationError | null;
      }[] = [];
      Object.entries(fields).forEach(([k, f]) => {
        const subvalidator = f.buildValidator();
        parts.push({
          path: k,
          validator: (v: Record<string, unknown>) => {
            if (!(k in v) || v[k] === undefined || v[k] === null) {
              if (f.required) {
                return {
                  matches: false,
                  errorPath: [k],
                  error: 'expected to be present',
                };
              }
              return null;
            }

            const result = subvalidator(v[k]);
            if (!result.matches) {
              result.errorPath.unshift(k);
              return result;
            }
            return null;
          },
        });
      });

      const roots: ((args: Record<string, unknown>) => FieldValidationError | null)[] = [];
      if (validators?.maxProperties !== undefined) {
        const maxProperties = validators.maxProperties;
        roots.push((v: Record<string, unknown>) => {
          if (Object.keys(v).length > maxProperties) {
            return {
              matches: false,
              errorPath: [],
              error: 'too many properties',
            };
          }
          return null;
        });
      }

      if (validators?.minProperties !== undefined) {
        const minProperties = validators.minProperties;
        roots.push((v: Record<string, unknown>) => {
          if (Object.keys(v).length < minProperties) {
            return {
              matches: false,
              errorPath: [],
              error: 'too few properties',
            };
          }
          return null;
        });
      }

      if (validators?.patternProperties !== undefined) {
        const patternProperties = validators.patternProperties;
        const builtPatternProperties = Object.entries(patternProperties).map(
          ([k, v]): [RegExp, (args: unknown) => FieldValidation] => [
            new RegExp(k),
            v.buildValidator(),
          ]
        );
        const skipKeys = new Set(Object.keys(fields));

        roots.push((raw: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(raw)) {
            if (skipKeys.has(k)) {
              continue;
            }

            let errors: [RegExp, FieldValidationError][] = [];
            for (const [pattern, subvalidator] of builtPatternProperties) {
              if (!pattern.test(k)) {
                continue;
              }

              const subresult = subvalidator(v);
              if (subresult.matches) {
                errors = [];
                break;
              }

              errors.push([pattern, subresult]);
            }

            if (errors.length > 0) {
              return {
                matches: false,
                errorPath: [k],
                error:
                  'did not match any pattern properties:\n' +
                  errors
                    .map((e) => `  ${e[0].source}: at ${e[1].errorPath.join('.')}, ${e[1].error}`)
                    .join('\n'),
              };
            }
          }
          return null;
        });
      }

      if (validators?.additionalProperties !== undefined) {
        if (validators.additionalProperties === false) {
          const allowedKeys = new Set(Object.keys(fields));
          const allowedPatterns = Object.keys(validators.patternProperties ?? {}).map(
            (k) => new RegExp(k)
          );
          roots.push((v: Record<string, unknown>) => {
            for (const k of Object.keys(v)) {
              if (!allowedKeys.has(k) && !allowedPatterns.some((p) => p.test(k))) {
                return {
                  matches: false,
                  errorPath: [k],
                  error: 'unexpected property',
                };
              }
            }

            return null;
          });
        } else if (typeof validators.additionalProperties === 'object') {
          const subvalidator = validators.additionalProperties.buildValidator();
          const allowedKeys = new Set(Object.keys(fields));
          const allowedPatterns = Object.keys(validators.patternProperties ?? {}).map(
            (k) => new RegExp(k)
          );
          roots.push((v: Record<string, unknown>) => {
            for (const k of Object.keys(v)) {
              if (!allowedKeys.has(k) && !allowedPatterns.some((p) => p.test(k))) {
                const result = subvalidator(v[k]);
                if (!result.matches) {
                  result.errorPath.unshift(k);
                  return result;
                }
              }
            }
            return null;
          });
        }
      }

      if (validators?.dependencies !== undefined) {
        const builtDependencies = Object.entries(validators.dependencies).map(
          ([k, v]): [string, (args: Record<string, unknown>) => FieldValidation] => [
            k,
            Array.isArray(v)
              ? (args: Record<string, unknown>) => {
                  for (const dep of v) {
                    if (!(dep in args)) {
                      return {
                        matches: false,
                        errorPath: [dep],
                        error: 'expected to be present',
                      };
                    }
                  }
                  return { matches: true };
                }
              : v.buildValidator(),
          ]
        );

        roots.push((v: Record<string, unknown>) => {
          for (const [k, subvalidator] of builtDependencies) {
            if (k in v) {
              const result = subvalidator(v);
              if (!result.matches) {
                result.errorPath.unshift(k);
                result.error += ` (dependency of ${k})`;
                return result;
              }
            }
          }
          return null;
        });
      }

      return (v: unknown) => {
        if (typeof v !== 'object') {
          return {
            matches: false,
            errorPath: [],
            error: 'expected to be an object',
          };
        }

        const raw = v as Record<string, unknown>;

        for (const root of roots) {
          const result = root(raw);
          if (result !== null) {
            return result;
          }
        }

        for (const part of parts) {
          const result = part.validator(raw);
          if (result !== null) {
            return result;
          }
        }

        return { matches: true };
      };
    },
  }),

  /**
   * Returns an optional variant of the given field. This is only
   * meaningful if the field is being used within an object/array:
   * root fields are always required.
   *
   * @param field The field to make optional
   * @returns A version of the field which is optional
   */
  optional: (field: Field): Field => ({
    required: false,
    jsonType: field.jsonType,
    build: field.build,
    buildValidator: field.buildValidator,
  }),

  /**
   * Describes a number with the given format. This is the generic builder
   * for any number; it's typically preferable to use the format-specific
   * builders, e.g., `s.int64`, for compactness. There is some ambiguity
   * in this function name since one might think it refers to the format
   * number specifically, but it's very rare that you would want to
   * use that format (since it would need to be parsed with an arbitrary
   * precision library, which can only reasonably be done if a custom json
   * library is used or the number is provided as a string).
   */
  number: (
    format: 'number' | 'integer' | 'int32' | 'int64' | 'float' | 'double',
    metadata?: FieldMetadata,
    validators?: NumberValidators
  ): Field => ({
    jsonType: 'number',
    required: true,
    build: () => {
      let dataType: OASSimpleDataType;

      switch (format) {
        case 'number':
          dataType = {
            type: 'number',
            format: 'number',
          };
          break;
        case 'integer':
          dataType = {
            type: 'integer',
            format: 'integer',
          };
          break;
        case 'int32':
          dataType = {
            type: 'integer',
            format: 'int32',
          };
          break;
        case 'int64':
          dataType = {
            type: 'integer',
            format: 'int64',
          };
          break;
        case 'float':
          dataType = {
            type: 'number',
            format: 'float',
          };
          break;
        case 'double':
          dataType = {
            type: 'number',
            format: 'double',
          };
          break;
        default:
          throw new Error(`Unknown number format: ${format}`);
      }

      return {
        ...dataType,
        ...metadata,
        ...validators,
      };
    },
    buildValidator: () => {
      const parts: ((raw: number) => FieldValidationError | null)[] = [];

      // implied integer validators first
      if (format === 'integer' || format === 'int32' || format === 'int64') {
        parts.push((v: number) => {
          if (!Number.isInteger(v)) {
            return {
              matches: false,
              errorPath: [],
              error: 'expected to be an integer',
            };
          }
          return null;
        });

        if (format === 'int32') {
          parts.push((v: number) => {
            if (v < -2147483648 || v > 2147483647) {
              return {
                matches: false,
                errorPath: [],
                error: 'expected fit in a 32-bit integer',
              };
            }
            return null;
          });
        }

        if (format === 'integer' || format === 'int64') {
          parts.push((v: number) => {
            if (!Number.isSafeInteger(v)) {
              return {
                matches: false,
                errorPath: [],
                error:
                  'expected fit in a 53-bit integer (server does not support the full 64-bit range)',
              };
            }
            return null;
          });
        }
      }

      if (validators?.multipleOf !== undefined) {
        const multipleOf = validators.multipleOf;
        if (multipleOf <= 0) {
          throw new Error(`multipleOf must be positive, got ${multipleOf}`);
        }

        parts.push((v: number) => {
          if (v % multipleOf !== 0) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to be a multiple of ${multipleOf}`,
            };
          }
          return null;
        });
      }

      if (validators?.maximum !== undefined) {
        const maximum = validators.maximum;
        parts.push((v: number) => {
          if (v > maximum) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to be less than or equal to ${maximum}`,
            };
          }
          return null;
        });
      }

      if (validators?.maximum !== undefined && validators?.exclusiveMaximum === true) {
        const maximum = validators.maximum;
        parts.push((v: number) => {
          if (v === maximum) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to be less than ${maximum}`,
            };
          }
          return null;
        });
      }

      if (validators?.minimum !== undefined) {
        const minimum = validators.minimum;
        parts.push((v: number) => {
          if (v < minimum) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to be greater than or equal to ${minimum}`,
            };
          }
          return null;
        });
      }

      if (validators?.minimum !== undefined && validators?.exclusiveMinimum === true) {
        const minimum = validators.minimum;
        parts.push((v: number) => {
          if (v === minimum) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to be greater than ${minimum}`,
            };
          }
          return null;
        });
      }

      if (validators?.enum !== undefined) {
        const allowedValues = new Set(validators.enum);
        parts.push((v: number) => {
          if (!allowedValues.has(v)) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to be one of ${Array.from(allowedValues).join(', ')}`,
            };
          }
          return null;
        });
      }

      return (v: unknown) => {
        if (typeof v !== 'number') {
          return {
            matches: false,
            errorPath: [],
            error: 'expected to be a number',
          };
        }

        for (const part of parts) {
          const result = part(v);
          if (result !== null) {
            return result;
          }
        }

        return { matches: true };
      };
    },
  }),

  /**
   * Describes an integer which fits within the int32 range.
   */
  int32: (metadata?: FieldMetadata, validators?: NumberValidators): Field =>
    s.number('int32', metadata, validators),

  /**
   * Describes an integer which fits within the int53 range, which is
   * the safe range for javascript within an int64. For most practical
   * purposes this can be thought of as a 64-bit integer.
   */
  int64: (metadata?: FieldMetadata, validators?: NumberValidators): Field =>
    s.number('int64', metadata, validators),

  /**
   * Describes a floating-point number with 32 bits of precision
   */
  float: (metadata?: FieldMetadata, validators?: NumberValidators): Field =>
    s.number('float', metadata, validators),

  /**
   * Describes a floating-point number with 64 bits of precision
   */
  double: (metadata?: FieldMetadata, validators?: NumberValidators): Field =>
    s.number('double', metadata, validators),

  /**
   * Describes a string acting as a string.
   */
  string: (metadata?: FieldMetadata, validators?: StringValidators): Field => ({
    required: true,
    jsonType: 'string',
    build: () => ({
      type: 'string',
      format: 'string',
      ...metadata,
      ...validators,
    }),
    buildValidator: () => {
      const parts: ((raw: string) => FieldValidationError | null)[] = [];

      if (validators?.maxLength !== undefined) {
        const maxLength = validators.maxLength;
        parts.push((v: string) => {
          if (v.length > maxLength) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to be at most ${maxLength} characters`,
            };
          }
          return null;
        });
      }

      if (validators?.minLength !== undefined) {
        const minLength = validators.minLength;
        parts.push((v: string) => {
          if (v.length < minLength) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to be at least ${minLength} characters`,
            };
          }
          return null;
        });
      }

      if (validators?.pattern !== undefined) {
        const pattern = new RegExp(validators.pattern);
        parts.push((v: string) => {
          if (!pattern.test(v)) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to match ${pattern.source}`,
            };
          }
          return null;
        });
      }

      if (validators?.enum !== undefined) {
        const allowedValues = new Set(validators.enum);
        parts.push((v: string) => {
          if (!allowedValues.has(v)) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to be one of ${Array.from(allowedValues).join(', ')}`,
            };
          }
          return null;
        });
      }

      return (v: unknown) => {
        if (typeof v !== 'string') {
          return {
            matches: false,
            errorPath: [],
            error: 'expected to be a string',
          };
        }

        for (const part of parts) {
          const result = part(v);
          if (result !== null) {
            return result;
          }
        }

        return { matches: true };
      };
    },
  }),

  /**
   * Describes an array. Arrays must have their items specified, hence
   * validators is not optional.
   */
  array: (metadata: FieldMetadata | undefined, validators: ArrayValidators): Field => ({
    required: true,
    jsonType: 'array',
    build: () => ({
      type: 'array',
      ...metadata,
      ...validators,
      items: validators.items.build(),
    }),
    buildValidator: () => {
      const parts: ((raw: unknown[]) => FieldValidationError | null)[] = [];
      const subvalidator = validators.items.buildValidator();

      if (validators?.minItems !== undefined) {
        const minItems = validators.minItems;
        parts.push((v: unknown[]) => {
          if (v.length < minItems) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to have at least ${minItems} items`,
            };
          }
          return null;
        });
      }

      if (validators?.maxItems !== undefined) {
        const maxItems = validators.maxItems;
        parts.push((v: unknown[]) => {
          if (v.length > maxItems) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to have at most ${maxItems} items`,
            };
          }
          return null;
        });
      }

      if (validators?.uniqueItems === true) {
        if (!['number', 'string', 'boolean'].some((t) => validators.items.jsonType === t)) {
          throw new Error(`uniqueItems is not supported for ${validators.items.jsonType} items`);
        }

        parts.push((v: unknown[]) => {
          const seen = new Set();
          for (const item of v) {
            if (seen.has(item)) {
              return {
                matches: false,
                errorPath: [],
                error: 'expected to have unique items',
              };
            }
            seen.add(item);
          }
          return null;
        });
      }

      return (v: unknown) => {
        if (!Array.isArray(v)) {
          return {
            matches: false,
            errorPath: [],
            error: 'expected to be an array',
          };
        }

        for (const part of parts) {
          const result = part(v);
          if (result !== null) {
            return result;
          }
        }

        for (let i = 0; i < v.length; i++) {
          const result = subvalidator(v[i]);
          if (!result.matches) {
            result.errorPath.unshift(i.toString());
            return result;
          }
        }

        return { matches: true };
      };
    },
  }),

  /**
   * Describes a boolean value (true or false). This datatype is so simple that no
   * validators are typically required, but it can sometimes be helpful to indicate
   * that either only true or only false is allowed via the enum validator.
   */
  boolean: (metadata?: FieldMetadata, validators?: BooleanValidators): Field => ({
    required: true,
    jsonType: 'boolean',
    build: () => ({
      type: 'boolean',
      format: 'boolean',
      ...metadata,
    }),
    buildValidator: () => {
      if (validators?.enum !== undefined) {
        if (validators.enum.length !== 1) {
          throw new Error(`enum must have exactly one value, got ${validators.enum.length}`);
        }

        const allowedValue = validators.enum[0];
        return (v: unknown) => {
          if (v !== allowedValue) {
            return {
              matches: false,
              errorPath: [],
              error: `expected to be ${allowedValue}`,
            };
          }
          return { matches: true };
        };
      }

      return (v: unknown) => {
        if (v !== true && v !== false) {
          return {
            matches: false,
            errorPath: [],
            error: 'expected to be a boolean',
          };
        }
        return { matches: true };
      };
    },
  }),
};

export default s;
