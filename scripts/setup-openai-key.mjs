import fs from 'fs';

const envPath = '.env';

console.log('🔧 SETUP OpenAI API Key для Embeddings\n');

// Check if key already exists
let envContent = fs.readFileSync(envPath, 'utf-8');
if (envContent.includes('OPENAI_API_KEY=')) {
  console.log('✅ OPENAI_API_KEY уже установлен в .env');
  process.exit(0);
}

// If not exists, add placeholder
const openaiKeyLine = 'OPENAI_API_KEY="sk_YOUR_OPENAI_API_KEY_HERE"\n';

if (!envContent.endsWith('\n')) {
  envContent += '\n';
}

fs.writeFileSync(envPath, envContent + openaiKeyLine);

console.log('📝 Добавлен OPENAI_API_KEY в .env');
console.log('\n⚠️  ДЕЙСТВИЕ ТРЕБУЕТСЯ:');
console.log('1. Получить API ключ от OpenAI:');
console.log('   https://platform.openai.com/account/api-keys');
console.log('\n2. Заменить sk_YOUR_OPENAI_API_KEY_HERE на реальный ключ');
console.log('   Формат: sk-proj-xxxxxxxxxxxxxxxxxxxxx...');
console.log('\n3. Также нужно установить ключ в Supabase Environment Variables:');
console.log('   supabase secrets set OPENAI_API_KEY="sk-proj-xxx"');
console.log('   (или через Supabase Dashboard)');
