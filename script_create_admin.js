import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dbrhbbaoeurjveconszd.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('Run: SUPABASE_SERVICE_ROLE_KEY=<your_key> node script_create_admin.js');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function createAdminUser() {
  console.log('🔐 Creating admin user...\n');

  const adminUsername = process.argv[2] || 'admin';
  const adminPassword = process.argv[3] || 'Admin123!';
  const adminEmail = `${adminUsername}@app.internal`;

  console.log(`Username: ${adminUsername}`);
  console.log(`Email: ${adminEmail}`);
  console.log(`Password: ${adminPassword.replace(/./g, '*')}\n`);

  try {
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAdmin = existingUsers.users.find(u => u.email === adminEmail);

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists. Checking role...\n');

      const { data: roles } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', existingAdmin.id)
        .eq('role', 'admin');

      if (!roles || roles.length === 0) {
        console.log('📝 Adding admin role to existing user...');
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert({ user_id: existingAdmin.id, role: 'admin' });

        if (roleError) {
          console.error('❌ Failed to add admin role:', roleError);
        } else {
          console.log('✅ Admin role added successfully!');
        }
      } else {
        console.log('✅ User already has admin role.');
      }

      console.log('\n📋 Admin User Details:');
      console.log(`   ID: ${existingAdmin.id}`);
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Created: ${existingAdmin.created_at}`);
      
      return;
    }

    console.log('⏳ Creating new admin user...');

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: 'System Administrator',
        username: adminUsername,
      },
    });

    if (createError) {
      if (createError.status === 422 && createError.message.includes('already been registered')) {
        console.error('❌ User already exists in auth.users but with different case/format.');
        console.error('   Try running with a different username or check the database directly.');
        return;
      }
      throw createError;
    }

    if (!newUser.user) {
      console.error('❌ User creation returned no data');
      return;
    }

    console.log('✅ User created in auth.users');
    console.log(`   User ID: ${newUser.user.id}`);

    await new Promise(r => setTimeout(r, 1000));

    console.log('📝 Assigning admin role...');

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        email: adminEmail,
        full_name: 'System Administrator',
        username: adminUsername,
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('⚠️  Profile upsert warning:', profileError.message);
    } else {
      console.log('✅ Profile created/updated');
    }

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: newUser.user.id,
        role: 'admin',
      }, { onConflict: 'user_id,role', ignoreDuplicates: true });

    if (roleError) {
      console.error('❌ Failed to assign admin role:', roleError);
      return;
    }

    console.log('✅ Admin role assigned');

    console.log('\n========================================');
    console.log('🎉 ADMIN USER CREATED SUCCESSFULLY!');
    console.log('========================================\n');
    console.log('📋 Login Credentials:');
    console.log(`   Username: ${adminUsername}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('\n🔗 Access Admin Panel:');
    console.log('   /admin/login\n');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

createAdminUser();
