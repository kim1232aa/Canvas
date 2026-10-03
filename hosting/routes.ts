import type { Express, RequestHandler } from 'express';
import { currentRequest } from './context';

const route = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export function registerStorageRoutes(app: Express) {
  app.get('/api/history', route(async (_req, res) => {
    res.json(await currentRequest().store.history());
  }));

  const deleteHistory = route(async (req, res) => {
    const store = currentRequest().store;
    const summaries = await store.summaries('history');
    let requested: string[];
    if (req.params.id) requested = [req.params.id];
    else if (req.path === '/api/history/delete-batch') {
      if (!Array.isArray(req.body?.ids) || req.body.ids.some((id: unknown) => typeof id !== 'string')) {
        res.status(400).json({error: 'ids 必须为字符串数组'}); return;
      }
      requested = req.body.ids;
    } else requested = summaries.map(item => item.id);
    const selected = new Set(requested);
    const ids = summaries.filter(item => selected.has(item.id) || selected.has(item.url) || selected.has(item.imageUrl)).map(item => item.id);
    await store.remove('history', ids);
    res.json({success: true, remaining: await store.count('history')});
  });
  app.delete('/api/history/:id', deleteHistory);
  app.post('/api/history/delete-batch', deleteHistory);
  app.delete('/api/history', deleteHistory);

  app.get('/api/cloud/projects', route(async (_req, res) => {
    res.json(await currentRequest().store.summaries('project'));
  }));
  app.get('/api/cloud/projects/:id', route(async (req, res) => {
    const item = await currentRequest().store.get('project', String(req.params.id));
    if (!item) {res.status(404).json({error: 'Project not found on server'}); return;}
    res.json(item);
  }));
  app.post('/api/cloud/projects', route(async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({error: '请求体必须为有效的 JSON 对象'}); return;
    }
    const {id, name = '未命名无限画布项目', description, canvasMode = 'spatial', transform, spatialFrames = [], nodes = [], connections = [], thumbnail} = req.body;
    if ((id !== undefined && (typeof id !== 'string' || !id || id.length > 200)) || typeof name !== 'string' || !['spatial', 'graph'].includes(canvasMode) || !Array.isArray(spatialFrames) || !Array.isArray(nodes) || !Array.isArray(connections)) {
      res.status(400).json({error: '项目名称、画布模式或节点数据格式无效'}); return;
    }
    const store = currentRequest().store;
    const projectId = id || `proj_${crypto.randomUUID()}`;
    const previous = await store.get('project', projectId);
    const now = Date.now();
    const item = await store.put('project', {
      id: projectId, name, description: description || '', canvasMode,
      transform: transform || {x: 80, y: 80, scale: 0.8}, spatialFrames, nodes, connections,
      thumbnail: thumbnail || spatialFrames?.[0]?.imageUrl || '', createdAt: previous?.createdAt || now, updatedAt: now,
    });
    res.json({success: true, project: item});
  }));
  app.delete('/api/cloud/projects/:id', route(async (req, res) => {
    const store = currentRequest().store;
    await store.remove('project', [String(req.params.id)]);
    res.json({success: true, remaining: await store.count('project')});
  }));
  app.post('/api/cloud/projects/:id/clone', route(async (req, res) => {
    const store = currentRequest().store;
    const original = await store.get('project', String(req.params.id));
    if (!original) {res.status(404).json({error: 'Source project not found'}); return;}
    const now = Date.now();
    const item = await store.put('project', {...original, id: `proj_${crypto.randomUUID()}`, name: `${original.name} (云端副本)`, createdAt: now, updatedAt: now});
    res.json({success: true, project: item});
  }));
  app.get('/api/cloud/health', route(async (_req, res) => {
    const store = currentRequest().store;
    const [projectsCount, historyCount] = await Promise.all([store.count('project'), store.count('history')]);
    res.json({status: 'online', serverType: 'ComfyCanvas Cloud Studio Server', projectsCount, historyCount, timestamp: Date.now(), authentication: 'sites-owner'});
  }));
}
