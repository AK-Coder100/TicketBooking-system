import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_y3KUvWs1ewbO@ep-rough-mountain-aob0vjsn-pooler.c-2.ap-southeast-1.aws.neon.tech/event_manage?sslmode=require&channel_binding=require';

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

/**
 * Transforms standard SQL with SQLite-style `?` placeholders or syntax
 * into PostgreSQL parameterized SQL ($1, $2, ...)
 */
export function transformSql(sql: string): string {
  let paramIndex = 1;
  let transformed = sql.replace(/\?/g, () => `$${paramIndex++}`);

  // Handle common SQLite -> Postgres syntax differences
  transformed = transformed.replace(/COLLATE\s+NOCASE/gi, '');
  transformed = transformed.replace(/datetime\('now'\)/gi, 'NOW()');
  transformed = transformed.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  
  return transformed;
}

/**
 * High-performance, async database abstraction layer for PostgreSQL
 */
export const db = {
  /**
   * Raw parameterized query on the pool
   */
  async query(text: string, params: any[] = []): Promise<pg.QueryResult<any>> {
    const transformed = transformSql(text);
    return pool.query(transformed, params);
  },

  /**
   * Execute multiple raw DDL / SQL commands
   */
  async exec(sql: string): Promise<void> {
    await pool.query(sql);
  },

  /**
   * SQLite-compatible async prepare interface for seamless codebase integration
   */
  prepare(sql: string) {
    return {
      async get(...params: any[]): Promise<any> {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const res = await db.query(sql, flatParams);
        return res.rows[0] || null;
      },
      async all(...params: any[]): Promise<any[]> {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const res = await db.query(sql, flatParams);
        return res.rows;
      },
      async run(...params: any[]): Promise<{ rowCount: number }> {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const res = await db.query(sql, flatParams);
        return { rowCount: res.rowCount || 0 };
      }
    };
  }
};

let initialized = false;

