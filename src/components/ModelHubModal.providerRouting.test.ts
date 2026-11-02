import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveModelHubInitialProvider, shouldLoadModelHubDirectory } from './ModelHubModal';

const source = readFileSync(new URL('./ModelHubModal.tsx', import.meta.url), 'utf8');

describe('ModelHubModal initial provider routing', () => {
  it('keeps the default Civitai directory when no provider was passed', () => {
    expect(resolveModelHubInitialProvider()).toBe('civitai');
  });

  it.each(['openai_compat', 'grok_compat', 'agnes'])('%s has no automatic directory target', (provider) => {
    expect(resolveModelHubInitialProvider(provider)).toBeNull();
  });

  it('does not redirect an unknown non-empty provider to Civitai', () => {
    expect(resolveModelHubInitialProvider('future_custom_provider')).toBeNull();
  });

  it('keeps an explicitly supported provider as the initial directory', () => {
    expect(resolveModelHubInitialProvider('replicate')).toBe('replicate');
  });

  it('blocks automatic reloads until a concrete provider tab is selected', () => {
    expect(shouldLoadModelHubDirectory('openai_compat')).toBe(false);
    expect(shouldLoadModelHubDirectory('openai_compat', true)).toBe(true);
    expect(shouldLoadModelHubDirectory(null)).toBe(true);
  });

  it('shows the no-directory notice and returns before loading another provider', () => {
    const unsupportedBranch = source.slice(
      source.indexOf('if (!targetProvider && initialProvider)'),
      source.indexOf('setUnsupportedDirectoryProvider(null);', source.indexOf('if (!targetProvider && initialProvider)')),
    );
    expect(unsupportedBranch).toContain('setUnsupportedDirectoryProvider(initialProvider)');
    expect(unsupportedBranch).toContain('return;');
    expect(unsupportedBranch).not.toContain('loadModels(');
    expect(source).toContain('当前模型中心没有 {friendlyProviderLabel(unsupportedDirectoryProvider)} 的对应目录，未请求其他提供商目录。');
    expect(source).toContain('setUnsupportedDirectoryProvider(null);\n    setActiveProvider(newProv);');
    expect(source).toContain('if (!shouldLoadModelHubDirectory(unsupportedDirectoryProvider, explicitlySelectedProvider)) return;');
    expect(source).toContain("if (unsupportedDirectoryProvider && newProv === 'all') return;");
  });
});
