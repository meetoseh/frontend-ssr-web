/**
 * Typing for OpenAPI Version 3.0.3
 *
 * @see https://swagger.io/specification/
 */

export type OASSimpleDataType =
  // JSON Basic Types
  | {
      type: 'integer';
      /** Unbounded size integer */
      format: 'integer';
    }
  | {
      type: 'number';
      /** Unbounded size integer or floating point number */
      format: 'number';
    }
  | {
      type: 'string';
      /** Unrestricted string */
      format: 'string';
    }
  | {
      type: 'boolean';
      /** true or false */
      format: 'boolean';
    }
  // https://swagger.io/specification/v3/ but not JSON Schema
  | {
      type: 'string';
      /* base64 encoded characters */
      format: 'byte';
    }
  | {
      type: 'string';
      /* any sequence of octets */
      format: 'binary';
    }
  // JSON Format Extensions included by reference in 3.1, either specifed in 3.0
  // or omitted (and thus allowed but unsupported by the ui viewer)
  // https://datatracker.ietf.org/doc/html/draft-bhutton-json-schema-validation-00#section-7.3.1
  | {
      type: 'string';
      /**
       * RFC 3339 section 5.6 formatted date and time
       * @example 1985-04-12T23:20:50.52Z
       */
      format: 'date-time';
    }
  | {
      type: 'string';
      /**
       * RFC 3339, section 5.6 `full-date` production, which is also the ISO 8601 format
       * @example 1985-04-12
       */
      format: 'date';
    }
  | {
      type: 'string';
      /**
       * RFC 3339, section 5.6 `full-time` production
       * @example 23:20:50.52Z
       */
      format: 'time';
    }
  | {
      type: 'string';
      /**
       * ISO 8601 ABNF as given in Appendex A of RFC 3339.
       *
       * WARN: Parsers are not wide-spread, and thus this can be a painful
       *   format to consume
       * @example PT90M
       */
      format: 'duration';
    }
  /* OAS extension types */
  | {
      type: 'integer';
      /** An integer which fits within 32 bytes, i.e,. -2,147,483,648 (incl) through 2,147,483,647 (incl) */
      format: 'int32';
    }
  | {
      type: 'integer';
      /**
       * An integer which fits within 64 bytes, i.e., -9,223,372,036,854,775,808 (incl) through
       * 9,223,372,036,854,775,807 (incl)
       */
      format: 'int64';
    }
  | {
      type: 'number';
      /**
       * A floating point number which can be exactly represented using IEEE 754-2019 binary32
       */
      format: 'float';
    }
  | {
      type: 'number';
      /**
       * A floating point number which can be exactly represented using IEEE 754-2019 binary64
       */
      format: 'double';
    }
  | {
      type: 'string';
      /**
       * An unbounded string which should be obscured from logs and other
       * non-secure outputs
       */
      format: 'password';
    };

/**
 * Describes the `type: 'object'` option for indicating a datatype, separate
 * from when it might be used for describing an object schema
 */
export type OASObjectTypeHint = {
  type: 'object';
};

export type OASArrayTypeHint = {
  type: 'array';
};

export type OASObjectDataType = OASObjectTypeHint & {
  /**
   * Which fields are required for this object.
   */
  required: string[];

  /**
   * A map of property names to their schemas.
   */
  properties: Record<string, OASSchema>;
};

export type OASArrayDataType = OASArrayTypeHint & {
  items: OASSchema;
};

export type OASContact = {
  /** The identifying name of the contact person/organization */
  name: string;
  /** The URL pointing to the contact information */
  url: string;
  /** The email address of the contact person/organization */
  email: string;
};

export type OASLicense =
  | {
      /** The license name used for the API */
      name: string;
      /**
       * A SPDX License Identifier, e.g., MIT.
       * @see https://spdx.org/licenses/
       */
      identifier: string;
    }
  | {
      /** The license name used for the API */
      name: string;
      /** A URL to the license used for the API */
      url: string;
    };

export type OASInfo = {
  /** Title of the API */
  title: string;
  /** A short summary of the api */
  summary?: string;
  /** A description of the API, with CommonMark syntax support */
  description?: string;
  /** A URL to the Terms of Service for the API */
  termsOfService?: string;
  /** The contact information for the exposed API */
  contact?: OASContact;
  /** The license information for the exposed API */
  license?: OASLicense;
  /**
   * The version of this OpenAPI document (which is distinct from the OpenAPI
   * Specification version or the API implementation version)
   */
  version: string;
};

export type OASServerVariable = {
  /**
   * An enumeration of string values to be used if the substitution options are
   * from a limited set. Never an empty array
   */
  enum?: string[];

  /**
   * The default value to use for substitution
   */
  default: string;

  /**
   * An optional description for the variable, with CommonMark support
   */
  description: string;
};

