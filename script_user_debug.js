import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://dbrhbbaoeurjveconszd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicmhiYmFvZXVyanZlY29uc3pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAwNjY3NiwiZXhwIjoyMDg4NTgyNjc2fQ.F6CsMyyTctwVXAFSUQcuQvRjvtSrtIcn0mNQ-YtZjwM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) return console.error(usersError);

    for (const user of usersData.users) {
        const { data: roles } = await supabase.from('user_roles').select('*').eq('user_id', user.id);
        console.log(`User: ${user.email}, ID: ${user.id}`);
        console.log(`Roles:`, roles);
    }
}

run();
