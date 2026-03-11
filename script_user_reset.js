import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://dbrhbbaoeurjveconszd.supabase.co";
// Using the service role key from the python script to bypass RLS and use auth admin API
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicmhiYmFvZXVyanZlY29uc3pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAwNjY3NiwiZXhwIjoyMDg4NTgyNjc2fQ.F6CsMyyTctwVXAFSUQcuQvRjvtSrtIcn0mNQ-YtZjwM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
    console.log('🔄 Fetching existing users...');

    // 1. Delete all users
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) {
        console.error('❌ Error listing users:', usersError);
        return;
    }

    if (usersData.users.length > 0) {
        console.log(`🗑️ Found ${usersData.users.length} users. Deleting...`);
        for (const user of usersData.users) {
            console.log(`   - Deleting user: ${user.email}`);
            await supabase.auth.admin.deleteUser(user.id);
        }
        console.log('✅ Done deleting users.');
    }

    // 2. Clear old profiles that might be orphaned
    await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('user_roles').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 3. Create Lawyer
    console.log('⏳ Creating lawyer ArmenP...');
    const { data: lawyerData, error: lawyerErr } = await supabase.auth.admin.createUser({
        email: 'armenp@app.internal',
        password: 'Armen777',
        email_confirm: true,
    });
    if (lawyerErr) {
        console.error('❌ Error creating lawyer:', lawyerErr);
    } else {
        // Wait a sec for triggers
        await new Promise(r => setTimeout(r, 1000));
        // Set role
        const { error: roleErr1 } = await supabase.from('user_roles').insert([
            { user_id: lawyerData.user.id, role: 'lawyer' }
        ]);
        if (roleErr1 && roleErr1.code === '23505') {
            // ignore duplicate key if trigger already ran
        }
        // Update profile
        await supabase.from('profiles').update({
            full_name: 'ArmenP',
        }).eq('id', lawyerData.user.id);
        console.log('✅ Created lawyer: ArmenP');
    }

    // 4. Create Admin
    console.log('⏳ Creating admin HaykAdmin2026...');
    const { data: adminData, error: adminErr } = await supabase.auth.admin.createUser({
        email: 'haykadmin2026@app.internal',
        password: 'Admin50006',
        email_confirm: true,
    });
    if (adminErr) {
        console.error('❌ Error creating admin:', adminErr);
    } else {
        await new Promise(r => setTimeout(r, 1000));
        const { error: roleErr2 } = await supabase.from('user_roles').insert([
            { user_id: adminData.user.id, role: 'admin' }
        ]);
        if (roleErr2 && roleErr2.code === '23505') {
            // ignore duplicate key if trigger already ran
            await supabase.from('user_roles').update({ role: 'admin' }).eq('user_id', adminData.user.id);
        }
        await supabase.from('profiles').update({
            full_name: 'HaykAdmin2026',
        }).eq('id', adminData.user.id);
        console.log('✅ Created admin: HaykAdmin2026');
    }
}

run();
