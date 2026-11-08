// @vitest-environment jsdom
import React, { act } from 'react';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import {
  schemaChoiceFields,
  schemaFieldBadge,
  SchemaChoiceControls,
} from './SchemaChoiceControls';
import { findNsfwPolicy } from '../utils/nsfw';

describe('SchemaChoiceControls safety fields', () => {
  it('shows a declared safety field and keeps the schema default metadata on the ChoiceField', () => {
    const inputSchema = {
      properties: {
        disable_safety_checker: {
          type: 'boolean',
          title: 'Disable Safety Checker',
          description: 'Disable safety checker',
          default: false,
        },
        enable_safety_checker: {
          type: 'boolean',
          title: 'Enable Safety Checker',
          description: 'Enable safety checker',
          default: true,
        },
        random_toggle: {
          type: 'boolean',
          title: 'Random Toggle',
          default: false,
        },
      },
    };

    const fields = schemaChoiceFields(inputSchema);
    expect(fields).toHaveLength(3);

    const togetherField = fields.find((f) => f.key === 'disable_safety_checker');
    expect(togetherField?.booleanSpec).toBeDefined();
    expect(togetherField?.isNsfw).toBe(true);
    expect(togetherField?.defaultValue).toBe(false);

    const falField = fields.find((f) => f.key === 'enable_safety_checker');
    expect(falField?.isNsfw).toBe(true);
    expect(falField?.defaultValue).toBe(true);

    expect(fields.find((f) => f.key === 'random_toggle')?.isNsfw).toBe(false);
  });

  it('does not show a safety field the schema does not declare', () => {
    const fields = schemaChoiceFields({ properties: { prompt: { type: 'string' }, steps: { type: 'integer' } } });
    expect(fields.some((f) => f.isNsfw)).toBe(false);
  });

  it('badge states the value that will be sent, or that an empty field is not sent', () => {
    const policy = findNsfwPolicy('disable_safety_checker');

    expect(schemaFieldBadge(true, false, policy)).toEqual({ kind: 'send', text: '会发送 true' });
    expect(schemaFieldBadge(false, false, policy)).toEqual({ kind: 'send', text: '会发送 false' });
    expect(schemaFieldBadge(undefined, false, policy)).toEqual({
      kind: 'not_sent',
      text: '未填写，不发送（Schema 默认：false）',
    });
    expect(schemaFieldBadge(undefined, undefined, findNsfwPolicy('safe_mode'))).toEqual({
      kind: 'not_sent',
      text: '未填写，不发送（上游默认 true）',
    });
    expect(schemaFieldBadge(undefined, undefined, findNsfwPolicy('allowMatureContent'))).toEqual({
      kind: 'not_sent',
      text: '未填写，不发送（Schema 未声明默认）',
    });
  });

  it('renders the value the user set and does not quote a project rule', () => {
    const markup = renderToStaticMarkup(
      <SchemaChoiceControls
        inputSchema={{ properties: { disable_safety_checker: { type: 'boolean', default: false } } }}
        value={JSON.stringify({ disable_safety_checker: true })}
        onChange={() => {}}
      />
    );

    expect(markup).toContain('disable_safety_checker');
    expect(markup).toContain('会发送 true');
    expect(markup).not.toContain('默认开启 NSFW');
    expect(markup).not.toContain('用户原则');
    expect(markup).not.toContain('项目默认');
    expect(markup).not.toContain('默认允许成人内容');
  });

  it('publicly pre-fills permissive default on mount when the safety field is unset, and lets the user toggle back to false or not sent', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let currentValue = '{}';
    const handleChange = vi.fn((v: string) => { currentValue = v; });

    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{ properties: { disable_safety_checker: { type: 'boolean', default: false } } }}
          value={currentValue}
          onChange={handleChange}
        />
      );
    });

    expect(handleChange).toHaveBeenCalledWith(JSON.stringify({ disable_safety_checker: true }, null, 2));
    expect(container.textContent).toContain('会发送 true');
    const select = container.querySelector('select[aria-label="disable_safety_checker"]') as HTMLSelectElement;
    expect(select?.value).toBe('true');
    handleChange.mockClear();

    // Toggle to '' (not sent)
    await act(async () => {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Now has metadata marking it as omitted
    const cleared = JSON.parse(handleChange.mock.calls[0][0]);
    expect(cleared._canvas).toEqual({ nsfwOmitted: ['disable_safety_checker'] });
    expect(cleared).not.toHaveProperty('disable_safety_checker');
    currentValue = handleChange.mock.calls[0][0];

    // Re-render with the cleared value
    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{ properties: { disable_safety_checker: { type: 'boolean', default: false } } }}
          value={currentValue}
          onChange={handleChange}
        />
      );
    });

    const select2 = container.querySelector('select[aria-label="disable_safety_checker"]') as HTMLSelectElement;
    expect(select2?.value).toBe('');
    expect(container.textContent).toContain('未填写，不发送（Schema 默认：false）');

    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('persists cleared state across renders - does not re-seed after user explicitly cleared a field', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let currentValue = '{}';
    const handleChange = vi.fn((v: string) => { currentValue = v; });

    // Initial mount seeds disable_safety_checker=true
    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{ properties: { disable_safety_checker: { type: 'boolean', default: false } } }}
          value={currentValue}
          onChange={handleChange}
        />
      );
    });
    expect(handleChange).toHaveBeenCalledWith(JSON.stringify({ disable_safety_checker: true }, null, 2));
    currentValue = handleChange.mock.calls[0][0];
    handleChange.mockClear();

    // User clears it to empty
    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{ properties: { disable_safety_checker: { type: 'boolean', default: false } } }}
          value={currentValue}
          onChange={handleChange}
        />
      );
    });
    const select1 = container.querySelector('select[aria-label="disable_safety_checker"]') as HTMLSelectElement;
    await act(async () => {
      select1.value = '';
      select1.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const clearedJson = handleChange.mock.calls[0][0];
    const cleared = JSON.parse(clearedJson);
    expect(cleared._canvas).toEqual({ nsfwOmitted: ['disable_safety_checker'] });
    expect(cleared).not.toHaveProperty('disable_safety_checker');
    currentValue = clearedJson;
    handleChange.mockClear();

    // Re-render with same empty value - should NOT re-seed because metadata marks it as explicitly omitted
    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{ properties: { disable_safety_checker: { type: 'boolean', default: false } } }}
          value={currentValue}
          onChange={handleChange}
        />
      );
    });
    expect(handleChange).not.toHaveBeenCalled();
    const select2 = container.querySelector('select[aria-label="disable_safety_checker"]') as HTMLSelectElement;
    expect(select2?.value).toBe('');

    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('keeps a value the user set and does not overwrite it on mount', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const handleChange = vi.fn();
    const value = JSON.stringify({ enable_safety_checker: true, steps: 28 });

    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{ properties: { enable_safety_checker: { type: 'boolean', default: true } } }}
          value={value}
          onChange={handleChange}
        />
      );
    });

    expect(handleChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain('会发送 true');

    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('cleared state persists across unmount/remount - does not re-seed after close/reopen', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root = createRoot(container);
    let currentValue = '{}';
    const handleChange = vi.fn((v: string) => { currentValue = v; });

    // Initial mount seeds disable_safety_checker=true
    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{ properties: { disable_safety_checker: { type: 'boolean', default: false } } }}
          value={currentValue}
          onChange={handleChange}
        />
      );
    });
    expect(handleChange).toHaveBeenCalledWith(expect.stringContaining('"disable_safety_checker": true'));
    currentValue = handleChange.mock.calls[0][0];
    handleChange.mockClear();

    // Re-render to sync the component state
    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{ properties: { disable_safety_checker: { type: 'boolean', default: false } } }}
          value={currentValue}
          onChange={handleChange}
        />
      );
    });

    // User clears it
    const select1 = container.querySelector('select[aria-label="disable_safety_checker"]') as HTMLSelectElement;
    await act(async () => {
      select1.value = '';
      select1.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const clearedJson = handleChange.mock.calls[0][0];
    currentValue = clearedJson;
    expect(JSON.parse(clearedJson)._canvas).toEqual({ nsfwOmitted: ['disable_safety_checker'] });
    handleChange.mockClear();

    // Unmount (simulates closing drawer)
    await act(async () => { root.unmount(); });

    // Remount with the cleared value (simulates reopening drawer)
    root = createRoot(container);
    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{ properties: { disable_safety_checker: { type: 'boolean', default: false } } }}
          value={currentValue}
          onChange={handleChange}
        />
      );
    });

    // Should NOT re-seed because metadata marks it as explicitly omitted
    expect(handleChange).not.toHaveBeenCalled();
    const select2 = container.querySelector('select[aria-label="disable_safety_checker"]') as HTMLSelectElement;
    expect(select2?.value).toBe('');

    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('cleared field stays omitted after editing another field', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let currentValue = '{}';
    const handleChange = vi.fn((v: string) => { currentValue = v; });

    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{
            properties: {
              disable_safety_checker: { type: 'boolean', default: false },
              random_toggle: { type: 'boolean', default: false }
            }
          }}
          value={currentValue}
          onChange={handleChange}
        />
      );
    });
    currentValue = handleChange.mock.calls[handleChange.mock.calls.length - 1][0];
    handleChange.mockClear();

    // Clear disable_safety_checker
    const safetySelect = container.querySelector('select[aria-label="disable_safety_checker"]') as HTMLSelectElement;
    await act(async () => {
      safetySelect.value = '';
      safetySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    currentValue = handleChange.mock.calls[0][0];
    const afterClear = JSON.parse(currentValue);
    expect(afterClear).not.toHaveProperty('disable_safety_checker');
    expect(afterClear._canvas).toEqual({ nsfwOmitted: ['disable_safety_checker'] });
    handleChange.mockClear();

    // Edit random_toggle
    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{
            properties: {
              disable_safety_checker: { type: 'boolean', default: false },
              random_toggle: { type: 'boolean', default: false }
            }
          }}
          value={currentValue}
          onChange={handleChange}
        />
      );
    });
    const randomSelect = container.querySelector('select[aria-label="random_toggle"]') as HTMLSelectElement;
    await act(async () => {
      randomSelect.value = 'true';
      randomSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const final = JSON.parse(handleChange.mock.calls[0][0]);
    expect(final).toEqual({ random_toggle: true, _canvas: { nsfwOmitted: ['disable_safety_checker'] } });
    expect(final).not.toHaveProperty('disable_safety_checker');

    await act(async () => { root.unmount(); });
    container.remove();
  });
});

