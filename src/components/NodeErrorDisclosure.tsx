import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Copy, Check, Settings, ExternalLink } from 'lucide-react';

interface NodeErrorDisclosureProps {
  errorMessage: string;
  provider?: string;
  endpoint?: string;
  statusCode?: number | string;
  errorAt?: string;
  onOpenSettings?: (providerId?: string) => void;
}

/**
 * Extracts a concise, human-friendly summary from upstream error text.
 * Never hides, rewrites or swallows the error — the verbatim text is always accessible right below.
 */
export function summarizeErrorMessage(rawMessage: string, providerHint?: string): {
  headline: string;
  isMissingKey: boolean;
  isBalanceIssue: boolean;
  provider?: string;
} {
  const text = String(rawMessage || '').trim();
  const lower = text.toLowerCase();

  // Extract HTTP status code if present
  const httpMatch = text.match(/HTTP\s+(\d{3})/i) || text.match(/\b(400|401|402|403|404|422|429|500|502|503|504)\b/);
  const statusStr = httpMatch ? `(HTTP ${httpMatch[1]})` : '';
  const statusCode = httpMatch ? parseInt(httpMatch[1], 10) : undefined;

  // Detect missing key / unauthorized (401 or explicit unauthorized text)
  const isMissingKey =
    statusCode === 401 ||
    lower.includes('未配置') ||
    lower.includes('invalid_api_key') ||
    lower.includes('invalid api key') ||
    lower.includes('missing api key') ||
    lower.includes('authentication required') ||
    (statusCode === 403 && (lower.includes('api_key') || lower.includes('token') || lower.includes('unauthorized')));

  // Detect balance / quota / payment issue
  const isBalanceIssue =
    statusCode === 402 ||
    lower.includes('payment_required') ||
    lower.includes('insufficient credits') ||
    lower.includes('not_enough_balance') ||
    lower.includes('insufficient_balance') ||
    lower.includes('billing_balance') ||
    lower.includes('purchase pre-paid credits') ||
    lower.includes('top up your account') ||
    lower.includes('top_up') ||
    lower.includes('余额不足') ||
    lower.includes('欠费');

  const prov = providerHint || undefined;
  const provPrefix = prov ? `【${prov}】` : '';

  let headline = '';
  if (isBalanceIssue) {
    headline = `${provPrefix}账户余额不足或额度耗尽 ${statusStr}：请前往服务商充值或检查账单`;
  } else if (isMissingKey) {
    headline = `${provPrefix}API 密钥未配置或无效 ${statusStr}：请在设置中配置有效密钥`;
  } else if (statusCode === 404 || lower.includes('not found') || lower.includes('404')) {
    headline = `${provPrefix}模型或端点未找到 ${statusStr}：所选模型可能已下线或路径不正确`;
  } else if (statusCode === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    headline = `${provPrefix}请求频率超限 ${statusStr}：请稍后重试或提高服务商并发配额`;
  } else if (statusCode && statusCode >= 500 && statusCode < 600) {
    headline = `${provPrefix}上游服务暂时不可用 ${statusStr}：上游服务繁忙或正在维护`;
  } else {
    // First non-empty line of the raw message
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || text;
    headline = `${provPrefix}${firstLine}`;
  }

  return { headline, isMissingKey, isBalanceIssue, provider: prov };
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
          {/* Plain Human-friendly Summary */}
          <div className="font-semibold text-rose-200 text-xs flex items-center justify-between gap-2">
            <span className="leading-snug">{headline}</span>
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

          {/* Expanded Progressive Details */}
          {isExpanded && (
            <div className="mt-2 pt-2 border-t border-rose-900/40 space-y-1.5 font-mono text-[10px] text-slate-300 animate-in fade-in duration-150">
              {detectedProvider && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">调用服务商:</span>
                  <span className="text-cyan-300 font-semibold">{detectedProvider}</span>
                </div>
              )}
              {endpoint && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">请求端点:</span>
                  <span className="text-slate-200 break-all">{endpoint}</span>
                </div>
              )}
              {statusCode && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">HTTP 状态码:</span>
                  <span className="text-rose-400 font-bold">{statusCode}</span>
                </div>
              )}
              {errorAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">发生时间:</span>
                  <span className="text-slate-400">{new Date(errorAt).toLocaleString()}</span>
                </div>
              )}
              <div className="text-slate-400 pt-1">原始完整上游响应:</div>
              <pre className="p-2 rounded bg-black/60 border border-slate-800 text-[10px] leading-relaxed text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {errorMessage}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