export type OASServer = {
  /**
   * A URL to the target host. This URL supports Server Variables and MAY be
   * relative, to indicate that the host location is relative to the location
   * where the OpenAPI document is being served. Variable substitutions will be
   * made when a variable is named in {brackets}
   */
  url: string;

  /**
   * Describes the host designated by the url, with CommonMark syntax support
   */
  description?: string;

  /**
   * A map between a variable name and its value. The value is used for
   * substitution in the server's URL template
   */
  variables: Record<string, OASServerVariable>;
};

export type OASExternalDocumentation = {
  /**
   * A description of the target documentation, with CommonMark syntax support
   */
  description?: string;
  /**
   * The URL for the target documentation.
   */
  url: string;
};

export type OASDiscriminator = {
  /**
   * The name of the property in the payload that will hold the discriminator value,
   * i.e., the value that can be inspected to determine the export type of the payload
   */
  propertyName: string;

  /**
   * Maps from payload values and schema names or references
   */
  mapping: Record<string, string>;
};

/**
 * This export type is hard to get a good definition of, so only a limited subset
 * is available.
 */
export type OASBasicSchema = (OASSimpleDataType | OASObjectDataType | OASArrayDataType) & {
  /**
   * unsupported; use an OASComplexSchema and specify the discriminator
   * there
   */
  discriminator?: undefined;
  /**
   * unsupported
   */
  xml?: undefined;
  /**
   * Additional external documentation for this schema
   */
  externalDocs?: OASExternalDocumentation;
};

export type OASComplexSchema =
  | {
      anyOf: OASSchema[];
      discriminator?: OASDiscriminator;
    }
  | {
      allOf: OASSchema[];
    }
  | {
      oneOf: OASSchema[];
      discriminator?: OASDiscriminator;
    };

export type OASSchema = OASBasicSchema | OASComplexSchema;

export type OASReference = {
  /**
   * The reference identifier, in the form of a URI
   */
  $ref: string;

  /**
   * A short summary which by default overrides that of the referenced component
   */
  summary?: string;

  /**
   * A description which by default overrides that of the referenced component,
   * with CommonMark syntax support
   */
  description?: string;
};

export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

export type OASExample =
  | {
      /**
       * A short description for the example
       */
      summary?: string;

      /**
       * A long description for the example, with CommonMark syntax support
       */
      description?: string;
      /**
       * Embedded literal example.
       */
      value: JSONValue;
    }
  | {
      /**
       * A short description for the example
       */
      summary?: string;

      /**
       * A long description for the example, with CommonMark syntax support
       */
      description?: string;

      /**
       * A URI that points to the literal example, in case an embedded one is not
       * practical.
       */
      externalValue: string;
    };

export type OASParameter = {
  /**
   * The location of the parameter
   */
  in: 'query' | 'header' | 'path' | 'cookie';

  /**
   * The name of the parameter, corresponding to:
   *
   * - for query, the parameter name in the query string
   * - for cookie, the name of the cookie
   * - for header, the name must not be one of `Accept`, `Content-Type`, or `Authorization`,
   *   otherwise it is the name of the header (case-insensitive)
   * - for path, the case-sensitive name of the template expression within the
   *   path
   */
  name: string;

  /**
   * A brief description of the parameter, with CommonMark syntax support
   */
  description?: string;

  /**
   * Whether this parameter is mandatory.
   *
   * If `in` is `path`, this property is REQUIRED and its value MUST be `true`.
   * Otherwise, the property MAY be included and its default value is `false`
   */
  required?: boolean;

  /**
   * Whether this parameter is deprecated and SHOULD be transitioned out of
   * usage. Default value is false
   */
  deprecated?: boolean;

  /**
   * Describes how the parameter will be serialized. For query and cookies
   * this should be `form`, for path and headers it should be `simple`. In
   * practice there is limited support for any other value.
   */
  style?: 'form' | 'simple';
  /**
   * Whether array or objects generate separate parameters for each value of
   * the array or key-value pair of the object. Other types are not affected.
   * Default is true for `form`, false otherwise. Should not typically be
   * specified.
   */
  explode?: boolean;
  /**
   * Whether reserved characters, as defined by RFC3986, should be included
   * without percent-encoding. This property only applies to parameters with the
   * `in` value `query`. The default value is false, and it should not typically
   * be specified as support may be limited.
   */
  allowReserved?: boolean;
  /**
   * The schema defining the export type of the parameter
   */
  schema?: OASSchema;
  /**
   * unsupported, prefer examples
   */
  example?: undefined;
  /**
   * A mapping from identifiers for scenarios relevant to this parameter to
   * the corresponding example or reference.
   */
  examples?: Record<string, OASExample | OASReference>;
};

