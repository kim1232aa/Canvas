/**
 * fix10.1: custom model-ID field. The value is NEVER altered: the textarea holds the plain value, and the store gets
 * exactly what was typed. Break hints after '/' and '-' exist only in a read-only display layer as <wbr> elements
 * (no character in DOM text / clipboard). Click or focus the display → plain textarea (edit state).
 */
import React from 'react';

/** Splits after '/' and '-' and joins with <wbr/> — display only. */
export function withWbr(value: string): React.ReactNode[] {
  const parts = String(value).split(/(?<=[/-])/);
  return parts.flatMap((p, i) => (i < parts.length - 1 ? [p, <wbr key={`w${i}`} />] : [p]));
}

// Same box as the canvas-node textarea rule in index.css (font .875rem/1.5, padding .75rem) so display ↔ edit do not jump.
const BOX = 'w-full bg-[#0d0e12] border border-[#22242c] rounded p-3 text-[0.875rem] leading-[1.5] text-lime-300 font-mono whitespace-pre-wrap [word-break:normal] [overflow-wrap:anywhere] [hyphens:none]';

export function CustomModelIdField(props: {
  id: string; value: string; placeholder: string; title: string;
  onChange: (v: string) => void; onCommit: (v: string) => void; defaultEditing?: boolean;
}) {
  const { id, value, placeholder, title, onChange, onCommit } = props;
  const [editing, setEditing] = React.useState(!!props.defaultEditing);
  const committed = React.useRef(value);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (!editing) {
    return (
      <div
        id={id}
        role="textbox"
        aria-readonly="true"
        aria-label="自定义模型 (model)（点击编辑）"
        tabIndex={0}
        data-testid="node-custom-model-display"
        title={value || title}
        onMouseDown={stop}
        onPointerDown={stop}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
        onClick={() => setEditing(true)}
        className={`${BOX} cursor-text select-text`}
      >
        {value ? withWbr(value) : <span className="text-slate-600">{placeholder}</span>}
      </div>
    );
  }
  return (
    <textarea
      id={id}
      autoFocus
      rows={1}
      value={value}
      placeholder={placeholder}
      data-testid="node-custom-model-id"
      title={value || title}
      onMouseDown={stop}
      onPointerDown={stop}
      onFocus={(e) => { committed.current = e.currentTarget.value; }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value; if (v !== committed.current) { committed.current = v; onCommit(v); } }
        if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); }
      }}
      onBlur={(e) => { const v = e.currentTarget.value; if (v !== committed.current) onCommit(v); setEditing(false); }}
      onChange={(e) => onChange(e.target.value)}
      className={`${BOX} focus:border-lime-500 placeholder:text-slate-600 outline-none select-text cursor-text resize-none [field-sizing:content]`}
    />
  );
}
