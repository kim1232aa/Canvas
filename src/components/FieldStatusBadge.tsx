import React from 'react';
import type { FieldStatus } from '../schemas/providerSchema';

type BadgeStatus = Exclude<FieldStatus, 'supported'>;

// 三种字段状态的唯一样式/文案定义
export const FIELD_STATUS_LABEL: Record<BadgeStatus, string> = {
  unsupported: '该服务商不支持',
  unverified: '官方未说明是否生效',
  deprecated: '已下线',
};

const FIELD_STATUS_CLASS: Record<BadgeStatus, string> = {
  unsupported: 'bg-rose-950/40 border-rose-500/50 text-rose-300',
  unverified: 'bg-amber-950/40 border-amber-500/50 text-amber-300',
  deprecated: 'bg-slate-800/60 border-slate-500/50 text-slate-400 line-through',
};

export const FieldStatusBadge: React.FC<{ status: BadgeStatus }> = ({ status }) => (
  <span className={`inline-flex items-center shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-mono ${FIELD_STATUS_CLASS[status]}`}>
    {FIELD_STATUS_LABEL[status]}
  </span>
);
