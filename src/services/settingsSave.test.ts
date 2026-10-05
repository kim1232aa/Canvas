import {it, expect, vi} from 'vitest';
import {saveKeysLocalFirst} from './settingsSave';

it('saves browser-local keys even when cloud sync fails, and surfaces the verbatim error', async () => {
  const saveLocal = vi.fn();
  const syncCloud = vi.fn().mockResolvedValue({ok: false, status: 503, error: '服务端未配置 CANVAS_ADMIN_TOKEN，拒绝访问'});
  const result = await saveKeysLocalFirst({saveLocal, syncCloud});
  expect(saveLocal).toHaveBeenCalledTimes(1);
  expect(result.localSaved).toBe(true);
  expect(result.cloud.ok).toBe(false);
  expect(result.cloud.error).toBe('服务端未配置 CANVAS_ADMIN_TOKEN，拒绝访问');
});

it('saves locally first and reports success when cloud sync succeeds', async () => {
  const order: string[] = [];
  const saveLocal = vi.fn(() => { order.push('local'); });
  const syncCloud = vi.fn(async () => { order.push('cloud'); return {ok: true}; });
  const result = await saveKeysLocalFirst({saveLocal, syncCloud});
  expect(order).toEqual(['local', 'cloud']);
  expect(result.cloud.ok).toBe(true);
});

it('does not swallow a cloud sync exception — local stays saved, error propagates verbatim', async () => {
  const saveLocal = vi.fn();
  const syncCloud = vi.fn().mockRejectedValue(new Error('HTTP 401: 缺少 Authorization 请求头'));
  await expect(saveKeysLocalFirst({saveLocal, syncCloud})).rejects.toThrow('HTTP 401: 缺少 Authorization 请求头');
  expect(saveLocal).toHaveBeenCalledTimes(1);
});
