import React from 'react';
import { fieldOptions, getModelSpec, modelStatus, valueStatus, type GeminiSelectField } from '../schemas/providerSchema';
import { FieldStatusBadge, FIELD_STATUS_LABEL } from './FieldStatusBadge';

// aspect_ratio / image_size 下拉：选项只来自 providerSchema 中当前模型的列表。
// 首项「未选择（不传）」值为空 → 不发送。未选模型时禁用。
export const GeminiFieldSelect: React.FC<{
  model: string;
  field: GeminiSelectField;
  value: string;
  onChange: (value: string) => void;
}> = ({ model, field, value, onChange }) => {
  const spec = model ? getModelSpec('gemini', model) : undefined;
  const status = value && model ? valueStatus('gemini', model, field, value) : 'supported';
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1.5">
        <label className="text-slate-400 font-mono text-[11px]">{field}</label>
        {status !== 'supported' && <FieldStatusBadge status={status} />}
      </div>
      <select
        value={value}
        disabled={!spec}
        onMouseDown={stop}
        onPointerDown={stop}
        onKeyDown={stop}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {!spec ? (
          <option value={value}>{model ? `未能核实该模型 (${model}) 的取值表` : '请先选择模型'}</option>
        ) : (
          <>
            <option value="">未选择（不传）</option>
            {fieldOptions('gemini', model, field).map((v) => (
              // U2: unverified 取值可选；选项文字标注状态
              <option key={v.value} value={v.value}>
                {v.value}{v.status === 'unverified' ? `（${FIELD_STATUS_LABEL.unverified}）` : ''}
              </option>
            ))}
            {value && status === 'unsupported' && <option value={value}>{value}（{FIELD_STATUS_LABEL.unsupported}）</option>}
          </>
        )}
      </select>
      {!spec && !model && <p className="text-[10px] text-slate-500">请先选择模型</p>}
    </div>
  );
};

/** 所选 Gemini 模型的状态徽章：已下线 → deprecated；不在表内 → unverified；正常 → 不显示 */
export const GeminiModelBadge: React.FC<{ model: string }> = ({ model }) => {
  if (!model) return null;
  const s = modelStatus('gemini', model, new Date().toISOString().slice(0, 10));
  return s === 'supported' ? null : <FieldStatusBadge status={s} />;
};
