import { parseContentType } from './contentType';
import { BAD_REQUEST_MESSAGE } from './errors';

test('undefined', () => {
  expect(parseContentType(undefined)).toEqual(undefined);
});

test('empty array', () => {
  expect(parseContentType([])).toEqual(undefined);
});

test('empty string', () => {
  expect(() => parseContentType('')).toThrow(BAD_REQUEST_MESSAGE);
});

test('*', () => {
  expect(() => parseContentType('*')).toThrow(BAD_REQUEST_MESSAGE);
});

test('text/plain', () => {
  expect(parseContentType('text/plain')).toEqual({
    type: 'text',
    subtype: 'plain',
    parameters: {},
  });
});

test('text/plain; charset=ascii', () => {
  expect(parseContentType('text/plain; charset=ascii')).toEqual({
    type: 'text',
    subtype: 'plain',
    parameters: {
      charset: 'ascii',
    },
  });
});

test('text/plain; CHARSET=ASCII', () => {
  expect(parseContentType('text/plain; CHARSET=ASCII')).toEqual({
    type: 'text',
    subtype: 'plain',
    parameters: {
      charset: 'ascii',
    },
  });
});

// this is not allowed by the spec
test('text/plain; charset = ascii', () => {
  expect(() => parseContentType('text/plain; charset = ascii')).toThrow(BAD_REQUEST_MESSAGE);
});

test('text/plain; charset=ascii; param2=stuff', () => {
  expect(parseContentType('text/plain; charset=ascii; param2=stuff')).toEqual({
    type: 'text',
    subtype: 'plain',
    parameters: {
      charset: 'ascii',
      param2: 'stuff',
    },
  });
});
