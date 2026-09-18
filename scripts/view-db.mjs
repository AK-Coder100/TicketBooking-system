import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_y3KUvWs1ewbO@ep-rough-mountain-aob0vjsn-pooler.c-2.ap-southeast-1.aws.neon.tech/event_manage?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

const targetTable = process.argv[2];

async function viewDb() {
  const client = await pool.connect();
  try {
    console.log('📡 Connected to Neon PostgreSQL:');
    console.log(`🔗 ${connectionString.split('@')[1] || connectionString}\n`);

    if (targetTable) {
      console.log(`📋 Inspecting table: "${targetTable}"`);
      const res = await client.query(`SELECT * FROM "${targetTable}" LIMIT 50`);
      console.table(res.rows);
      console.log(`Total rows returned: ${res.rows.length}`);
      return;
    }

    const tables = [
      'tenants',
      'users',
      'events',
      'event_sessions',
      'ticket_tiers',
      'reservations',
      'orders',
      'tickets',
      'ticket_audit_logs',
      'platform_settings'
    ];

    console.log('📊 Database Overview:\n');
    for (const table of tables) {
      try {
        const countRes = await client.query(`SELECT count(*) FROM "${table}"`);
        const count = countRes.rows[0].count;
        console.log(`  • ${table.padEnd(20)}: ${count} rows`);
      } catch (e) {
        console.log(`  • ${table.padEnd(20)}: [Table does not exist]`);
      }
    }

    console.log('\n💡 Tip: Run `node scripts/view-db.mjs <table_name>` to inspect rows of a specific table.');
    console.log('   Example: `node scripts/view-db.mjs users` or `node scripts/view-db.mjs events`');
  } catch (err) {
    console.error('❌ Error viewing database:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

viewDb();