export async function initSchema(): Promise<void> {
  if (initialized) return;
  try {
    await db.exec(`
      -- Tenants table
      CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR(100) PRIMARY KEY,
        slug VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        gateway_account_id VARCHAR(255),
        fee_bearer_type VARCHAR(20) DEFAULT 'USER',
        default_platform_fee INTEGER DEFAULT 200,
        is_gateway_fee_passed_to_customer INTEGER DEFAULT 1,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        contact_email VARCHAR(255),
        contact_phone VARCHAR(50),
        event_creation_policy VARCHAR(50) DEFAULT 'ADMIN_ONLY',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        tenant_id VARCHAR(100) REFERENCES tenants(id) ON DELETE SET NULL,
        role VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        password_hash TEXT,
        tenant_role VARCHAR(50),
        can_create_events INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Platform Settings table
      CREATE TABLE IF NOT EXISTS platform_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Events table
      CREATE TABLE IF NOT EXISTS events (
        id VARCHAR(100) PRIMARY KEY,
        tenant_id VARCHAR(100) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        banner_url TEXT,
        description TEXT,
        location TEXT NOT NULL,
        start_date TIMESTAMPTZ NOT NULL,
        end_date TIMESTAMPTZ NOT NULL,
        is_published INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Event Sessions table
      CREATE TABLE IF NOT EXISTS event_sessions (
        id VARCHAR(100) PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        session_date VARCHAR(50) NOT NULL,
        start_time VARCHAR(20),
        end_time VARCHAR(20),
        venue_note TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Ticket Tiers table
      CREATE TABLE IF NOT EXISTS ticket_tiers (
        id VARCHAR(100) PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        session_id VARCHAR(100) REFERENCES event_sessions(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        price_in_paise INTEGER NOT NULL,
        capacity INTEGER,
        is_unlimited INTEGER DEFAULT 0,
        valid_date VARCHAR(50),
        early_bird_deadline VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Reservations table
      CREATE TABLE IF NOT EXISTS reservations (
        id VARCHAR(100) PRIMARY KEY,
        tier_id VARCHAR(100) NOT NULL REFERENCES ticket_tiers(id) ON DELETE CASCADE,
        session_token VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Orders table
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(100) PRIMARY KEY,
        tenant_id VARCHAR(100) NOT NULL REFERENCES tenants(id),
        user_id VARCHAR(100) REFERENCES users(id),
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50) NOT NULL,
        customer_email VARCHAR(255),
        total_base_price INTEGER NOT NULL,
        platform_fee INTEGER NOT NULL,
        convenience_fee INTEGER NOT NULL,
        total_charged INTEGER NOT NULL,
        payment_status VARCHAR(20) DEFAULT 'PENDING',
        gateway_order_id VARCHAR(255),
        gateway_payment_id VARCHAR(255),
        payment_reference TEXT,
        gateway_type VARCHAR(20) DEFAULT 'UPI',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Tickets table
      CREATE TABLE IF NOT EXISTS tickets (
        id VARCHAR(100) PRIMARY KEY,
        order_id VARCHAR(100) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        tier_id VARCHAR(100) NOT NULL REFERENCES ticket_tiers(id),
        attendee_name VARCHAR(255) NOT NULL,
        attendee_age INTEGER NOT NULL,
        qr_secret_token TEXT NOT NULL,
        checked_in_at TIMESTAMPTZ,
        checkin_count INTEGER DEFAULT 0,
        is_override_allowed INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Ticket Audit Logs table
      CREATE TABLE IF NOT EXISTS ticket_audit_logs (
        id VARCHAR(100) PRIMARY KEY,
        ticket_id VARCHAR(100) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        metadata TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Ensure orders_gateway_type_check and payment_status constraints permit UPI and DECLINED
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_gateway_type_check;
      ALTER TABLE orders ADD CONSTRAINT orders_gateway_type_check CHECK (gateway_type IN ('UPI', 'RAZORPAY', 'CASHFREE'));
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
      ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED', 'DECLINED'));
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS attendees_data TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS tier_id VARCHAR(100);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_title VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
    `);

    await seedData();
    initialized = true;
  } catch (err: any) {
    console.error('PostgreSQL schema initialization error:', err);
  }
}

export async function seedData(): Promise<void> {
  try {
    const checkRes = await db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'SUPER_ADMIN'").get();
    const check = parseInt(checkRes?.count || '0', 10);
    const now = new Date().toISOString();

    const superAdminEmail = (process.env.INITIAL_SUPER_ADMIN_EMAIL || 'sup_admin@neoclare.com').toLowerCase().trim();
    const superAdminPass = process.env.INITIAL_SUPER_ADMIN_PASSWORD || 'lkyhfrd@123';
    const superAdminHash = bcrypt.hashSync(superAdminPass, 10);

    if (check === 0) {
      await db.prepare(`
        INSERT INTO users (id, tenant_id, role, name, email, phone, password_hash, created_at)
        VALUES ('usr_superadmin', NULL, 'SUPER_ADMIN', 'Super Admin', ?, '+919918327131', ?, ?)
        ON CONFLICT (email) DO NOTHING
      `).run(superAdminEmail, superAdminHash, now);
      console.log(`[Database] Initial Super Admin created: ${superAdminEmail}`);
    }

    // Default Platform Settings
    await db.exec(`
      INSERT INTO platform_settings (key, value, updated_at) VALUES 
      ('active_gateway', 'UPI', NOW()),
      ('default_commission_paise', '200', NOW()),
      ('fixed_gateway_fee_paise', '0', NOW()),
      ('gateway_surcharge_percent', '0.0', NOW()),
      ('gst_on_fee_percent', '0', NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE platform_settings.key = 'active_gateway';
    `);

  } catch (err: any) {
    console.error('PostgreSQL seedData error:', err);
  }
}

// Auto-run schema check in background
initSchema().catch(err => console.error('initSchema error on startup:', err));
