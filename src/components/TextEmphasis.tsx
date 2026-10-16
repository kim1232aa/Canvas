import React from 'react';

/**
 * trace-fix2 #13: in the canvas's OWN local-block wording, the count clause 「最多 N 个…当前 M 个」 is bold.
 * Text is rendered verbatim (no characters added or removed); only the matching span is wrapped in <strong>.
 */
export const LIMIT_CLAUSE = /(最多\s*\d+\s*个(?:\s*LoRA)?\s*[，,]\s*(?:本次|当前)\s*\d+\s*个)/;
export const EmphasizeLimit: React.FC<{ text: string }> = ({ text }) => {
  const parts = String(text ?? '').split(LIMIT_CLAUSE);
  if (parts.length === 1) return <>{text}</>;
  return <>{parts.map((p, i) => (i % 2 === 1 ? <strong key={i} data-testid="limit-clause" className="font-extrabold text-white">{p}</strong> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
};

/**
 * trace-fix2 #16: a URL that may wrap only at '/', '?', '&' boundaries — never inside a segment (e.g. not at the '-' of
 * 「krea-v2-turbo-lora」). Characters are unchanged; each segment is nowrap with a <wbr/> break opportunity after it.
 */
export const UrlNoMidBreak: React.FC<{ text: string; className?: string; testId?: string }> = ({ text, className, testId }) => {
  const pieces = String(text ?? '').split(/(?<=[?&]|[^/:]\/)/);
  return <span className={className} data-testid={testId}>{pieces.map((p, i) => <React.Fragment key={i}><span className="whitespace-nowrap">{p}</span>{i < pieces.length - 1 ? <wbr /> : null}</React.Fragment>)}</span>;
};

/**
 * fix3 O: pretty-printed JSON that may wrap only after structural chars or URL separators (/ ? &),
 * never mid-token (waves|peed, .s|afetensors).
 */
export const JsonNoMidBreak: React.FC<{ value: unknown; className?: string; testId?: string }> = ({ value, className, testId }) => {
  const raw = JSON.stringify(value ?? null, null, 2) ?? 'null';
  // Split keeping delimiters that are safe wrap points: after , or : followed by space/newline already in pretty JSON,
  // plus URL separators inside strings via UrlNoMidBreak on each line segment that looks path-like.
  const lines = raw.split('\n');
  return (
    <pre className={className} data-testid={testId}>{lines.map((line, li) => (
      <React.Fragment key={li}>{li > 0 ? '\n' : null}<JsonLine text={line} /></React.Fragment>
    ))}</pre>
  );
};

const JsonLine: React.FC<{ text: string }> = ({ text }) => {
  // Break only after / ? & inside the line; keep other characters nowrap as whole segments.
  const pieces = text.split(/(?<=[?&/])/);
  return <>{pieces.map((p, i) => <React.Fragment key={i}><span className="whitespace-nowrap">{p}</span>{i < pieces.length - 1 ? <wbr /> : null}</React.Fragment>)}</>;
};
