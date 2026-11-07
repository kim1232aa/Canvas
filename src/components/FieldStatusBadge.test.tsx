import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FieldStatusBadge,
  SchemaSendBadge,
  FIELD_STATUS_LABEL,
  SCHEMA_SEND_TITLE,
} from './FieldStatusBadge';

describe('FieldStatusBadge', () => {
  it('renders label, status class, and title for each badge status', () => {
    const cases: Array<{ status: 'unsupported' | 'unverified' | 'deprecated' | 'will_send'; classFragment: string }> = [
      { status: 'unsupported', classFragment: 'text-rose-300' },
      { status: 'unverified', classFragment: 'text-amber-300' },
      { status: 'deprecated', classFragment: 'line-through' },
      { status: 'will_send', classFragment: 'text-emerald-300' },
    ];
    for (const { status, classFragment } of cases) {
      const html = renderToStaticMarkup(<FieldStatusBadge status={status} />);
      expect(html).toContain(`data-testid="field-status-badge-${status}"`);
      expect(html).toContain(FIELD_STATUS_LABEL[status]);
      expect(html).toContain(classFragment);
      expect(html).toContain(`title="${FIELD_STATUS_LABEL[status]}"`);
    }
  });

  it('uses the provided title override', () => {
    const html = renderToStaticMarkup(<FieldStatusBadge status="unsupported" title="自定义说明" />);
    expect(html).toContain('title="自定义说明"');
    expect(html).toContain(FIELD_STATUS_LABEL.unsupported);
  });
});

describe('SchemaSendBadge', () => {
  it('renders nothing when status is null', () => {
    expect(renderToStaticMarkup(<SchemaSendBadge status={null} />)).toBe('');
  });

  it('renders will_send / pending / loading / schema_unavailable with SCHEMA_SEND_TITLE', () => {
    const statuses = ['will_send', 'pending', 'loading', 'schema_unavailable'] as const;
    for (const status of statuses) {
      const html = renderToStaticMarkup(<SchemaSendBadge status={status} />);
      expect(html).toContain(`data-testid="schema-send-badge-${status}"`);
      expect(html).toContain(FIELD_STATUS_LABEL[status]);
      expect(html).toContain(SCHEMA_SEND_TITLE[status]);
    }
  });

  it('uses omitTitle for not_sent and falls back to the label', () => {
    const withOmit = renderToStaticMarkup(<SchemaSendBadge status="not_sent" omitTitle="该字段已省略" />);
    expect(withOmit).toContain('data-testid="schema-send-badge-not_sent"');
    expect(withOmit).toContain(FIELD_STATUS_LABEL.not_sent);
    expect(withOmit).toContain('title="该字段已省略"');
    expect(withOmit).toContain('text-amber-200');

    const withoutOmit = renderToStaticMarkup(<SchemaSendBadge status="not_sent" />);
    expect(withoutOmit).toContain(`title="${FIELD_STATUS_LABEL.not_sent}"`);
  });

  it('falls back to the field label for no_image (no SCHEMA_SEND_TITLE entry)', () => {
    const html = renderToStaticMarkup(<SchemaSendBadge status="no_image" />);
    expect(html).toContain('data-testid="schema-send-badge-no_image"');
    expect(html).toContain(FIELD_STATUS_LABEL.no_image);
    expect(html).toContain(`title="${FIELD_STATUS_LABEL.no_image}"`);
  });
});
