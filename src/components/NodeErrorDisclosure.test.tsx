// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NodeErrorDisclosure } from './NodeErrorDisclosure';
import { NodeItem } from './NodeItem';
import * as trace from '../services/executionTrace';
import { NODE_DEFINITIONS } from '../constants/nodes';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('NodeErrorDisclosure authentication actions', () => {
  it.each([
    { errorKind: 'missing-key' as const, statusCode: undefined, message: 'Credentials absent from local settings' },
    { errorKind: undefined, statusCode: 401, message: 'Unauthorized' },
  ])('opens the exact provider for $errorKind / $statusCode', async ({ errorKind, statusCode, message }) => {
    const onOpenSettings = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<NodeErrorDisclosure errorMessage={message} provider="wavespeed" errorKind={errorKind} statusCode={statusCode} onOpenSettings={onOpenSettings} />);
      });
      const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('去配置密钥'));
      expect(button).toBeDefined();
      await act(async () => { button!.click(); });
      expect(onOpenSettings).toHaveBeenCalledWith('wavespeed');
      const expand = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('展开完整技术诊断细节'));
      await act(async () => { expand!.click(); });
      expect(container.querySelector('[data-testid="error-disclosure-status"]')?.textContent).toBe(statusCode ? 'HTTP 状态码:401' : undefined);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it.each([undefined, 500, 402])('never guesses missing-key from message text with status %s', statusCode => {
    const message = '未配置 wavespeed 的密钥 / invalid_api_key';
    const html = renderToStaticMarkup(<NodeErrorDisclosure errorMessage={message} provider="wavespeed" statusCode={statusCode} onOpenSettings={() => {}} />);
    expect(html).not.toContain('去配置密钥');
    expect(html).toContain(message);
  });
});

describe('NodeItem error attribution', () => {
  const renderNode = (errorFields: Record<string, unknown> = {}) => renderToStaticMarkup(<NodeItem
    node={{ id: 'own-node', type: 'KSampler', title: 'Sampler', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: NODE_DEFINITIONS.KSampler.defaultValues, state: 'error', errorMessage: 'Local credentials are absent', ...errorFields } as any}
    isSelected={false} zoom={1} currentProvider="wavespeed" onSelect={() => {}} onStartDrag={() => {}} onUpdateValue={() => {}} onDeleteNode={() => {}} onToggleCollapse={() => {}} onToggleBypass={() => {}} onStartConnecting={() => {}} onEndConnecting={() => {}} onOpenSettings={() => {}}
  />);

  it('passes the node explicit missing-key kind without borrowing an HTTP status', () => {
    const html = renderNode({ errorKind: 'missing-key' });
    expect(html).toContain('去配置密钥');
    expect(html).not.toContain('HTTP 401');
  });

  it('does not borrow another node or another run HTTP status and endpoint', () => {
    const spy = vi.spyOn(trace, 'getExecutions').mockReturnValue([
      { state: 'error', category: 'generation', route: '/other-node', status: 401, runTarget: 'Other node', response: { upstreamStatus: 401, endpoint: '/other-node' } },
    ] as any);
    try {
      const html = renderNode();
      expect(html).not.toContain('去配置密钥');
      expect(html).not.toContain('HTTP 401');
      expect(html).not.toContain('/other-node');
      expect(renderNode({ errorStatusCode: 402, errorEndpoint: '/own-node' })).toContain('HTTP 402');
    } finally { spy.mockRestore(); }
  });
});
