import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://dbrhbbaoeurjveconszd.supabase.co";
// Service role key
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicmhiYmFvZXVyanZlY29uc3pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAwNjY3NiwiZXhwIjoyMDg4NTgyNjc2fQ.F6CsMyyTctwVXAFSUQcuQvRjvtSrtIcn0mNQ-YtZjwM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
    console.log('🚀 Начинаем генерацию моковых данных...');

    // Helper to create user
    async function createLocalUser(username, role, auditorId = null) {
        const email = `${username.toLowerCase()}@app.internal`;
        const password = `${username}777`;

        console.log(`⏳ Создаем ${role}: ${username}...`);

        const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
        });

        if (userErr) {
            if (userErr.status === 422 && userErr.message.includes('already been registered')) {
                console.log(`⚠️ Пользователь ${email} уже существует. Находим его ID...`);
                const { data: allUsers } = await supabase.auth.admin.listUsers();
                const existing = allUsers.users.find(u => u.email === email);
                return { id: existing.id, email, password };
            }
            console.error(`❌ Ошибка создания ${username}:`, userErr);
            return null;
        }

        await new Promise(r => setTimeout(r, 1000)); // Ждем триггеров

        // Assign role
        const { error: roleErr } = await supabase.from('user_roles').insert([
            { user_id: userData.user.id, role: role }
        ]);
        if (roleErr && roleErr.code !== '23505') console.error('Role Err:', roleErr);

        // Update Profile
        const profileUpdate = { full_name: username };
        if (auditorId) profileUpdate.auditor_id = auditorId;

        await supabase.from('profiles').update(profileUpdate).eq('id', userData.user.id);

        console.log(`✅ ${role} создан: ${username}`);
        return { id: userData.user.id, email, password };
    }

    // 1. Создаем Аудитора
    const auditor = await createLocalUser('BossAuditor', 'auditor');
    if (!auditor) return;

    // 2. Создаем 2 Адвокатов, привязанных к аудитору
    const lawyer1 = await createLocalUser('AnnaLawyer', 'lawyer', auditor.id);
    const lawyer2 = await createLocalUser('DavidLawyer', 'lawyer', auditor.id);

    if (!lawyer1 || !lawyer2) return;

    console.log('\n⏳ Создаем дела (Cases) для адвокатов...');

    const dateNow = new Date().toISOString();

    // 3. Создаем 3 дела для Анны
    const annaCases = [
        {
            title: "Дело о наследстве Петросянов (Анна)",
            description: "Спор между наследниками первой очереди на недвижимость в Ереване.",
            case_number: "CIV-" + Math.floor(Math.random() * 10000),
            status: "open",
            priority: "high",
            court: "court_1",
            court_name: "Суд общей юрисдикции города Ереван",
            case_type: "civil",
            current_stage: "preliminary",
            party_role: "plaintiff",
            lawyer_id: lawyer1.id,
            created_at: dateNow,
            updated_at: dateNow
        },
        {
            title: "Развод Мартиросян (Анна)",
            description: "Дележ имущества по ипотеке и споры о детях.",
            case_number: "FAM-" + Math.floor(Math.random() * 10000),
            status: "in_progress",
            priority: "medium",
            court: "court_2",
            court_name: "Суд первой инстанции г. Ереван",
            case_type: "civil",
            current_stage: "first_instance",
            party_role: "respondent",
            lawyer_id: lawyer1.id,
            created_at: dateNow,
            updated_at: dateNow
        }
    ];

    // 4. Создаем 2 дела для Давида
    const davidCases = [
        {
            title: "Защита бизнеса ООО Арарат (Давид)",
            description: "Налоговая проверка выявила нарушения, готовим встречный иск.",
            case_number: "TAX-" + Math.floor(Math.random() * 10000),
            status: "open",
            priority: "high",
            court: "court_3",
            court_name: "Административный суд РА",
            case_type: "administrative",
            current_stage: "preliminary",
            party_role: "plaintiff",
            lawyer_id: lawyer2.id,
            created_at: dateNow,
            updated_at: dateNow
        },
        {
            title: "ДТП с тяжелым исходом (Давид)",
            description: "Защита водителя таксопарка. Сбор показаний.",
            case_number: "CRIM-" + Math.floor(Math.random() * 10000),
            status: "in_progress",
            priority: "high",
            court: "court_4",
            court_name: "Уголовный суд первой инстанции РА",
            case_type: "criminal",
            current_stage: "investigation",
            party_role: "defendant",
            lawyer_id: lawyer2.id,
            created_at: dateNow,
            updated_at: dateNow
        }
    ];

    const allCases = [...annaCases, ...davidCases];

    // Удалим старые фейковые дела, если они генерировались этим же скриптом ранее (необязательно)

    // Вставляем все дела напрямую (роль Service Role пробивает RLS)
    const { data: insertedCases, error: casesErr } = await supabase
        .from('cases')
        .insert(allCases)
        .select();

    if (casesErr) {
        console.error('❌ Ошибка создания дел:', casesErr);
    } else {
        console.log(`✅ Создано ${insertedCases.length} дел (Cases).`);
    }

    console.log('\n=============== ГОТОВО ===============');
    console.log('Вот доступы для входа на сайт (по формату Username):');
    console.log('');
    console.log('👤 [АУДИТОР]');
    console.log('Логин (Username): BossAuditor');
    console.log('Пароль: BossAuditor777');
    console.log('');
    console.log('⚖️ [АДВОКАТ 1] (Ее будет видеть Аудитор)');
    console.log('Логин (Username): AnnaLawyer');
    console.log('Пароль: AnnaLawyer777');
    console.log('');
    console.log('⚖️ [АДВОКАТ 2] (Его будет видеть Аудитор)');
    console.log('Логин (Username): DavidLawyer');
    console.log('Пароль: DavidLawyer777');
    console.log('======================================\n');
}

run();
