import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';

export const canvasEntries = sqliteTable('canvas_entries', {
  kind: text('kind').notNull(),
  id: text('id').notNull(),
  objectKey: text('object_key').notNull(),
  summary: text('summary').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [primaryKey({columns: [table.kind, table.id]}), index('idx_canvas_entries_kind_updated').on(table.kind, table.updatedAt)]);

export const canvasSettings = sqliteTable('canvas_settings', {
  field: text('field').primaryKey(),
  encryptedValue: text('encrypted_value').notNull(),
});
