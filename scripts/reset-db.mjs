import pg from 'pg';
import bcrypt from 'bcryptjs';
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

const email = process.argv[2] || process.env.SUPERADMIN_EMAIL || 'sup_admin@neoclare.com';
const password = process.argv[3] || process.env.SUPERADMIN_PASSWORD || 'lkyhfrd@123';
const name = process.argv[4] || 'Super Admin';

async function resetDb() {
  const client = await pool.connect();
  try {
    console.log('🔄 Connected to Neon PostgreSQL...');
    console.log('📦 Rebuilding database schema...');

    await client.query(`
      DROP TABLE IF EXISTS ticket_audit_logs CASCADE;
      DROP TABLE IF EXISTS tickets CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS reservations CASCADE;
      DROP TABLE IF EXISTS ticket_tiers CASCADE;
      DROP TABLE IF EXISTS event_sessions CASCADE;
      DROP TABLE IF EXISTS events CASCADE;
      DROP TABLE IF EXISTS platform_settings CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS tenants CASCADE;

      -- Tenants table
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        gateway_account_id TEXT,
        fee_bearer_type TEXT CHECK(fee_bearer_type IN ('USER', 'ORGANIZER')) DEFAULT 'USER',
        default_platform_fee INTEGER DEFAULT 200,
        is_gateway_fee_passed_to_customer INTEGER DEFAULT 1,
        status TEXT CHECK(status IN ('ACTIVE', 'SUSPENDED')) DEFAULT 'ACTIVE',
        contact_email TEXT,
        contact_phone TEXT,
        event_creation_policy TEXT CHECK(event_creation_policy IN ('ADMIN_ONLY', 'TENANT_ALLOWED')) DEFAULT 'ADMIN_ONLY',
        created_at TEXT NOT NULL
      );

      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
        role TEXT CHECK(role IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'SCANNER', 'CUSTOMER')) NOT NULL,
        tenant_role TEXT CHECK(tenant_role IN ('OWNER', 'EVENT_MANAGER', 'STAFF')) DEFAULT 'OWNER',
        can_create_events INTEGER DEFAULT 1,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT,
        created_at TEXT NOT NULL
      );

      -- Platform Settings table
      CREATE TABLE IF NOT EXISTS platform_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Events table
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        banner_url TEXT,
        description TEXT,
        location TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        is_published INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      -- Event Sessions table
      CREATE TABLE IF NOT EXISTS event_sessions (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        session_date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        venue_note TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      -- Ticket Tiers table
      CREATE TABLE IF NOT EXISTS ticket_tiers (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES event_sessions(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        price_in_paise INTEGER NOT NULL,
        capacity INTEGER,
        is_unlimited INTEGER DEFAULT 0,
        valid_date TEXT,
        early_bird_deadline TEXT,
        created_at TEXT NOT NULL
      );

      -- Reservations table
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        tier_id TEXT NOT NULL REFERENCES ticket_tiers(id) ON DELETE CASCADE,
        session_token TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Orders table
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        user_id TEXT REFERENCES users(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        total_base_price INTEGER NOT NULL,
        platform_fee INTEGER NOT NULL,
        convenience_fee INTEGER NOT NULL,
        total_charged INTEGER NOT NULL,
        payment_status TEXT CHECK(payment_status IN ('PENDING', 'PAID', 'FAILED')) DEFAULT 'PENDING',
        gateway_order_id TEXT,
        gateway_payment_id TEXT,
        gateway_type TEXT CHECK(gateway_type IN ('UPI', 'RAZORPAY', 'CASHFREE')) DEFAULT 'UPI',
        created_at TEXT NOT NULL
      );

      -- Tickets table
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        tier_id TEXT NOT NULL REFERENCES ticket_tiers(id),
        attendee_name TEXT NOT NULL,
        attendee_age INTEGER NOT NULL,
        qr_secret_token TEXT NOT NULL,
        checked_in_at TEXT,
        checkin_count INTEGER DEFAULT 0,
        is_override_allowed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      -- Ticket Audit Logs table
      CREATE TABLE IF NOT EXISTS ticket_audit_logs (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        action_type TEXT CHECK(action_type IN ('WHATSAPP_SENT', 'DOWNLOADED', 'SCAN_ATTEMPT', 'OVERRIDE_CHECKIN', 'MANUAL_CHECKIN', 'RESET_CHECKIN')) NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();

    // Seed Platform Settings
    await client.query(`
      INSERT INTO platform_settings (key, value, updated_at) VALUES 
      ('active_gateway', 'UPI', $1),
      ('default_commission_paise', '200', $1),
      ('fixed_gateway_fee_paise', '0', $1),
      ('gateway_surcharge_percent', '0.0', $1),
      ('gst_on_fee_percent', '0', $1)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE platform_settings.key = 'active_gateway'
    `, [now]);

    // Seed Super Admin
    const passwordHash = bcrypt.hashSync(password, 10);
    const adminId = `usr_superadmin_${Date.now()}`;

    await client.query(`
      INSERT INTO users (id, tenant_id, role, name, email, phone, password_hash, created_at)
      VALUES ($1, NULL, 'SUPER_ADMIN', $2, $3, '+919918327131', $4, $5)
      ON CONFLICT (email) DO NOTHING
    `, [adminId, name, email.toLowerCase().trim(), passwordHash, now]);

    console.log('\n🎉 Neon PostgreSQL database reset successfully!');
    console.log('─────────────────────────────────────────────');
    console.log(`👤 Super Admin Created:`);
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role:     SUPER_ADMIN`);
    console.log(`   ID:       ${adminId}`);
    console.log('─────────────────────────────────────────────');
    console.log('🔐 You can now login at /admin/login\n');
  } catch (err) {
    console.error('❌ Error resetting database:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetDb();
