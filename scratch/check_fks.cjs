const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://xhzpxiiqrtmeduynqmsd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTk3MSwiZXhwIjoyMTAxOTIxOTcxfQ.VnJwWDCFRG3PZxGTzYOWEPTNrUjY2fQ9Wi_rPEqTJfE'
);

async function checkFKs() {
  const sql = `
    SELECT 
      tc.table_name, 
      kcu.column_name, 
      rc.delete_rule 
    FROM information_schema.table_constraints tc 
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name 
    JOIN information_schema.referential_constraints rc 
      ON tc.constraint_name = rc.constraint_name 
    WHERE rc.unique_constraint_name IN (
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'sessions' AND constraint_type = 'PRIMARY KEY'
    );
  `;
  const { data, error } = await s.rpc('exec_sql', { sql });
  console.log('FKs to sessions:', data || error);

  // Also check all tables with session_id
  const sql2 = `
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE column_name = 'session_id';
  `;
  const res2 = await s.rpc('exec_sql', { sql: sql2 });
  console.log('Tables with session_id:', res2.data || res2.error);
}

checkFKs();
