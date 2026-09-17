import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_multi_tenant_jwt_signing_key_2026';

function generateTicketToken(payload) {
  const data = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ p: payload, s: hmac })).toString('base64url');
}

// Use INSERT OR REPLACE / INSERT OR IGNORE throughout to support re-seeding


const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'ticket_platform.db');
// Try to remove stale DB files for a clean slate; skip if locked by server
for (const ext of ['', '-wal', '-shm']) {
  const f = dbPath + ext;
  if (fs.existsSync(f)) {
    try { fs.unlinkSync(f); } catch (_) { /* file locked by server — will upsert instead */ }
  }
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

console.log('--- Initializing SQLite Schema ---');
db.exec(`
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
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    role TEXT CHECK(role IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'CUSTOMER')) NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    password_hash TEXT,
    created_at TEXT NOT NULL
  );

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

  -- BookMyShow-style event sessions
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

  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    tier_id TEXT NOT NULL REFERENCES ticket_tiers(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

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
    gateway_type TEXT CHECK(gateway_type IN ('RAZORPAY', 'CASHFREE')) DEFAULT 'CASHFREE',
    created_at TEXT NOT NULL
  );

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

  CREATE TABLE IF NOT EXISTS ticket_audit_logs (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    action_type TEXT CHECK(action_type IN ('WHATSAPP_SENT', 'DOWNLOADED', 'SCAN_ATTEMPT', 'OVERRIDE_CHECKIN')) NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL
  );
`);

console.log('--- Seeding Platform Data ---');
const now = new Date().toISOString();

const superAdminHash = bcrypt.hashSync('admin123', 10);
const organizerHash = bcrypt.hashSync('organizer123', 10);

// Platform Settings
db.prepare(`
  INSERT OR REPLACE INTO platform_settings (key, value, updated_at) VALUES 
  ('active_gateway', 'CASHFREE', ?),
  ('default_commission_paise', '200', ?),
  ('gateway_surcharge_percent', '2.0', ?),
  ('gst_on_fee_percent', '18.0', ?),
  ('cashfree_app_id', 'TEST1038492819284719283749281', ?),
  ('razorpay_key_id', 'rzp_test_platform_key', ?)
`).run(now, now, now, now, now, now);

// Tenants
const tenants = [
  { id: 'ten_sunburn_01', slug: 'sunburn',   name: 'Sunburn Music Festival',       gateway_account_id: 'acc_rzp_route_sunburn_78', fee_bearer_type: 'USER',      default_platform_fee: 200, is_gateway_fee_passed_to_customer: 1, status: 'ACTIVE', contact_email: 'ops@sunburn.in',         contact_phone: '+919988776655' },
  { id: 'ten_techconf_02',slug: 'techconf',  name: 'Global AI & Tech Summit',       gateway_account_id: 'acc_cf_split_tech_34',    fee_bearer_type: 'ORGANIZER', default_platform_fee: 200, is_gateway_fee_passed_to_customer: 0, status: 'ACTIVE', contact_email: 'hello@techconf.global',  contact_phone: '+919123456780' },
  { id: 'ten_comedy_03',  slug: 'laughclub', name: 'The Indian Laugh Club',          gateway_account_id: 'acc_rzp_route_laugh_12',  fee_bearer_type: 'USER',      default_platform_fee: 300, is_gateway_fee_passed_to_customer: 1, status: 'ACTIVE', contact_email: 'tickets@laughclub.in', contact_phone: '+919811223344' },
];

const insertTenant = db.prepare(`INSERT OR IGNORE INTO tenants (id, slug, name, gateway_account_id, fee_bearer_type, default_platform_fee, is_gateway_fee_passed_to_customer, status, contact_email, contact_phone, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
for (const t of tenants) insertTenant.run(t.id, t.slug, t.name, t.gateway_account_id, t.fee_bearer_type, t.default_platform_fee, t.is_gateway_fee_passed_to_customer, t.status, t.contact_email, t.contact_phone, now);

// Users
const insertUser = db.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, role, name, email, phone, password_hash, created_at) VALUES (?,?,?,?,?,?,?,?)`);
insertUser.run('usr_superadmin',    null,               'SUPER_ADMIN',   'Executive Super Admin',             'admin@platform.com',     '+919876543210', superAdminHash, now);
insertUser.run('usr_sunburn_admin', 'ten_sunburn_01',   'TENANT_ADMIN',  'Rohan Verma (Sunburn Admin)',       'rohan@sunburn.in',        '+919988776655', organizerHash,  now);
insertUser.run('usr_techconf_admin','ten_techconf_02',  'TENANT_ADMIN',  'Priya Sharma (Tech Summit Lead)',   'priya@techconf.global',   '+919123456780', organizerHash,  now);
insertUser.run('usr_laugh_admin',   'ten_comedy_03',    'TENANT_ADMIN',  'Karan Mehta (Laugh Club Ops)',      'karan@laughclub.in',      '+919811223344', organizerHash,  now);
insertUser.run('usr_customer_vikram',null,              'CUSTOMER',      'Vikramaditya Roy',                  'vikram@example.com',      '+919876543210', null,           now);

// Events
const insertEvent = db.prepare(`INSERT OR IGNORE INTO events (id, tenant_id, title, banner_url, description, location, start_date, end_date, is_published, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)`);
insertEvent.run('evt_sunburn_2026',  'ten_sunburn_01', 'Sunburn Arena 2026 — Electronic Odyssey',               'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&q=80',  'The largest electronic dance music festival featuring world-renowned international DJs.',  'Vagator Beach Arena, North Goa',                    '2026-12-28T16:00:00Z', '2026-12-31T23:59:00Z', now);
insertEvent.run('evt_techconf_2026', 'ten_techconf_02','Global AI Architecture & Cloud Conclave',               'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80',  'A 2-day deep dive into autonomous AI agents, distributed systems, and multi-tenant engineering.','Bengaluru International Exhibition Centre (BIEC)', '2026-11-14T09:00:00Z', '2026-11-15T18:00:00Z', now);
insertEvent.run('evt_comedy_night',  'ten_comedy_03',  'Unfiltered Comedy Live Special with Top Headliners',   'https://images.unsplash.com/photo-1514306191717-452ec28c7814?w=1200&q=80',  'An evening of rip-roaring standup comedy featuring top comedians.',                         'The Cuckoo Club, Bandra West, Mumbai',              '2026-10-20T19:30:00Z', '2026-10-20T22:00:00Z', now);

// Sessions (BookMyShow-style)
const insertSession = db.prepare(`INSERT OR IGNORE INTO event_sessions (id, event_id, name, session_date, start_time, end_time, venue_note, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?,?)`);

// Sunburn — 4 days, each is a session
insertSession.run('sess_sb_d1', 'evt_sunburn_2026', 'Day 1 — Warm-Up Night',          '2026-12-28', '16:00', '23:59', 'Main Stage', 1, now);
insertSession.run('sess_sb_d2', 'evt_sunburn_2026', 'Day 2 — Progressive House Night', '2026-12-29', '16:00', '23:59', 'Main Stage', 2, now);
insertSession.run('sess_sb_d3', 'evt_sunburn_2026', 'Day 3 — Tech Trance Takeover',   '2026-12-30', '16:00', '23:59', 'Main Stage', 3, now);
insertSession.run('sess_sb_d4', 'evt_sunburn_2026', 'Day 4 — Grand Finale Night',     '2026-12-31', '16:00', '23:59', 'Main Stage', 4, now);

// TechConf — 2 days
insertSession.run('sess_tc_d1', 'evt_techconf_2026', 'Day 1 — AI & Intelligent Agents',   '2026-11-14', '09:00', '18:00', 'Hall A', 1, now);
insertSession.run('sess_tc_d2', 'evt_techconf_2026', 'Day 2 — Cloud Systems & Scale',     '2026-11-15', '09:00', '18:00', 'Hall A', 2, now);

// Comedy — 1 session
insertSession.run('sess_com_01', 'evt_comedy_night', 'Comedy Night Live',  '2026-10-20', '19:30', '22:00', 'Main Stage', 1, now);

// Ticket Tiers (per-session, different prices across sessions = like Sunburn where Day 4 is pricier)
const insertTier = db.prepare(`INSERT OR IGNORE INTO ticket_tiers (id, event_id, session_id, name, price_in_paise, capacity, is_unlimited, valid_date, created_at) VALUES (?,?,?,?,?,?,?,?,?)`);

// Sunburn — per-session tiers (escalating prices)
insertTier.run('tier_sb_ga_d1',  'evt_sunburn_2026', 'sess_sb_d1', 'General Access',        149900, 500, 0, '2026-12-28', now);
insertTier.run('tier_sb_vip_d1', 'evt_sunburn_2026', 'sess_sb_d1', 'VIP Lounge Pass',       349900, 100, 0, '2026-12-28', now);
insertTier.run('tier_sb_ga_d2',  'evt_sunburn_2026', 'sess_sb_d2', 'General Access',        199900, 500, 0, '2026-12-29', now);
insertTier.run('tier_sb_vip_d2', 'evt_sunburn_2026', 'sess_sb_d2', 'VIP Lounge Pass',       399900, 100, 0, '2026-12-29', now);
insertTier.run('tier_sb_ga_d3',  'evt_sunburn_2026', 'sess_sb_d3', 'General Access',        249900, 400, 0, '2026-12-30', now);
insertTier.run('tier_sb_vip_d3', 'evt_sunburn_2026', 'sess_sb_d3', 'VIP Lounge Pass',       449900,  80, 0, '2026-12-30', now);
insertTier.run('tier_sb_ga_d4',  'evt_sunburn_2026', 'sess_sb_d4', 'General Access',        299900, 400, 0, '2026-12-31', now);
insertTier.run('tier_sb_vip_d4', 'evt_sunburn_2026', 'sess_sb_d4', 'VIP Ultra Pass',        499900, 100, 0, '2026-12-31', now);

// TechConf — same prices both days (uniform pricing use-case)
insertTier.run('tier_tc_d1_std', 'evt_techconf_2026', 'sess_tc_d1', 'Delegate Pass',        199900, 400, 0, '2026-11-14', now);
insertTier.run('tier_tc_d1_vip', 'evt_techconf_2026', 'sess_tc_d1', 'Workshop + Delegate',  349900,  80, 0, '2026-11-14', now);
insertTier.run('tier_tc_d2_std', 'evt_techconf_2026', 'sess_tc_d2', 'Delegate Pass',        199900, 400, 0, '2026-11-15', now);
insertTier.run('tier_tc_d2_vip', 'evt_techconf_2026', 'sess_tc_d2', 'Workshop + Delegate',  349900,  80, 0, '2026-11-15', now);

// Comedy — 1 session
insertTier.run('tier_com_gen',   'evt_comedy_night', 'sess_com_01', 'General Seating',       49900, 120, 0, '2026-10-20', now);
insertTier.run('tier_com_prem',  'evt_comedy_night', 'sess_com_01', 'Premium Front Row',      99900,  30, 0, '2026-10-20', now);

// Demo Order + Ticket
db.prepare(`
  INSERT OR IGNORE INTO orders (id, tenant_id, user_id, customer_name, customer_phone, customer_email, total_base_price, platform_fee, convenience_fee, total_charged, payment_status, gateway_order_id, gateway_payment_id, gateway_type, created_at)
  VALUES ('ord_demo_001', 'ten_sunburn_01', 'usr_customer_vikram', 'Vikramaditya Roy', '+919876543210', 'vikram@example.com', 149900, 200, 3538, 153638, 'PAID', 'cf_order_998811', 'cf_pay_445522', 'CASHFREE', ?)
`).run(now);

const token1 = generateTicketToken({ ticketId: 'tkt_demo_001', eventId: 'evt_sunburn_2026', attendeeName: 'Vikramaditya Roy' });
db.prepare(`
  INSERT OR IGNORE INTO tickets (id, order_id, tier_id, attendee_name, attendee_age, qr_secret_token, checked_in_at, checkin_count, is_override_allowed, created_at)
  VALUES ('tkt_demo_001', 'ord_demo_001', 'tier_sb_ga_d1', 'Vikramaditya Roy', 26, ?, NULL, 0, 0, ?)
`).run(token1, now);

db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
console.log('✅ Database seeded successfully with session-based ticket model!');
