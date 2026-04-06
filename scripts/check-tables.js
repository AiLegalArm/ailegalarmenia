import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://dbrhbbaoeurjveconszd.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const tables = ['knowledge_base_chunks', 'legal_chunks', 'legal_practice_chunks', 'practice_chunks'];
  for (const t of tables) {
    try {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(t + ': NOT FOUND');
      } else {
        console.log(t + ': ' + count + ' rows');
      }
    } catch (e) {
      console.log(t + ': ERROR');
    }
  }
  process.exit(0);
})();
