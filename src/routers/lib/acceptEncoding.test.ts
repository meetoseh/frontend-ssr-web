import { parseAcceptEncoding, selectEncoding } from './acceptEncoding';

test('missing accept-encoding is catchall', () => {
  expect(parseAcceptEncoding(undefined)).toEqual([{ identifier: '*', quality: 1 }]);
});

test('empty accept-encoding is identity', () => {
  expect(parseAcceptEncoding('')).toEqual([{ identifier: 'identity', quality: 1 }]);
});

test('empty array accept-encoding is catchall', () => {
  expect(parseAcceptEncoding([])).toEqual([{ identifier: '*', quality: 1 }]);
});

test('simple single encoding', () => {
  expect(parseAcceptEncoding('gzip')).toEqual([{ identifier: 'gzip', quality: 1 }]);
});

test('simple identity encoding', () => {
  expect(parseAcceptEncoding('identity')).toEqual([{ identifier: 'identity', quality: 1 }]);
});

test('simple catchall encoding', () => {
  expect(parseAcceptEncoding('*')).toEqual([{ identifier: '*', quality: 1 }]);
});

test('simple multiple encodings', () => {
  expect(parseAcceptEncoding('gzip, deflate')).toEqual([
    { identifier: 'gzip', quality: 1 },
    { identifier: 'deflate', quality: 1 },
  ]);
});

test('single with quality', () => {
  expect(parseAcceptEncoding('gzip;q=0.8')).toEqual([{ identifier: 'gzip', quality: 0.8 }]);
});

test('multiple with quality', () => {
  expect(parseAcceptEncoding('gzip;q=0.8, deflate;q=0.6')).toEqual([
    { identifier: 'gzip', quality: 0.8 },
    { identifier: 'deflate', quality: 0.6 },
  ]);
});

test('invalid quality is identity', () => {
  expect(parseAcceptEncoding('gzip;q=0.0001')).toEqual([{ identifier: 'identity', quality: 1 }]);
});

test('mixed quality and non-quality', () => {
  expect(parseAcceptEncoding('gzip;q=0.8, deflate')).toEqual([
    { identifier: 'gzip', quality: 0.8 },
    { identifier: 'deflate', quality: 1 },
  ]);
});

test('acceptable and unacceptable', () => {
  expect(parseAcceptEncoding('gzip;q=1.0, identity; q=0.5, *;q=0')).toEqual([
    { identifier: 'gzip', quality: 1.0 },
    { identifier: 'identity', quality: 0.5 },
    { identifier: '*', quality: 0 },
  ]);
});

test('select simple', () => {
  expect(selectEncoding(parseAcceptEncoding('gzip'))).toEqual('gzip');
});

test('select from catchall', () => {
  expect(selectEncoding(parseAcceptEncoding('*'))).toEqual('br');
});

test('select with quality', () => {
  expect(selectEncoding(parseAcceptEncoding('identity;q=0.5, gzip;q=0.75'))).toEqual('gzip');
});

test('select with unacceptable', () => {
  expect(selectEncoding(parseAcceptEncoding('*;q=0.5, br;q=0'))).toEqual('gzip');
});

test('select with unacceptable catchall', () => {
  expect(selectEncoding(parseAcceptEncoding('*;q=0, identity'))).toEqual('identity');
});
