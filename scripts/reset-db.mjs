import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_y3KUvWs1ewbO@ep-rough-mountain-aob0vjsn-pooler.c-2.ap-southeast-1.aws.neon.tech/event_manage?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

const superAdminEmail = (process.argv[2] || process.env.SUPERADMIN_EMAIL || 'sup_admin@neoclare.com').toLowerCase().trim();
const superAdminPassword = process.argv[3] || process.env.SUPERADMIN_PASSWORD || 'lkyhfrd@123';
const superAdminName = process.argv[4] || 'Super Admin';

async function resetDb() {
  const client = await pool.connect();
  try {
    console.log('🔄 Connecting to PostgreSQL database...');
    console.log('📦 Dropping existing tables and rebuilding complete schema...\n');

    await client.query(`
      DROP TABLE IF EXISTS whatsapp_msg_in_queue CASCADE;
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

      -- 1. Tenants table
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
        contact_phone VARCHAR(255),
        organizer_phone VARCHAR(255),
        event_creation_policy VARCHAR(50) DEFAULT 'ADMIN_ONLY',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 2. Users table
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        tenant_id VARCHAR(100) REFERENCES tenants(id) ON DELETE SET NULL,
        role VARCHAR(50) NOT NULL,
        tenant_role VARCHAR(50) DEFAULT 'OWNER',
        can_create_events INTEGER DEFAULT 1,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        password_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 3. Platform Settings table
      CREATE TABLE IF NOT EXISTS platform_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 4. Events table
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

      -- 5. Event Sessions table
      CREATE TABLE IF NOT EXISTS event_sessions (
        id VARCHAR(100) PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        session_date VARCHAR(50) NOT NULL,
        start_time VARCHAR(50),
        end_time VARCHAR(50),
        venue_note TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 6. Ticket Tiers table
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

      -- 7. Reservations table
      CREATE TABLE IF NOT EXISTS reservations (
        id VARCHAR(100) PRIMARY KEY,
        tier_id VARCHAR(100) NOT NULL REFERENCES ticket_tiers(id) ON DELETE CASCADE,
        session_token VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 8. Orders table
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
        payment_status VARCHAR(20) DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED', 'DECLINED')),
        gateway_order_id VARCHAR(255),
        gateway_payment_id VARCHAR(255),
        payment_reference TEXT,
        gateway_type VARCHAR(20) DEFAULT 'PAYTM' CHECK (gateway_type IN ('PAYTM', 'UPI', 'RAZORPAY', 'CASHFREE')),
        attendees_data TEXT,
        tier_id VARCHAR(100),
        event_title VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 9. Tickets table
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

      -- 10. Ticket Audit Logs table
      CREATE TABLE IF NOT EXISTS ticket_audit_logs (
        id VARCHAR(100) PRIMARY KEY,
        ticket_id VARCHAR(100) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('WHATSAPP_SENT', 'DOWNLOADED', 'SCAN_ATTEMPT', 'OVERRIDE_CHECKIN', 'MANUAL_CHECKIN', 'RESET_CHECKIN')),
        metadata TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 11. WhatsApp Messages Queue table (for external WhatsApp microservice)
      CREATE TABLE IF NOT EXISTS whatsapp_msg_in_queue (
        id VARCHAR(100) PRIMARY KEY,
        phone VARCHAR(50) NOT NULL,
        msg_type VARCHAR(50) NOT NULL DEFAULT 'TICKET',
        ticket_id VARCHAR(100),
        order_id VARCHAR(100),
        attendee_name VARCHAR(255),
        ticket_type VARCHAR(100),
        venue TEXT,
        date VARCHAR(100),
        time VARCHAR(100),
        qr_data TEXT,
        caption TEXT,
        message_text TEXT,
        payload TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_wa_queue_status ON whatsapp_msg_in_queue(status);
      CREATE INDEX IF NOT EXISTS idx_wa_queue_phone ON whatsapp_msg_in_queue(phone);
    `);

    console.log('🌱 Seeding initial platform settings & admin users...');

    // 1. Platform Settings
    await client.query(`
      INSERT INTO platform_settings (key, value, updated_at) VALUES 
      ('active_gateway', 'PAYTM', NOW()),
      ('default_commission_paise', '200', NOW()),
      ('fixed_gateway_fee_paise', '0', NOW()),
      ('gateway_surcharge_percent', '2.0', NOW()),
      ('gst_on_fee_percent', '18.0', NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `);

    // 2. Super Admin
    const adminHash = bcrypt.hashSync(superAdminPassword, 10);
    const adminId = `usr_superadmin_${Date.now()}`;
    await client.query(`
      INSERT INTO users (id, tenant_id, role, tenant_role, can_create_events, name, email, phone, password_hash, created_at)
      VALUES ($1, NULL, 'SUPER_ADMIN', 'OWNER', 1, $2, $3, '7054916134', $4, NOW())
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'SUPER_ADMIN';
    `, [adminId, superAdminName, superAdminEmail, adminHash]);

    // 3. Seed Primary Tenant: /dd-a (Dandiya)
    const tenantDandiyaId = 'ten_dandiya';
    await client.query(`
      INSERT INTO tenants (
        id, slug, name, gateway_account_id, fee_bearer_type, 
        default_platform_fee, is_gateway_fee_passed_to_customer, status, 
        contact_email, contact_phone, organizer_phone, event_creation_policy, created_at
      ) VALUES (
        $1, 'dd-a', 'Dandiya', 'MUHgMY57617969874640',
        'USER', 200, 1, 'ACTIVE', 'organizer@neoclare.com', '7054916134, 7991665396', '7054916134, 7991665396', 'TENANT_ALLOWED', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        slug = EXCLUDED.slug, 
        contact_phone = EXCLUDED.contact_phone,
        organizer_phone = EXCLUDED.organizer_phone;
    `, [tenantDandiyaId]);

    // 4. Seed Tenant Admin for /dd-a
    const organizerHash = bcrypt.hashSync('organizer123', 10);
    await client.query(`
      INSERT INTO users (id, tenant_id, role, tenant_role, can_create_events, name, email, phone, password_hash, created_at)
      VALUES ($1, $2, 'TENANT_ADMIN', 'OWNER', 1, 'Dandiya Organizer', 'organizer@neoclare.com', '7054916134', $3, NOW())
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, tenant_id = $2, role = 'TENANT_ADMIN';
    `, ['usr_organizer_dandiya', tenantDandiyaId, organizerHash]);

    // 5. Seed Event for /dd-a
    const eventId = 'evt_dandiya_2026';
    const eventTitle = 'परंपरागत डांडिया महोत्सव 2026 - DANDIYA NIGHT';
    const eventDesc = 'अन्नपूर्णा सेवा समिति Presents परंपरागत डांडिया महोत्सव 2026 (Dandiya Night). Event Organized by RB Garment Enterprises & Managed by SR Production. Live DJ, Dhol, Food Stall, Shopping Stall, Special Performance & Selfie Zone. आइए, परंपरा के रंग में रंगें, संस्कृति के संग नाचें... Contact: 7054488454, 8858152101, 7054916134, 7991665396';
    const eventLocation = 'KACHERI Club, Town Hall, Gorakhpur, 273001';
    const bannerUrl = '/dandiya-poster.png';

    await client.query(`
      INSERT INTO events (id, tenant_id, title, banner_url, description, location, start_date, end_date, is_published, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, '2026-10-15T18:00:00Z', '2026-10-19T23:59:00Z', 1, NOW())
      ON CONFLICT (id) DO UPDATE SET 
        title = EXCLUDED.title, 
        banner_url = EXCLUDED.banner_url, 
        description = EXCLUDED.description, 
        location = EXCLUDED.location;
    `, [eventId, tenantDandiyaId, eventTitle, bannerUrl, eventDesc, eventLocation]);

    // 6. Seed Event Sessions
    const sessionId = 'sess_dandiya_day1';
    await client.query(`
      INSERT INTO event_sessions (id, event_id, name, session_date, start_time, end_time, venue_note, sort_order, created_at)
      VALUES ($1, $2, 'Day 1 - Grand Garba & Dandiya Night', '2026-10-15', '06:00 PM', '11:00 PM', 'Gate opens at 5:30 PM. Traditional attire recommended.', 1, NOW())
      ON CONFLICT (id) DO NOTHING;
    `, [sessionId, eventId]);

    // 7. Seed Ticket Tiers
    await client.query(`
      INSERT INTO ticket_tiers (id, event_id, session_id, name, price_in_paise, capacity, is_unlimited, valid_date, early_bird_deadline, created_at)
      VALUES 
      ('tier_dd_general_1', $1, $2, 'Single Entry Pass (Test ₹1)', 100, 500, 0, '2026-10-15', NULL, NOW()),
      ('tier_dd_couple_3', $1, $2, 'Couple Entry Pass (Test ₹3)', 300, 300, 0, '2026-10-15', NULL, NOW()),
      ('tier_dd_vip_5', $1, $2, 'VIP Family Pass (Test ₹5)', 500, 100, 0, '2026-10-15', NULL, NOW())
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        price_in_paise = EXCLUDED.price_in_paise;
    `, [eventId, sessionId]);

    // 8. Seed Secondary Tenant: /dandiya-2026 for compatibility
    const tenantSrId = 'ten_sr_production';
    await client.query(`
      INSERT INTO tenants (
        id, slug, name, gateway_account_id, fee_bearer_type, 
        default_platform_fee, is_gateway_fee_passed_to_customer, status, 
        contact_email, contact_phone, organizer_phone, event_creation_policy, created_at
      ) VALUES (
        $1, 'dandiya-2026', 'SR Production & RB Garment Enterprises', 'MUHgMY57617969874640',
        'USER', 200, 1, 'ACTIVE', 'srproduction091@gmail.com', '7054916134, 7991665396', '7054916134, 7991665396', 'TENANT_ALLOWED', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET 
        organizer_phone = EXCLUDED.organizer_phone,
        contact_phone = EXCLUDED.contact_phone;
    `, [tenantSrId]);

    console.log('✅ PostgreSQL database reset and seeded successfully!\n');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('👤 Super Admin Account:');
    console.log(`   Email:         ${superAdminEmail}`);
    console.log(`   Password:      ${superAdminPassword}`);
    console.log(`   Role:          SUPER_ADMIN`);
    console.log(`   Admin Login:   /admin/login`);
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('🏢 Primary Tenant:');
    console.log('   Tenant URL:    /dd-a');
    console.log('   Tenant Name:   Dandiya');
    console.log('   MID (Paytm):   MUHgMY57617969874640');
    console.log('   WhatsApp Msg:  7054916134, 7991665396');
    console.log('   Organizer Login: organizer@neoclare.com / organizer123');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('🎟️ Seeded Passes for /dd-a:');
    console.log('   • Single Entry Pass:  ₹1.00 (100 paise)');
    console.log('   • Couple Entry Pass:  ₹3.00 (300 paise)');
    console.log('   • VIP Family Pass:    ₹5.00 (500 paise)');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('📬 Queue Table:');
    console.log('   whatsapp_msg_in_queue is ready for microservice polling.');
    console.log('───────────────────────────────────────────────────────────────────\n');
  } catch (err) {
    console.error('❌ Error resetting database:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetDb();
