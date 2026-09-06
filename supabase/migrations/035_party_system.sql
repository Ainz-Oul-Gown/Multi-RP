-- 035_party_system.sql: Поддержка системы отрядов (Party System) для совместного передвижения игроков

ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS party_groups JSONB DEFAULT '[]';

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS party_id UUID DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
