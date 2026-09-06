-- 036_add_sessions_to_realtime.sql: Включение таблицы sessions в публикацию supabase_realtime
-- для мгновенного обновления игрового времени, календаря, локации и статуса отрядов у всех участников

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
