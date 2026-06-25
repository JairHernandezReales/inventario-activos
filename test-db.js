const { Pool } = require('pg');

// Reemplaza con TU URL real
const DATABASE_URL = 'postgresql://postgres:uTzsnhclAhXRf96w@db.syuetgjaorlbikrrirgx.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    console.log('🔄 Probando conexión a Supabase...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Conexión exitosa! Hora del servidor:', result.rows[0].now);
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    console.log('\n🔍 Verifica:');
    console.log('1. La URL de conexión es correcta');
    console.log('2. La contraseña es correcta');
    console.log('3. Tu proyecto de Supabase está activo');
  } finally {
    await pool.end();
  }
}

testConnection();