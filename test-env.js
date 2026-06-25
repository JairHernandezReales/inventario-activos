require('dotenv').config();

console.log('🔍 Verificando variables de entorno:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Configurada' : '❌ No configurada');

if (process.env.DATABASE_URL) {
  console.log('\n📋 URL:', process.env.DATABASE_URL);
  console.log('\n⚠️ Verifica que:');
  console.log('1. La URL empieza con "postgresql://"');
  console.log('2. Contiene "supabase.co"');
  console.log('3. No tiene espacios en blanco');
  console.log('4. La contraseña no tiene caracteres especiales que causen problemas');
}