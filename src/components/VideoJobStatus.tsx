import React from 'react';

/**
 * Live status for one running video job. Its own component so a test that calls
 * NodeItem as a plain function never runs this hook.
 */
export function VideoJobStatus({ provider, onUpdate }: {
  provider: string;
  onUpdate: (key: string, value: string) => void;
}) {
  const [line, setLine] = React.useState('已提交，等待上游状态。');
  const job = React.useRef<{ jobId: string; cancelUrl: string }>({ jobId: '', cancelUrl: '' });

  React.useEffect(() => {
    if (!provider) return;
    let stopped = false;
    const tick = async () => {
      const response = await fetch(`/api/video/status?provider=${encodeURIComponent(provider)}`).catch(() => null);
      if (!response || stopped) return;
      const body = await response.json().catch(() => null);
      if (!body || stopped) return;
      if (!response.ok) { setLine(String(body.error || `状态读取失败 HTTP ${response.status}`)); return; }
      if (body.text) setLine(String(body.text));
      if (body.jobId) job.current.jobId = String(body.jobId);
      if (body.cancelUrl) job.current.cancelUrl = String(body.cancelUrl);
    };
    void tick();
    const timer = setInterval(tick, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [provider]);

  return (
    <div className="mx-3 mt-2 space-y-1" data-testid="video-job-status">
      <p className="text-[11px] text-cyan-100" data-testid="video-job-status-line">{line}</p>
      <button type="button" className="text-[11px] text-rose-200 underline" onClick={async (event) => {
        event.stopPropagation();
        if (!job.current.jobId) { setLine('还没有上游任务号，无法取消。'); return; }
        const response = await fetch('/api/video/cancel', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, jobId: job.current.jobId, cancelUrl: job.current.cancelUrl || undefined }),
        });
        const body = await response.json().catch(() => ({}));
        const text = response.ok
          ? `已向 ${provider} 发送取消。上游 ${response.status}。`
          : String(body.error || `取消失败 HTTP ${response.status}`);
        setLine(text);
        onUpdate('videoStatusText', text);
      }}>停止这个视频任务</button>
    </div>
  );
}
