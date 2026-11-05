import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Copy, Check, Settings } from 'lucide-react';

interface NodeErrorDisclosureProps {
  errorMessage: string;
  provider?: string;
  endpoint?: string;
  statusCode?: number | string;
  errorAt?: string;
  onOpenSettings?: (providerId?: string) => void;
}

/**
 * Formats a clean, factual headline from upstream error text.
 * Project iron rule: NEVER invent a diagnosis the upstream did not make!
 * Strictly: provider + HTTP status (if parsed) + first line of the verbatim body.
 */
export function summarizeErrorMessage(rawMessage: string, providerHint?: string): {
  headline: string;
  isMissingKey: boolean;
  isBalanceIssue: boolean;
  provider?: string;
  statusCode?: number;
} {
  const text = String(rawMessage || '').trim();
  const lower = text.toLowerCase();

  // Extract HTTP status code if present in the message text
  const httpMatch = text.match(/HTTP\s+(\d{3})/i) || text.match(/\b(400|401|402|403|404|422|429|500|502|503|504)\b/);
  const statusCode = httpMatch ? parseInt(httpMatch[1], 10) : undefined;

  // First non-empty line of the verbatim body
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) || text;

  const prov = providerHint ? providerHint.trim() : undefined;
  const provPrefix = prov ? `【${prov}】` : '';

  // Project rule: strictly "provider + HTTP status (if parsed) + first line of the verbatim body"
  // Never replace raw errors with guessed diagnoses!
  let headline = '';
  if (firstLine.includes(`HTTP ${statusCode}`) || (statusCode && firstLine.startsWith(String(statusCode)))) {
    headline = `${provPrefix}${firstLine}`;
  } else if (statusCode) {
    headline = `${provPrefix}HTTP ${statusCode}: ${firstLine}`;
  } else {
    headline = `${provPrefix}${firstLine}`;
  }

  // Pure factual flags for actions (e.g. settings button)
  const isMissingKey = statusCode === 401 || lower.includes('未配置') || lower.includes('invalid_api_key');
  const isBalanceIssue = statusCode === 402 || lower.includes('insufficient credits') || lower.includes('not_enough_balance');

  return { headline, isMissingKey, isBalanceIssue, provider: prov, statusCode };
}

export const NodeErrorDisclosure: React.FC<NodeErrorDisclosureProps> = ({
  errorMessage,
  provider,
  endpoint,
  statusCode,
  errorAt,
  onOpenSettings,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const { headline, isMissingKey, provider: detectedProvider } = summarizeErrorMessage(errorMessage, provider);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const diagnostic = [
      `服务商: ${detectedProvider || '未指定'}`,
      endpoint ? `端点: ${endpoint}` : null,
      statusCode ? `状态码: ${statusCode}` : null,
      errorAt ? `发生时间: ${errorAt}` : null,
      `--- 原始报错信息 ---`,
      errorMessage,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(diagnostic).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="mx-3 mt-2 p-2.5 bg-rose-950/40 border border-rose-800/70 rounded-xl text-[11px] text-rose-100 leading-relaxed shadow-lg select-text"
      data-testid="node-error-strip"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1.5" data-testid="node-error-banner">
          {/* Factual Headline: Provider + HTTP Status + First line of verbatim body */}
          <div className="font-semibold text-rose-200 text-xs flex items-center justify-between gap-2">
            <span className="leading-snug [overflow-wrap:anywhere]">{headline}</span>
            {isMissingKey && onOpenSettings && (
              <button
                type="button"
                onClick={() => onOpenSettings(detectedProvider?.toLowerCase())}
                className="shrink-0 px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-[10px] font-medium flex items-center gap-1 transition-colors"
                title="打开设置并定位到该服务商"
              >
                <Settings className="w-3 h-3" />
                <span>去配置密钥</span>
              </button>
            )}
          </div>

          {/* Verbatim error headline for backward compatibility and transparency */}
          <div className="[overflow-wrap:anywhere] whitespace-pre-wrap text-[11px] text-rose-300/90 font-mono bg-black/40 p-2 rounded-lg border border-rose-900/50" data-testid="node-error-headline">
            {errorMessage}
          </div>

          {/* Progressive Disclosure Toggle */}
          <div className="pt-1 flex items-center justify-between border-t border-rose-900/40">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>{isExpanded ? '收起完整请求与技术细节' : '展开完整技术诊断细节'}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-rose-900/30"
              title="复制完整报错信息便于排查"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? '已复制诊断信息' : '复制诊断信息'}</span>
            </button>
          </div>

          {/* Expanded Progressive Details: Only render rows when facts are available (no empty rows!) */}
          {isExpanded && (
            <div className="mt-2 pt-2 border-t border-rose-900/40 space-y-1.5 font-mono text-[10px] text-slate-300 animate-in fade-in duration-150">
              {detectedProvider && (
                <div className="flex items-center justify-between" data-testid="error-disclosure-provider">
                  <span className="text-slate-400">调用服务商:</span>
                  <span className="text-cyan-300 font-semibold">{detectedProvider}</span>
                </div>
              )}
              {endpoint && (
                <div className="flex items-center justify-between" data-testid="error-disclosure-endpoint">
                  <span className="text-slate-400">请求端点:</span>
                  <span className="text-slate-200 break-all">{endpoint}</span>
                </div>
              )}
              {statusCode != null && String(statusCode).trim() !== '' && (
                <div className="flex items-center justify-between" data-testid="error-disclosure-status">
                  <span className="text-slate-400">HTTP 状态码:</span>
                  <span className="text-rose-400 font-bold">{statusCode}</span>
                </div>
              )}
              {errorAt && (
                <div className="flex items-center justify-between" data-testid="error-disclosure-time">
                  <span className="text-slate-400">发生时间:</span>
                  <span className="text-slate-400">{new Date(errorAt).toLocaleString()}</span>
                </div>
              )}
              <div className="text-slate-400 pt-1">原始完整上游响应:</div>
              <pre className="p-2 rounded bg-black/60 border border-slate-800 text-[10px] leading-relaxed text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto" data-testid="error-disclosure-body">
                {errorMessage}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
