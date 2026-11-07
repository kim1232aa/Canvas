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
  it('shows a declared safety field and keeps the schema default, not the open value', () => {
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

  it('does not write custom_parameters on mount when the safety field is unset', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const handleChange = vi.fn();

    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={{ properties: { disable_safety_checker: { type: 'boolean', default: false } } }}
          value="{}"
          onChange={handleChange}
        />
      );
    });

    expect(handleChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain('未填写，不发送（Schema 默认：false）');

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
});
