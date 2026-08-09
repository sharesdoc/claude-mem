import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as realManager from '../../../src/services/sync/ChromaMcpManager.js';

const managerSnapshot = { ...realManager };
const calls: Array<{ tool: string; args: any }> = [];
const stored = new Set<string>();
let createCollection: () => Promise<unknown> = async () => ({});

mock.module('../../../src/services/sync/ChromaMcpManager.js', () => ({
  ChromaMcpManager: {
    getInstance: () => ({
      callTool: async (tool: string, args: any) => {
        calls.push({ tool, args });
        const ids: string[] = args?.ids ?? [];
        if (tool === 'chroma_create_collection') return createCollection();
        if (tool === 'chroma_add_documents') {
          if (ids.some(id => stored.has(id))) throw new Error('IDs already exist');
          ids.forEach(id => stored.add(id));
        }
        if (tool === 'chroma_get_documents') return { ids: ids.filter(id => stored.has(id)) };
        return {};
      },
    }),
  },
}));

import { ChromaSync } from '../../../src/services/sync/ChromaSync.js';

afterAll(() => {
  mock.module('../../../src/services/sync/ChromaMcpManager.js', () => managerSnapshot);
});

beforeEach(() => {
  calls.length = 0;
  stored.clear();
  createCollection = async () => ({});
});

function initializedSync(): ChromaSync {
  const sync = new ChromaSync('project');
  (sync as any).collectionCreated = true;
  return sync;
}

describe('ChromaSync reconcile', () => {
  it('coalesces concurrent collection creation', async () => {
    const sync = new ChromaSync('project');
    let release!: () => void;
    createCollection = () => new Promise<void>(resolve => { release = resolve; });
    const attempts = Array.from({ length: 50 }, () => (sync as any).ensureCollectionExists());
    await Promise.resolve();
    expect(calls.filter(call => call.tool === 'chroma_create_collection')).toHaveLength(1);
    release();
    await Promise.all(attempts);
  });

  it('updates duplicate IDs in place and adds only new IDs', async () => {
    const sync = initializedSync();
    const add = (documents: unknown[]) => (sync as any).addDocuments(documents) as Promise<number>;
    await add([{ id: 'obs_1', document: 'v1', metadata: { sqlite_id: 1 } }]);
    calls.length = 0;

    const written = await add([
      { id: 'obs_1', document: 'v2', metadata: { sqlite_id: 1 } },
      { id: 'obs_2', document: 'new', metadata: { sqlite_id: 2 } },
    ]);

    expect(written).toBe(2);
    expect(calls.find(call => call.tool === 'chroma_update_documents')?.args.ids).toEqual(['obs_1']);
    expect(calls.filter(call => call.tool === 'chroma_add_documents').at(-1)?.args.ids).toEqual(['obs_2']);
    expect(calls.map(call => call.tool)).not.toContain('chroma_delete_documents');
  });
});
