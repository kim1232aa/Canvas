import {describe, it, expect} from 'vitest';
import {loadWorkspaceCache, stripInlineMedia, saveWorkspaceCache, BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY} from './workspaceCache';

describe('workspace reload', () => {
  const board = (id: string) => ({id, name: id, description: '', updatedAt: 1, nodes: [{id: 'saved-node'}] as any, connections: [], spatialFrames: []});
  it('restores the selected saved board instead of replacing it with a preset', () => {
    const storage = {getItem: (key: string) => key === BOARDS_KEY ? JSON.stringify([board('one'), board('two')]) : key === ACTIVE_BOARD_KEY ? 'two' : null};
    expect(loadWorkspaceCache([board('default')], storage).active).toEqual(board('two'));
  });
  it('keeps legacy saved boards when no selected-board key exists', () => {
    expect(loadWorkspaceCache([board('default')], {getItem: key => key === BOARDS_KEY ? JSON.stringify([board('legacy')]) : null}).active.id).toBe('legacy');
  });
  it('recovers from malformed cache without treating it as a saved project', () => {
    expect(loadWorkspaceCache([board('default')], {getItem: () => '{broken'}).active.id).toBe('default');
  });
});

describe('browser cache never carries inline media', () => {
  const big = 'data:image/png;base64,' + 'A'.repeat(5000);
  it('drops data: media but keeps server URLs, prompts and parameters', () => {
    const out = stripInlineMedia({nodes: [{id: 'n', outputData: big, values: {image_url: big, prompt: 'data: not media', url: '/api/media/' + 'a'.repeat(64)}}], spatialFrames: [{imageUrl: big, referenceImageUrl: 'https://x/y.png'}]});
    expect(out.nodes[0].outputData).toBeUndefined();
    expect(out.nodes[0].values.image_url).toBe('');
    expect(out.nodes[0].values.prompt).toBe('data: not media');
    expect(out.nodes[0].values.url).toBe('/api/media/' + 'a'.repeat(64));
    expect(out.spatialFrames[0].imageUrl).toBeUndefined();
    expect(out.spatialFrames[0].referenceImageUrl).toBe('https://x/y.png');
  });
  it('does not mutate the live board state', () => {
    const live = {nodes: [{id: 'n', outputData: big, values: {}}]};
    stripInlineMedia(live);
    expect(live.nodes[0].outputData).toBe(big);
  });
  it('saves a stripped copy and reports the storage failure instead of hiding it', () => {
    const written: Record<string, string> = {};
    const storage = {setItem: (k: string, v: string) => {written[k] = v;}};
    const board = {id: 'b', name: 'b', description: '', updatedAt: 1, nodes: [{id: 'n', outputData: big, values: {}}] as any, connections: [], spatialFrames: []};
    saveWorkspaceCache([board], 'b', 'graph', storage);
    expect(written[BOARDS_KEY]).not.toContain('data:image');
    expect(written[ACTIVE_BOARD_KEY]).toBe('b');
    expect(written[MODE_KEY]).toBe('graph');
    expect(() => saveWorkspaceCache([board], 'b', 'graph', {setItem: () => {throw new Error('QuotaExceededError');}})).toThrow('QuotaExceededError');
  });
  it('cleans legacy cached boards when loading', () => {
    const storage = {getItem: (key: string) => key === BOARDS_KEY ? JSON.stringify([{id: 'one', name: 'one', description: '', updatedAt: 1, nodes: [{id: 'n', outputData: big, values: {}}], connections: [], spatialFrames: []}]) : null};
    expect(loadWorkspaceCache([], storage).active.nodes[0].outputData).toBeUndefined();
  });
});