describe('ParameterInspector CivitaiAllowMatureControl', () => {
  it('preserves invalid JSON and displays parse error without overwriting', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const handleChange = vi.fn();
    const invalidJson = '{invalid json}';

    await act(async () => {
      root.render(
        <div>
          {/* CivitaiAllowMatureControl is not exported, so we import it via dynamic import for testing */}
          {React.createElement(
            (await import('./ParameterInspector')).CivitaiAllowMatureControl,
            { customParameters: invalidJson, onChangeCustom: handleChange }
          )}
        </div>
      );
    });

    expect(container.textContent).toContain('custom_parameters JSON 解析失败');
    expect(container.textContent).toContain('Expected property name');
    expect(handleChange).not.toHaveBeenCalled();

    const select = container.querySelector('select[aria-label="Civitai allowMatureContent"]') as HTMLSelectElement;
    expect(select?.disabled).toBe(true);

    await act(async () => { root.unmount(); });
    container.remove();
  });

  // Real useState-controlled parent: onChange feeds the value back like the node's saved custom_parameters.
  async function mountControlled(initial: string, saved?: { value: string }) {
    const { CivitaiAllowMatureControl } = await import('./ParameterInspector');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const writes: string[] = [];
    const state = saved ?? { value: initial };
    function Parent() {
      const [value, setValue] = React.useState(state.value);
      return React.createElement(CivitaiAllowMatureControl, {
        customParameters: value,
        onChangeCustom: (next: string) => { writes.push(next); state.value = next; setValue(next); },
      });
    }
    await act(async () => { root.render(React.createElement(Parent)); });
    const select = () => container.querySelector('select[aria-label="Civitai allowMatureContent"]') as HTMLSelectElement;
    const choose = async (v: string) => { await act(async () => { select().value = v; select().dispatchEvent(new Event('change', { bubbles: true })); }); };
    const unmount = async () => { await act(async () => { root.unmount(); }); container.remove(); };
    return { writes, state, select, choose, unmount };
  }

  it('initial false -> 不发送 stays omitted: one write, field absent, no reseed true', async () => {
    const h = await mountControlled(JSON.stringify({ allowMatureContent: false, keep: 'unchanged' }));
    expect(h.writes).toHaveLength(0);
    await h.choose('');
    expect(h.writes).toHaveLength(1);
    expect(h.select().value).toBe('');
    const saved = JSON.parse(h.state.value);
    expect(saved).toEqual({ keep: 'unchanged', _canvas: { nsfwOmitted: ['allowMatureContent'] } });
    await h.unmount();
  });

  it('seed true -> 不发送 -> remount from saved JSON stays omitted and writes nothing', async () => {
    const h1 = await mountControlled('{}');
    expect(JSON.parse(h1.state.value)).toEqual({ allowMatureContent: true });
    await h1.choose('');
    expect(h1.select().value).toBe('');
    const savedValue = h1.state.value;
    await h1.unmount();

    const h2 = await mountControlled(savedValue);
    expect(h2.writes).toHaveLength(0);
    expect(h2.select().value).toBe('');
    expect(JSON.parse(h2.state.value)).not.toHaveProperty('allowMatureContent');
    await h2.unmount();
  });

  it('choosing true after 不发送 clears the omission marker and keeps other _canvas fields', async () => {
    const h = await mountControlled(JSON.stringify({ allowMatureContent: false, _canvas: { scope: { provider: 'civitai', model: 'm' }, schemaProperties: ['prompt'] } }));
    await h.choose('');
    expect(JSON.parse(h.state.value)._canvas).toEqual({ scope: { provider: 'civitai', model: 'm' }, schemaProperties: ['prompt'], nsfwOmitted: ['allowMatureContent'] });
    await h.choose('true');
    expect(JSON.parse(h.state.value)).toEqual({ allowMatureContent: true, _canvas: { scope: { provider: 'civitai', model: 'm' }, schemaProperties: ['prompt'] } });
    await h.unmount();
  });
});
