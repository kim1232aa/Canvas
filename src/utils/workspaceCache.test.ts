import {describe, it, expect} from 'vitest';
import {loadWorkspaceCache, BOARDS_KEY, ACTIVE_BOARD_KEY} from './workspaceCache';

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
