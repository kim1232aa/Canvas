import React from 'react';
import type { FieldStatus } from '../schemas/providerSchema';

/** UI-only extension: not_sent = schema/mapping will not submit this canvas field. */
type BadgeStatus = Exclude<FieldStatus, 'supported'> | 'not_sent' | 'will_send' | 'pending' | 'loading' | 'no_image' | 'schema_unavailable';

// 四种字段状态的唯一样式/文案定义
export const FIELD_STATUS_LABEL: Record<BadgeStatus, string> = {
  unsupported: '该服务商不支持',
  unverified: '官方未说明是否生效',
  deprecated: '已下线',
  not_sent: 'Schema 不支持，不发送',
  will_send: '会发送',
  pending: 'Schema 未读取',
  loading: 'Schema 加载中…',
  no_image: '无参考图 · 不发送',
  schema_unavailable: 'Schema 不可用，字段不会发送',
};

const FIELD_STATUS_CLASS: Record<BadgeStatus, string> = {
  unsupported: 'bg-rose-950/40 border-rose-500/50 text-rose-300',
  unverified: 'bg-amber-950/40 border-amber-500/50 text-amber-300',
  deprecated: 'bg-slate-800/60 border-slate-500/50 text-slate-400 line-through',
  not_sent: 'bg-amber-950/40 border-amber-500/50 text-amber-200',
  will_send: 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300',
  pending: 'bg-slate-800/60 border-slate-500/50 text-slate-300',
  loading: 'bg-transparent border-slate-700/50 text-slate-500',
  no_image: 'bg-slate-800/60 border-slate-500/50 text-slate-300',
  schema_unavailable: 'bg-rose-950/40 border-rose-500/50 text-rose-200',
};

export const FieldStatusBadge: React.FC<{ status: BadgeStatus; title?: string }> = ({ status, title }) => (
  <span
    title={title || FIELD_STATUS_LABEL[status]}
    className={`inline-flex items-center shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-mono whitespace-normal [overflow-wrap:anywhere] max-w-full ${FIELD_STATUS_CLASS[status]}`}
  >
    {FIELD_STATUS_LABEL[status]}
  </span>
);

export const SCHEMA_SEND_TITLE = {
  will_send: '模型 Schema 已声明该字段（含别名），已填值会原样发送；以执行记录 actualRequest 为准。',
  pending: '模型 Schema 尚未读取（选用模型后才会读取）。读到后：已填 → 会发送；未填 → 未填写，不发送；不在 Schema → Schema 不支持。以执行记录 actualRequest 为准。',
  loading: '正在加载模型 Schema，加载完成后显示是否发送。',
  schema_unavailable: '模型 Schema 读取失败（原文见执行记录）：运行时 Schema GET 失败则生成请求不会发出，这些字段不会发送。',
} as const;

/** Renders 会发送 / 未填写·不发送 / Schema 不支持 / Schema 未读取 for a schemaSendStatus() result. */
export const SchemaSendBadge: React.FC<{ status: 'will_send' | 'not_sent' | 'pending' | 'loading' | 'no_image' | 'schema_unavailable' | null; omitTitle?: string }> = ({ status, omitTitle }) =>
  status === null ? null : <FieldStatusBadge status={status} title={status === 'not_sent' ? omitTitle : status === 'no_image' ? '没有参考图输入：去噪/strength 仅在图生图时发送（与执行记录 mapping sent:false 一致）。' : SCHEMA_SEND_TITLE[status]} />;
