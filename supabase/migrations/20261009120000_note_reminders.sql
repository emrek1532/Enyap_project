-- Uygulandı (Supabase MCP: note_reminders): notes.remind_at / reminded_at / done,
-- send_note_reminders() ve pg_cron görevi 'note-reminders' (5 dakikada bir).
alter table notes add column if not exists remind_at timestamptz;
alter table notes add column if not exists reminded_at timestamptz;
alter table notes add column if not exists done boolean not null default false;
