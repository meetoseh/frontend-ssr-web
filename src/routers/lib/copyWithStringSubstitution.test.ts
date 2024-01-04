import { copyWithStringSubstitution } from './copyWithStringSubstitution';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const withFiles = async (fn: (src: string, dst: string) => Promise<void> | void) => {
  const src = path.join('tmp', crypto.randomBytes(16).toString('hex'));
  const dst = path.join('tmp', crypto.randomBytes(16).toString('hex'));

  try {
    await fn(src, dst);
  } finally {
    try {
      fs.unlinkSync(src);
    } catch (e) {}

    try {
      fs.unlinkSync(dst);
    } catch (e) {}
  }
};

test('blank file', async () => {
  await withFiles(async (src, dst) => {
    fs.writeFileSync(src, '');
    await copyWithStringSubstitution(src, dst, 'a', 'b');
    expect(fs.existsSync(dst)).toBe(true);
    expect(fs.readFileSync(dst, 'utf8')).toBe('');
  });
});

test('no substitutions', async () => {
  await withFiles(async (src, dst) => {
    fs.writeFileSync(src, 'a');
    await copyWithStringSubstitution(src, dst, 'b', 'c');
    expect(fs.existsSync(dst)).toBe(true);
    expect(fs.readFileSync(dst, 'utf8')).toBe('a');
  });
});

test('just substitution', async () => {
  await withFiles(async (src, dst) => {
    fs.writeFileSync(src, 'a');
    await copyWithStringSubstitution(src, dst, 'a', 'b');
    expect(fs.existsSync(dst)).toBe(true);
    expect(fs.readFileSync(dst, 'utf8')).toBe('b');
  });
});

test('different length substitution', async () => {
  await withFiles(async (src, dst) => {
    fs.writeFileSync(src, 'a');
    await copyWithStringSubstitution(src, dst, 'a', 'bb');
    expect(fs.existsSync(dst)).toBe(true);
    expect(fs.readFileSync(dst, 'utf8')).toBe('bb');
  });
});

test('substitution in middle', async () => {
  await withFiles(async (src, dst) => {
    fs.writeFileSync(src, 'abc');
    await copyWithStringSubstitution(src, dst, 'b', 'c');
    expect(fs.existsSync(dst)).toBe(true);
    expect(fs.readFileSync(dst, 'utf8')).toBe('acc');
  });
});

test('substitution at end', async () => {
  await withFiles(async (src, dst) => {
    fs.writeFileSync(src, 'acb');
    await copyWithStringSubstitution(src, dst, 'b', 'c');
    expect(fs.existsSync(dst)).toBe(true);
    expect(fs.readFileSync(dst, 'utf8')).toBe('acc');
  });
});

test('multiple substitutions', async () => {
  await withFiles(async (src, dst) => {
    fs.writeFileSync(src, 'bbb');
    await copyWithStringSubstitution(src, dst, 'b', 'c');
    expect(fs.existsSync(dst)).toBe(true);
    expect(fs.readFileSync(dst, 'utf8')).toBe('ccc');
  });
});

test('longer substitution', async () => {
  await withFiles(async (src, dst) => {
    fs.writeFileSync(src, 'this is a test');
    await copyWithStringSubstitution(src, dst, 's a', 'snt a');
    expect(fs.existsSync(dst)).toBe(true);
    expect(fs.readFileSync(dst, 'utf8')).toBe('this isnt a test');
  });
});

test('substitution key crosses read boundary', async () => {
  await withFiles(async (src, dst) => {
    fs.writeFileSync(src, 'a'.repeat(8190) + 'bcdef' + 'a'.repeat(8190));
    await copyWithStringSubstitution(src, dst, 'bcdef', 'ghijk');
    expect(fs.existsSync(dst)).toBe(true);
    expect(fs.readFileSync(dst, 'utf8')).toBe('a'.repeat(8190) + 'ghijk' + 'a'.repeat(8190));
  });
});
