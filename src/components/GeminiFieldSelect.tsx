import React from 'react';
import { GEMINI_IMAGE_MODELS, geminiValueStatus, type GeminiSelectField } from '../shared/providerFieldSpecs';
import { FieldStatusBadge, FIELD_STATUS_LABEL } from './FieldStatusBadge';

// aspect_ratio / image_size 下拉：选项只来自 providerFieldSpecs 中当前模型的列表。
// 首项「未选择（不传）」值为空 → 不发送。未选模型时禁用。
export const GeminiFieldSelect: React.FC<{
  model: string;
  field: GeminiSelectField;
  value: string;
  onChange: (value: string) => void;
}> = ({ model, field, value, onChange }) => {
  const spec = model ? GEMINI_IMAGE_MODELS[model] : undefined;
  const status = value && model ? geminiValueStatus(model, field, value) : 'supported';
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
            {spec[field].map((v) => (
              // U-E1: 服务端仍对 unverified 取值 400，故此处禁用；U-E2 改为可选
              <option key={v.value} value={v.value} disabled={v.status === 'unverified'}>
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
