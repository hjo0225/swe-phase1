import { describe, expect, it, vi } from 'vitest';
import type { VaultTree } from '../../../shared/ipc/notes';
import { OrganizeService } from '../application/organize-service';
import { organizeIpcHandlers } from './organize.ipc';

const id = '11111111-1111-4111-8111-111111111111';
const tree: VaultTree = {
  folders: [],
  notes: [{ id, title: '회의', path: '회의.md', folder: '', preview: '', updatedAt: '' }],
};
const handlers = organizeIpcHandlers(
  new OrganizeService({
    notes: () => ({ tree: () => tree, move: vi.fn(), rename: vi.fn(), importFile: vi.fn() }),
    folders: () => ({ create: vi.fn() }),
    activeLLM: {
      resolve: () => {
        throw new Error('the AI is not used in these tests');
      },
    },
  }),
);
const call = (channel: string, request: unknown) => handlers[channel]!(request);

describe('organizeIpcHandlers', () => {
  it('exposes the organize channels', () => {
    expect(Object.keys(handlers).sort()).toEqual(['organize:apply', 'organize:import', 'organize:place', 'organize:preview']);
  });

  it('places a note through an envelope', async () => {
    await expect(call('organize:place', { id })).resolves.toEqual({ ok: true, data: { folder: '', updatedNoteIds: [] } });
  });

  it('previews too few notes without calling the AI', async () => {
    await expect(call('organize:preview', { folder: '' })).resolves.toMatchObject({ ok: true, data: { skipped: 'TOO_FEW_NOTES' } });
  });

  it('rejects malformed requests', async () => {
    await expect(call('organize:place', { id: 'nope' })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    await expect(call('organize:import', { sourcePath: '', folder: '' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await expect(call('organize:apply', { folder: '' })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });
});
