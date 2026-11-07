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

describe('SchemaChoiceControls & NSFW Handling', () => {
  it('identifies boolean schema properties and marks official NSFW switches', () => {
    const inputSchema = {
      properties: {
        disable_safety_checker: {
          type: 'boolean',
          title: 'Disable Safety Checker',
          description: 'Disable safety checker for Together AI',
          default: false,
        },
        enable_safety_checker: {
          type: 'boolean',
          title: 'Enable Safety Checker',
          description: 'Enable safety checker for Fal.ai',
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
    expect(togetherField).toBeDefined();
    expect(togetherField?.booleanSpec).toBeDefined();
    expect(togetherField?.isNsfw).toBe(true);
    expect(togetherField?.defaultValue).toBe(true); // project default: true (permissive)

    const falField = fields.find((f) => f.key === 'enable_safety_checker');
    expect(falField).toBeDefined();
    expect(falField?.booleanSpec).toBeDefined();
    expect(falField?.isNsfw).toBe(true);
    expect(falField?.defaultValue).toBe(false); // project default: false (permissive)

    const nonNsfwField = fields.find((f) => f.key === 'random_toggle');
    expect(nonNsfwField?.isNsfw).toBe(false);
  });

  it('generates transparent badges for NSFW permissive vs user toggle-back', () => {
    const togetherPolicy = findNsfwPolicy('disable_safety_checker');

    // Default permissive state (sent true)
    const permissiveBadge = schemaFieldBadge(true, false, togetherPolicy);
    expect(permissiveBadge.kind).toBe('nsfw_permissive');
    expect(permissiveBadge.text).toContain('会发送 true（默认开启 NSFW）');

    // User toggled back to strict filtering (sent false)
    const restrictedBadge = schemaFieldBadge(false, false, togetherPolicy);
    expect(restrictedBadge.kind).toBe('nsfw_restricted');
    expect(restrictedBadge.text).toContain('会发送 false（已开启安全过滤）');
  });

  it('renders NSFW switch with default NSFW notice and select options', () => {
    const inputSchema = {
      properties: {
        disable_safety_checker: {
          type: 'boolean',
          title: 'Disable Safety Checker',
          default: false,
        },
      },
    };

    const markup = renderToStaticMarkup(
      <SchemaChoiceControls
        inputSchema={inputSchema}
        value={JSON.stringify({ disable_safety_checker: true })}
        onChange={() => {}}
      />
    );

    expect(markup).toContain('disable_safety_checker');
    expect(markup).toContain('默认允许成人内容 (NSFW)');
    expect(markup).toContain('会发送 true（默认开启 NSFW）');
  });

  it('seeds default into custom_parameters on DOM mount via effect', async () => {
    const inputSchema = {
      properties: {
        disable_safety_checker: {
          type: 'boolean',
          title: 'Disable Safety Checker',
          default: false,
        },
      },
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const handleChange = vi.fn();

    await act(async () => {
      root.render(
        <SchemaChoiceControls
          inputSchema={inputSchema}
          value="{}"
          onChange={handleChange}
        />
      );
    });

    expect(handleChange).toHaveBeenCalled();
    const lastCallArg = handleChange.mock.calls[handleChange.mock.calls.length - 1][0];
    const parsed = JSON.parse(lastCallArg);
    expect(parsed.disable_safety_checker).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
