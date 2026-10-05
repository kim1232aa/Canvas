// 保存顺序策略：浏览器本地密钥是主存储（api.ts getStoredApiKeys 逐请求读取），
// 必须先落盘；云端同步（/api/cloud/settings，需管理令牌）是增强项。
// 云端失败不得阻塞/回滚本地保存，也不得静默吞错 —— 错误原样返回给 UI 展示。

export type CloudSyncOutcome = { ok: boolean; error?: string; status?: number };

export async function saveKeysLocalFirst(deps: {
  saveLocal: () => void;
  syncCloud: () => Promise<CloudSyncOutcome>;
}): Promise<{ localSaved: true; cloud: CloudSyncOutcome }> {
  deps.saveLocal();
  const cloud = await deps.syncCloud();
  return { localSaved: true, cloud };
}