/**
 * According to the specification document, headers should not include `in`
 * or `name` when specified via the components object, but in practice it
 * will not render correctly within the swagger ui unless they are included.
 */
export type OASHeader = OASParameter;

export type OASEncoding = Pick<OASParameter, 'style' | 'explode' | 'allowReserved'> & {
  /**
   * The encoding for a specific property. Default value varies and thus
   * should not be used.
   */
  contentType: string;

  /**
   * Describes additional information received as headers, e.g., content-disposition
   */
  headers: Record<string, OASHeader | OASReference>;
};

export type OASMediaType = {
  /**
   * The schema defining the content of the request, response, or parameter
   */
  schema?: OASSchema;

  /**
   * unsupported, prefer examples
   */
  example?: undefined;

  /**
   * Examples of the media type, matching the media export type and specified
   * schema
   */
  examples?: Record<string, OASExample | OASReference>;

  /**
   * Maps between property names and their encoding information,
   * for requestBody's this is exclusively for `multipart` or `application/x-www-form-urlencoded`
   * content types.
   */
  encoding?: Record<string, OASEncoding>;
};

export type OASRequestBody = {
  /**
   * A brief description of the request body, with CommonMark syntax support
   */
  description?: string;

  /**
   * The content of the request body, where the key is a media export type or
   * media export type range (e.g, `application/json` or `image/*`), and the value
   * that describes it. More specific matches are preferred.
   */
  content: Record<string, OASMediaType>;
  /**
   * True if the request body is required, false otherwise. Defaults to false
   */
  required?: boolean;
};

export type OASLink = {
  operationRef: string;
  operationId: string;
  parameters: Record<string, JSONValue>;
  requestBody: JSONValue;
  description: string;
  server: OASServer;
};

export type OASResponse = {
  /**
   * A description of the response, with CommonMark syntax support
   */
  description: string;

  /**
   * Headers returned by the API, case-insensitive. Content-Type SHOULD NOT be
   * included and if it is, it SHALL be ignored
   */
  headers?: Record<string, OASHeader | OASReference>;

  /**
   * A map containing descriptions of potential response payloads. The key is a
   * media export type or media export type range and the value describes it. For responses
   * that match multiple keys, only the most specific key is applicable. e.g.
   * text/plain overrides text/*
   */
  content?: Record<string, OASMediaType>;

  /**
   * Not recommended. May pose a security risk. Instead, include links directly
   * in the description.
   */
  links?: Record<string, OASLink | OASReference>;
};

export type OASResponses = {
  /**
   * The expected response export type by http status code. May use the special
   * key `default` to indicate a default response object for all http codes,
   * but this is not recommended.
   *
   * The following ranges are allowed but not recommended: 1XX, 2XX, 3XX, 4XX,
   * and 5XX.
   */
  [httpStatusCodeOrDefault: string]: OASResponse | OASReference;
};

export type OASSecurityScheme = {
  /**
   * The value 'http', indicating this is for the authorization header
   */
  type: 'http';
  /**
   * Describes the scheme, with CommonMark syntax support
   */
  description?: string;
  /**
   * Due to the heavily fragmented nature of security, this should always
   * be `bearer`, to distinguish it from `basic`. `bearer` means any
   * value, whereas `basic` has a specific meaning. In practice there are
   * no other schemes in use.
   */
  scheme: 'bearer';
  /**
   * A hint for how the server generates the tokens, in case the client
   * may want to inspect them. This isn't really that helpful without
   * elaboration in the description, since e.g., a JWT with an encrypted
   * body is not different from an opaque token in practice.
   */
  bearerFormat: 'JWT' | 'opaque';
};

/**
 * A security requirement for an endpoint.
 */
export type OASSecurityRequirement = {
  /**
   * Goes to an empty array, indicates that we require the Authorization header.
   * If the array isn't empty, then the type of the corresponding scheme must
   * be `oauth2` or `openIdConnect` and the values are the scopes required.
   */
  [name: string]: string[];
};

export type OASOperation = {
  /**
   * A list of tags for API documentation control. May be used as a logical
   * grouping of operations
   */
  tags?: string[];
  /**
   * A short summary of what the operation does
   */
  summary?: string;
  /**
   * A verbose explanation of the operation behavior, with CommonMark syntax
   */
  description?: string;
  /**
   * Additional external documentation for this operation
   */
  externalDocs?: OASExternalDocumentation;
  /**
   * A unique string used to identify the operation. Must be unique among
   * all operations, case-sensitive. This may be used, for example, to keep
   * the URL stable even if the api path changes
   */
  operationId?: string;
  /**
   * A list of parameters that are applicable to this operation, without
   * duplicates.
   */
  parameters?: (OASParameter | OASReference)[];
  /**
   * The request body applicable for the operation, if applicable
   */
  requestBody?: OASRequestBody | OASReference;
  /**
   * The possible responses for this operation
   */
  responses?: OASResponses;
  /**
   * unsupported (not desirable). Prefer using the description
   */
  callbacks?: unknown;
  /**
   * Whether this operation is deprecated, i.e., consumers should refrain
   * from usage. Default value is false
   */
  deprecated?: boolean;
  /**
   * Can be used to indicate that an Authorization header is required, overriding
   * top-level definitions.
   */
  security?: OASSecurityRequirement[];
  /**
   * Overrides which servers service this operation
   */
  servers?: OASServer[];
};

