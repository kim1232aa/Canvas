import { describe, it, expect } from 'vitest';
import { fetchSchemaProviderRows } from './schemaProviders';

describe('Novita LoRA catalog follows official cursor pagination (fake network)', () => {
  it('passes pagination.cursor and returns next_cursor', async () => {
    const urls: string[] = [];
    const read = (async (url: string) => { urls.push(url); return { data: { models: [], pagination: { next_cursor: 'c_NEXT' } } }; }) as any;
    const first: any = await fetchSchemaProviderRows('novita' as any, read, { lora: true });
    expect(urls[0]).toContain('pagination.limit=100');
    expect(urls[0]).not.toContain('pagination.cursor');
    expect(first.nextCursor).toBe('c_NEXT');
    const second: any = await fetchSchemaProviderRows('novita' as any, read, { lora: true, cursor: 'c_NEXT' });
    expect(urls[1]).toContain('pagination.cursor=c_NEXT');
    expect(second.nextCursor).toBeNull();
  });
});
