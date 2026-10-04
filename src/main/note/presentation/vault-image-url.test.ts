import { describe, expect, it } from 'vitest';
import { parseVaultImageUrl } from './vault-image-url';

describe('parseVaultImageUrl', () => {
  it('reads the note id and the original image path from a blink-vault: address', () => {
    const url = `blink-vault://image/${encodeURIComponent('note 1')}/${encodeURIComponent('images/main%20screen.png')}`;
    expect(parseVaultImageUrl(url)).toEqual({ noteId: 'note 1', src: 'images/main%20screen.png' });
  });

  it('rejects anything else', () => {
    expect(parseVaultImageUrl('blink-vault://other/a/b.png')).toBeNull();
    expect(parseVaultImageUrl('blink-vault://image/only-id')).toBeNull();
    expect(parseVaultImageUrl('https://image/a/b.png')).toBeNull();
    expect(parseVaultImageUrl('not a url')).toBeNull();
  });
});
