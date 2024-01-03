import { Readable } from 'stream';
import {
  AcceptableEncoding,
  finishWithEncodedServerResponse,
  parseAcceptEncoding,
  selectEncoding,
} from '../../lib/acceptEncoding';
import { PendingRoute } from '../../lib/route';
import { simpleRouteHandler } from '../../lib/simpleRouteHandler';
import { finishWithBadEncoding } from '../../lib/finishWithBadEncoding';
import { JSONValue, OASMediaType, OASPathItem, OASRequestBody } from '../../lib/openapi';
import { loadBodyJson } from '../../lib/loadBodyJson';
import { RouteBodyArgs } from '../../lib/RouteBodyArgs';
import { STANDARD_VARY_RESPONSE } from '../../lib/constants';

const helloWorldRoute: PendingRoute = {
  methods: ['GET', 'POST'],
  path: '/hello_world',
  handler: () =>
    simpleRouteHandler(async (args) => {
      const coding = selectEncoding(parseAcceptEncoding(args.req.headers['accept-encoding']));
      if (coding === null) {
        return finishWithBadEncoding(args);
      }

      if (args.req.method === 'GET') {
        args.resp.statusCode = 200;
        args.resp.statusMessage = 'OK';
        args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
        args.resp.setHeader('Content-Encoding', coding);
        args.resp.setHeader('Content-Type', 'application/json; charset=utf-8');

        return finishWithEncodedServerResponse(
          args,
          coding,
          Readable.from(
            Buffer.from(
              JSON.stringify({
                message: 'Hello, world!',
              }) + '\n',
              'utf-8'
            )
          )
        );
      } else {
        const bodyJson = await loadBodyJson(args, {});
        if (args.state.finishing) {
          return;
        }

        const checkResult = checkBodyJson(bodyJson);
        if (checkResult.type === 'invalid') {
          return finishWithInvalidBody(args, coding, checkResult);
        }

        const body = checkResult.parsed;
        args.resp.statusCode = 200;
        args.resp.statusMessage = 'OK';
        args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
        args.resp.setHeader('Content-Encoding', coding);
        args.resp.setHeader('Content-Type', 'application/json; charset=utf-8');

        return finishWithEncodedServerResponse(
          args,
          coding,
          Readable.from(
            Buffer.from(
              JSON.stringify({
                pong: body.message,
              }) + '\n',
              'utf-8'
            )
          )
        );
      }
    }),
  docs: [
    {
      templatedRelativePath: '/hello_world',
      getSitemapEntries: (_, pump) => pump([]),
      pathItem: {
        get: {
          tags: ['example'],
          summary: 'Example GET route',
          description:
            'This route can be used to test your ability to connect to the server, ' +
            'usually for testing http protocols or content negotiation.',
          operationId: 'management_helloWorldGet',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json; charset=utf-8': {
                  schema: {
                    type: 'object',
                    required: ['message'],
                    properties: {
                      message: {
                        type: 'string',
                        format: 'string',
                        summary: 'Contains the literal value "Hello, world!"',
                        enum: ['Hello, world!'],
                      },
                    },
                  },
                  examples: {
                    basic: {
                      value: {
                        message: 'Hello, world!',
                      },
                    },
                  },
                } as OASMediaType,
              },
            },
          },
        },
        post: {
          tags: ['example'],
          summary: 'Example POST route',
          description:
            'This route can be used to test your ability to submit a request body to the server, ' +
            'usually for testing e.g., what encodings you can send in a request body.\n\n```bash\n' +
            '$ echo \'{"message":"look at this nifty double compressed request"}\' \\\n' +
            '  | gzip \\\n' +
            '  | curl https://oseh.io/shared/management/hello_world \\\n' +
            '    -H "Content-Type: application/json; charset=utf8" \\\n' +
            '    -H "Content-Encoding: gzip" \\\n' +
            '    -H "Accept-Encoding: gzip" \\\n' +
            '    --data-binary @- --silent \\\n' +
            '  | gunzip\n' +
            '{"pong":"look at this nifty double compressed request"}\n' +
            '```',
          operationId: 'management_helloWorldPost',
          requestBody: {
            description: 'The message to send back to the client',
            content: {
              'application/json; charset=utf-8': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: {
                      type: 'string',
                      format: 'string',
                      summary: 'The message to send back to the client',
                      maxLength: 255,
                    },
                  },
                },
                examples: {
                  basic: {
                    value: {
                      message: 'Hello, world!',
                    },
                  },
                },
              },
            },
          } as OASRequestBody,
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json; charset=utf-8': {
                  schema: {
                    type: 'object',
                    required: ['pong'],
                    properties: {
                      pong: {
                        type: 'string',
                        format: 'string',
                        summary: 'The message provided by the client',
                        maxLength: 255,
                      },
                    },
                  },
                  examples: {
                    basic: {
                      value: {
                        pong: 'Hello, world!',
                      },
                    },
                  },
                } as OASMediaType,
              },
            },
            '400': {
              summary: 'Bad Request',
              description: 'Missing or malformed request body',
            },
            '422': {
              summary: 'Unprocessable Entity',
              description: 'Request body does not match schema',
              content: {
                'application/json; charset=utf-8': {
                  schema: {
                    type: 'object',
                    required: ['error'],
                    properties: {
                      error: {
                        type: 'string',
                        format: 'string',
                        summary: 'The error message',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      } as OASPathItem,
    },
  ],
};

type HelloWorldPostBody = {
  message: string;
};

function checkBodyJson(raw: JSONValue | undefined): CheckBodyResult<HelloWorldPostBody> {
  if (raw === undefined) {
    return {
      type: 'invalid',
      category: 400,
      error: 'Request body must be present',
    };
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      type: 'invalid',
      category: 422,
      error: 'Request body must be a JSON object',
    };
  }

  const message = raw['message'];
  if (typeof message !== 'string') {
    return {
      type: 'invalid',
      category: 422,
      error: 'body.message must be a string',
    };
  }

  if (message.length > 255) {
    return {
      type: 'invalid',
      category: 422,
      error: 'body.message must be at most 255 characters',
    };
  }

  return {
    type: 'valid',
    parsed: raw as HelloWorldPostBody,
  };
}

type CheckBodyResult<T> =
  | {
      type: 'valid';
      parsed: T;
    }
  | {
      type: 'invalid';
      category: 400 | 422;
      error: string;
    };

function finishWithInvalidBody(
  args: RouteBodyArgs,
  encoding: AcceptableEncoding,
  err: { type: 'invalid'; category: 400 | 422; error: string }
): Promise<void> {
  args.resp.statusCode = err.category;
  args.resp.statusMessage = err.category === 400 ? 'Bad Request' : 'Unprocessable Entity';
  args.resp.setHeader('Content-Type', 'application/json; charset=utf-8');
  args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
  args.resp.setHeader('Content-Encoding', encoding);
  return finishWithEncodedServerResponse(
    args,
    encoding,
    Readable.from(
      Buffer.from(
        JSON.stringify({
          error: err.error,
        })
      )
    )
  );
}

export default helloWorldRoute;