export type OASPathItem =
  | {
      /**
       * A reference to another path item, as a uri
       */
      $ref: string;
    }
  | {
      /**
       * A short summary intended for all operations in this path
       */
      summary?: string;
      /**
       * An extended description intended for all operations in this path,
       * with CommonMark syntax
       */
      description?: string;
      /**
       * The GET operation for this path
       */
      get?: OASOperation;
      /**
       * The PUT operation for this path
       */
      put?: OASOperation;
      /**
       * The POST operation for this path
       */
      post?: OASOperation;
      /**
       * The DELETE operation for this path
       */
      delete?: OASOperation;
      /**
       * The OPTIONS operation for this path
       */
      options?: OASOperation;
      /**
       * The HEAD operation for this path
       */
      head?: OASOperation;
      /**
       * The PATCH operation for this path
       */
      patch?: OASOperation;
      /**
       * The TRACE operation for this path
       */
      trace?: OASOperation;
      /**
       * The servers that service this path
       */
      servers?: OASServer[];
      /**
       * The parameters applicable to all operations in this path
       */
      parameters?: (OASParameter | OASReference)[];
    };

export type OASPaths = {
  /**
   * Maps from a relative path to the corresponding path item. For example:
   * `/foo`. The path must begin with a slash and will be appended without
   * relative URL resolution to the expanded server url. Path templating is
   * allowed, preferring non-templated paths over templated ones if multiple
   * match. Ambiguous matching is discouraged and will result in undefined
   * behavior.
   */
  [path: string]: OASPathItem;
};

export type OASComponents = {
  /**
   * Can be used to hold reusable schema objects
   */
  schemas?: Record<string, OASSchema>;
  /**
   * Can be used to hold reusable response objects
   */
  responses?: Record<string, OASResponse | OASReference>;
  /**
   * Can be used to hold reusable parameter objects
   */
  parameters?: Record<string, OASParameter | OASReference>;
  /**
   * Can be used to hold reusable example objects
   */
  examples?: Record<string, OASExample | OASReference>;
  /**
   * Can be used to hold reusable request body objects
   */
  requestBodies?: Record<string, OASRequestBody | OASReference>;
  /**
   * Can be used to hold reusable header objects
   */
  headers?: Record<string, OASHeader | OASReference>;
  /**
   * Can be used to hold reusable security scheme objects
   */
  securitySchemes?: Record<string, OASSecurityScheme>;
  /**
   * unsupported, may pose a security risk
   */
  links?: undefined;
  /**
   * unsupported, may pose a security risk
   */
  callbacks?: undefined;
  /**
   * Can be used to hold reusable path item objects
   */
  pathItems?: Record<string, OASPathItem>;
};

export type OASTag = {
  /**
   * The name of the tag
   */
  name: string;
  /**
   * A description for the tag, with CommonMark syntax
   */
  description?: string;
  /**
   * Additional external documentation for this tag
   */
  externalDocs?: OASExternalDocumentation;
};

export type OpenAPI = {
  /**
   * The version of the OpenAPI specification used
   */
  openapi: '3.0.3';
  /**
   * Provides metadata about the API
   */
  info: OASInfo;
  /**
   * The servers that service this API. If empty or not provided, a
   * default server object with a url of `/` is used
   */
  servers?: OASServer[];
  /**
   * The available paths and operations
   */
  paths?: OASPaths;
  /**
   * The available incoming webhooks that consumers can publish to. This
   * should typically not be used as it's more confusing than a regular
   * path without any additional functionality, but if there are a lot of
   * incoming webhooks then maybe
   */
  webhooks?: Record<string, OASPathItem | OASReference>;
  /**
   * An element to hold various schemas for the document to be referenced
   * without attaching them to specific paths
   */
  components?: OASComponents;
  /**
   * Can be used to indicate that the Authorization header is required for
   * all operations, unless overriden by a nested definition
   */
  security?: OASSecurityRequirement[];
  /**
   * The tags used by the document, with additional metadata and the order
   * being used to reflect the order the tags should be displayed.
   */
  tags?: OASTag[];
  /**
   * Additional external documentation
   */
  externalDocs?: OASExternalDocumentation;
};
