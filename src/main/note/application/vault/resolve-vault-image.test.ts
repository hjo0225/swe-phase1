import { describe, expect, it } from 'vitest';
import { imageTypeOf, resolveVaultImage } from './resolve-vault-image';

const files = [
  'docs/features/images/main screen.png',
  'docs/features/01-notes.md',
  'Phase 1/Poster.md',
  'assets/logo.svg',
  'assets/notes.txt',
  'deep/a/b/diagram.PNG',
];
const resolve = (src: string, noteFolder = 'docs/features') =>
  resolveVaultImage({ src, noteFolder, exists: (path) => files.includes(path), listFiles: () => files });

describe('resolveVaultImage', () => {
  it('finds an image relative to the note first, decoding %20 in the path', () => {
    expect(resolve('images/main%20screen.png')).toBe('docs/features/images/main screen.png');
    expect(resolve('images/main screen.png')).toBe('docs/features/images/main screen.png');
    expect(resolve('./images/main%20screen.png')).toBe('docs/features/images/main screen.png');
  });

  it('then relative to the vault root', () => {
    expect(resolve('assets/logo.svg', 'Phase 1')).toBe('assets/logo.svg');
  });

  it('then by file name anywhere in the vault, so an imported image still shows in another folder', () => {
    expect(resolve('images/main%20screen.png', 'Phase 1')).toBe('docs/features/images/main screen.png');
    expect(resolve('diagram.png', 'Phase 1')).toBe('deep/a/b/diagram.PNG');
  });

  it('never leaves the vault, never serves non-images, remote or absolute paths', () => {
    expect(resolve('../../../secret.png')).toBeNull();
    expect(resolve('images/../../../../x.png')).toBeNull();
    expect(resolve('C:/Windows/x.png')).toBeNull();
    expect(resolve('/etc/x.png')).toBeNull();
    expect(resolve('https://example.com/x.png')).toBeNull();
    expect(resolve('assets/notes.txt', '')).toBeNull();
    expect(resolve('01-notes.md')).toBeNull();
    expect(resolve('missing.png')).toBeNull();
  });
});

describe('imageTypeOf', () => {
  it('maps image extensions to content types', () => {
    expect(imageTypeOf('a/b.PNG')).toBe('image/png');
    expect(imageTypeOf('a.jpeg')).toBe('image/jpeg');
    expect(imageTypeOf('a.svg')).toBe('image/svg+xml');
    expect(imageTypeOf('a.md')).toBeNull();
  });
});
