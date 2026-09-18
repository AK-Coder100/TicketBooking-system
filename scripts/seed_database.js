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

async function setupDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔄 Connected to Neon PostgreSQL...');
    console.log('📦 Setting up Dandiya 2026 database...');

    const now = new Date().toISOString();

    // 1. Platform Settings
    await client.query(`
      INSERT INTO platform_settings (key, value, updated_at) VALUES 
      ('active_gateway', 'CASHFREE', $1),
      ('default_commission_paise', '200', $1),
      ('fixed_gateway_fee_paise', '100', $1),
      ('gateway_surcharge_percent', '3.0', $1),
      ('gst_on_fee_percent', '0', $1)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `, [now]);

    // 2. Tenant (SR Production / Pappu Singh)
    const tenantId = 'ten_sr_production';
    await client.query(`
      INSERT INTO tenants (
        id, slug, name, gateway_account_id, fee_bearer_type, 
        default_platform_fee, is_gateway_fee_passed_to_customer, status, 
        contact_email, contact_phone, event_creation_policy, created_at
      ) VALUES (
        $1, 'dandiya-2026', 'SR Production & RB Garment Enterprises', 'acc_cf_sr_prod',
        'USER', 200, 1, 'ACTIVE', 'srproduction091@gmail.com', '+919918327131', 'TENANT_ALLOWED', $2
      )
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        slug = EXCLUDED.slug, 
        contact_phone = EXCLUDED.contact_phone
    `, [tenantId, now]);

    // 3. Super Admin
    const adminHash = bcrypt.hashSync('lkyhfrd@123', 10);
    await client.query(`
      INSERT INTO users (id, tenant_id, role, tenant_role, can_create_events, name, email, phone, password_hash, created_at)
      VALUES ($1, NULL, 'SUPER_ADMIN', 'OWNER', 1, 'Super Admin', 'sup_admin@neoclare.com', '+919918327131', $2, $3)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'SUPER_ADMIN'
    `, ['usr_superadmin', adminHash, now]);

    // 4. Organizer
    const organizerHash = bcrypt.hashSync('pappuSingh@1DD', 10);
    await client.query(`
      INSERT INTO users (id, tenant_id, role, tenant_role, can_create_events, name, email, phone, password_hash, created_at)
      VALUES ($1, $2, 'TENANT_ADMIN', 'OWNER', 1, 'Pappu Singh', 'pappu.singh@gmail.com', '+919918327131', $3, $4)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, tenant_id = $2, role = 'TENANT_ADMIN'
    `, ['usr_organizer_pappu', tenantId, organizerHash, now]);

    // 5. Event
    const eventId = 'evt_dandiya_2026';
    const eventTitle = 'परंपरागत डांडिया महोत्सव 2026 - DANDIYA NIGHT';
    const eventDesc = 'अन्नपूर्णा सेवा समिति Presents परंपरागत डांडिया महोत्सव 2026 (Dandiya Night). Event Organized by RB Garment Enterprises & Managed by SR Production. Live DJ, Dhol, Food Stall, Shopping Stall, Special Performance & Selfie Zone. आइए, परंपरा के रंग में रंगें, संस्कृति के संग नाचें... Contact: 7054488454, 8858152101, 9918327131, 7607137577';
    const eventLocation = 'KACHERI Club, Town Hall, Gorakhpur, 273008';
    const bannerUrl = '/dandiya-poster.png';

    await client.query(`
      INSERT INTO events (id, tenant_id, title, banner_url, description, location, start_date, end_date, is_published, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, '2026-10-15T18:00:00Z', '2026-10-19T23:59:00Z', 1, $7)
      ON CONFLICT (id) DO UPDATE SET 
        title = EXCLUDED.title, 
        banner_url = EXCLUDED.banner_url, 
        description = EXCLUDED.description, 
        location = EXCLUDED.location
    `, [eventId, tenantId, eventTitle, bannerUrl, eventDesc, eventLocation, now]);

    console.log('✅ PostgreSQL database seeded successfully with Dandiya 2026 event & passes!');
  } catch (err) {
    console.error('❌ Error seeding database:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();
