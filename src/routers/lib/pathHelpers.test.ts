import { templatedPath } from './pathHelpers';

test('simple uid', () => {
  const [path, extracted] = templatedPath(['/', 'uid', '/']);
  const realizedPath = path('https://example.com');
  const realizedExtracted = extracted('https://example.com');

  expect(realizedPath('https://example.com/oseh_u_test/')).toBe(true);
  expect(realizedPath('https://example.com/oseh_u_test')).toBe(false);
  expect(realizedPath('https://example.com/oseh_u_test/?')).toBe(false);
  expect(realizedExtracted('https://example.com/oseh_u_test/')).toEqual(['oseh_u_test']);
});

test('simple uint32', () => {
  const [path, extracted] = templatedPath(['/', 'uint32', '/']);
  const realizedPath = path('https://example.com');
  const realizedExtracted = extracted('https://example.com');

  expect(realizedPath('https://example.com/123/')).toBe(true);
  expect(realizedPath('https://example.com/123')).toBe(false);
  expect(realizedPath('https://example.com/123/?')).toBe(false);
  expect(realizedPath('https://example.com/023/')).toBe(false);
  expect(realizedPath('https://example.com/-123/')).toBe(false);
  expect(realizedPath('https://example.com/unrelated/')).toBe(false);
  expect(realizedPath('https://example.com/4294967295/')).toBe(true);
  expect(realizedPath('https://example.com/4294967296/')).toBe(false);

  expect(realizedExtracted('https://example.com/123/')).toEqual(['123']);
  expect(realizedExtracted('https://example.com/4294967295/')).toEqual(['4294967295']);
});

test('simple uint53', () => {
  const [path, extracted] = templatedPath(['/', 'uint53', '/']);
  const realizedPath = path('https://example.com');
  const realizedExtracted = extracted('https://example.com');

  expect(realizedPath('https://example.com/123/')).toBe(true);
  expect(realizedPath('https://example.com/123')).toBe(false);
  expect(realizedPath('https://example.com/123/?')).toBe(false);
  expect(realizedPath('https://example.com/023/')).toBe(false);
  expect(realizedPath('https://example.com/-123/')).toBe(false);
  expect(realizedPath('https://example.com/unrelated/')).toBe(false);
  expect(realizedPath('https://example.com/999999999999999/')).toBe(true);
  expect(realizedPath('https://example.com/9007199254740991/')).toBe(true);
  expect(realizedPath('https://example.com/9007199254740992/')).toBe(false);

  expect(realizedExtracted('https://example.com/123/')).toEqual(['123']);
  expect(realizedExtracted('https://example.com/9007199254740991/')).toEqual(['9007199254740991']);
});
