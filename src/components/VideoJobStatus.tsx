import React from 'react';

const STATUS_ENDPOINT = '/api/video/status';
const CANCEL_ENDPOINT = '/api/video/cancel';

/**
 * Live status for one running video job. Its own component so a test that calls
 * NodeItem as a plain function never runs this hook.
 */
export function VideoJobStatus({ provider, nodeId, onUpdate }: {
  provider: string;
  nodeId?: string;
  onUpdate: (key: string, value: string) => void;
}) {
  const [line, setLine] = React.useState('已提交，等待上游状态。');
  const job = React.useRef<{ jobId: string }>({ jobId: '' });

  const show = (text: string) => {
    setLine(text);
    onUpdate('videoStatusText', text);
  };

  React.useEffect(() => {
    if (!provider && !nodeId) return;
    let stopped = false;
    const tick = async () => {
      const params = new URLSearchParams();
      if (job.current.jobId) params.set('jobId', job.current.jobId);
      else if (nodeId) params.set('nodeId', nodeId);
      else if (provider) params.set('provider', provider);
      const url = `${STATUS_ENDPOINT}?${params.toString()}`;
      let response: Response;
      try {
        response = await fetch(url);
      } catch (error: any) {
        if (stopped) return;
        show(`状态读取失败：${error?.message || error}（${STATUS_ENDPOINT}）`);
        return;
      }
      if (stopped) return;
      const raw = await response.text();
      if (stopped) return;
      let body: any;
      try {
        body = JSON.parse(raw);
      } catch {
        show(`HTTP ${response.status} ${raw.slice(0, 200)}（${STATUS_ENDPOINT}）`);
        return;
      }
      if (!response.ok) {
        show(String(body.error || `HTTP ${response.status} ${raw.slice(0, 200)}（${STATUS_ENDPOINT}）`));
        return;
      }
      if (body.text) setLine(String(body.text));
      if (body.jobId) job.current.jobId = String(body.jobId);
    };
    void tick();
    const timer = setInterval(tick, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [provider, nodeId]);

  return (
    <div className="mx-3 mt-2 space-y-1" data-testid="video-job-status">
      <p className="text-[11px] text-cyan-100" data-testid="video-job-status-line">{line}</p>
      <button type="button" className="text-[11px] text-rose-200 underline" onClick={async (event) => {
        event.stopPropagation();
        if (!job.current.jobId) { show('还没有上游任务号，无法取消。'); return; }
        try {
          const response = await fetch(CANCEL_ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, jobId: job.current.jobId }),
          });
          const raw = await response.text();
          let body: any = {};
          try { body = JSON.parse(raw); } catch { /* verbatim below */ }
          show(response.ok
            ? `已向 ${provider} 发送取消。上游 ${response.status}。`
            : String(body.error || `取消失败 HTTP ${response.status} ${raw.slice(0, 200)}`));
        } catch (error: any) {
          show(`取消失败：${error?.message || error}（${CANCEL_ENDPOINT}）`);
        }
      }}>停止这个视频任务</button>
    </div>
  );
}
