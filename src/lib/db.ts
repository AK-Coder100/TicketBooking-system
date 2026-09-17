import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

import os from 'node:os';

function getDatabaseDirectory(): string {
  const localDir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.accessSync(localDir, fs.constants.W_OK);
    return localDir;
  } catch (_) {
    const tmpDir = path.join(os.tmpdir(), 'data');
    if (!fs.existsSync(tmpDir)) {
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
      } catch (_) {}
    }
    return tmpDir;
  }
}

const dbDir = getDatabaseDirectory();
const dbPath = process.env.DB_PATH || path.join(dbDir, 'ticket_platform.db');
export const db = new DatabaseSync(dbPath);

try {
  db.exec('PRAGMA busy_timeout = 10000;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
} catch (err) {
  // If another process is initializing pragmas, ignore
}

let initialized = false;

export function initSchema() {
  if (initialized) return;
  try {

  db.exec(`
    -- Tenants table
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      gateway_account_id TEXT,
      fee_bearer_type TEXT CHECK(fee_bearer_type IN ('USER', 'ORGANIZER')) DEFAULT 'USER',
      default_platform_fee INTEGER DEFAULT 200, -- ₹2.00 in paise
      is_gateway_fee_passed_to_customer INTEGER DEFAULT 1, -- 1 = true, 0 = false
      status TEXT CHECK(status IN ('ACTIVE', 'SUSPENDED')) DEFAULT 'ACTIVE',
      contact_email TEXT,
      contact_phone TEXT,
      created_at TEXT NOT NULL
    );

    -- Platform Settings (Master Gateway & Global Rules)
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Users table (Admins and General Users/Customers)
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

    -- Event Sessions table (BookMyShow-style: each event has 1+ sessions)
    -- A "session" is a distinct show slot — e.g. "Day 1 Evening", "Day 2 Headliner Night"
    -- Single-day events simply have one session.
    CREATE TABLE IF NOT EXISTS event_sessions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      session_date TEXT NOT NULL,        -- YYYY-MM-DD
      start_time TEXT,                   -- HH:MM (24h), optional
      end_time TEXT,                     -- HH:MM (24h), optional
      venue_note TEXT,                   -- e.g. "Main Stage", "Hall B"
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Ticket Tiers table
    -- session_id links a tier to a specific session (NULL = legacy / all-day global tier)
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

    -- 10-Minute Concurrency Inventory Reservations
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
      gateway_type TEXT CHECK(gateway_type IN ('RAZORPAY', 'CASHFREE')) DEFAULT 'CASHFREE',
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
      action_type TEXT CHECK(action_type IN ('WHATSAPP_SENT', 'DOWNLOADED', 'SCAN_ATTEMPT', 'OVERRIDE_CHECKIN')) NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Migrate: add session_id column to ticket_tiers if it doesn't exist yet
  try {
    db.exec(`ALTER TABLE ticket_tiers ADD COLUMN session_id TEXT REFERENCES event_sessions(id) ON DELETE CASCADE`);
  } catch (_) { /* column already exists */ }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN tenant_role TEXT CHECK(tenant_role IN ('OWNER', 'EVENT_MANAGER', 'STAFF')) DEFAULT 'OWNER'`);
  } catch (_) {}

  try {
    db.exec(`ALTER TABLE users ADD COLUMN can_create_events INTEGER DEFAULT 1`);
  } catch (_) {}

  try {
    db.exec(`ALTER TABLE tenants ADD COLUMN event_creation_policy TEXT CHECK(event_creation_policy IN ('ADMIN_ONLY', 'ALL_MEMBERS')) DEFAULT 'ADMIN_ONLY'`);
  } catch (_) {}

    seedData();
    initialized = true;
  } catch (e) {
    initialized = true;
  }
}

function seedData() {
  const check = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'SUPER_ADMIN'").get() as any)?.count;
  const now = new Date().toISOString();

  const superAdminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL || 'admin@platform.com';
  const superAdminPass = process.env.INITIAL_SUPER_ADMIN_PASSWORD || 'admin123';
  const superAdminHash = bcrypt.hashSync(superAdminPass, 10);

  if (!check || check === 0) {
    db.prepare(`
      INSERT INTO users (id, tenant_id, role, name, email, phone, password_hash, created_at)
      VALUES ('usr_superadmin', NULL, 'SUPER_ADMIN', 'Executive Super Admin', ?, '+919876543210', ?, ?)
    `).run(superAdminEmail, superAdminHash, now);
  }

  // Platform Settings
  db.prepare(`
    INSERT OR IGNORE INTO platform_settings (key, value, updated_at) VALUES 
    ('active_gateway', 'CASHFREE', ?),
    ('default_commission_paise', '200', ?),
    ('gateway_surcharge_percent', '2.0', ?),
    ('gst_on_fee_percent', '18.0', ?)
  `).run(now, now, now, now);

  const organizerHash = bcrypt.hashSync('organizer123', 10);
  const shouldSeedDemo = process.env.SEED_DEMO_DATA === 'true';
  if (!shouldSeedDemo) return;

    // 2. Tenants
    const tenants = [
      {
        id: 'ten_sunburn_01',
        slug: 'sunburn',
        name: 'Sunburn Music Festival',
        gateway_account_id: 'acc_rzp_route_sunburn_78',
        fee_bearer_type: 'USER',
        default_platform_fee: 200,
        is_gateway_fee_passed_to_customer: 1,
        status: 'ACTIVE',
        contact_email: 'ops@sunburn.in',
        contact_phone: '+919988776655'
      },
      {
        id: 'ten_techconf_02',
        slug: 'techconf',
        name: 'Global AI & Tech Summit',
        gateway_account_id: 'acc_cf_split_tech_34',
        fee_bearer_type: 'ORGANIZER',
        default_platform_fee: 200,
        is_gateway_fee_passed_to_customer: 0,
        status: 'ACTIVE',
        contact_email: 'hello@techconf.global',
        contact_phone: '+919123456780'
      },
      {
        id: 'ten_comedy_03',
        slug: 'laughclub',
        name: 'The Indian Laugh Club',
        gateway_account_id: 'acc_rzp_route_laugh_12',
        fee_bearer_type: 'USER',
        default_platform_fee: 300,
        is_gateway_fee_passed_to_customer: 1,
        status: 'ACTIVE',
        contact_email: 'tickets@laughclub.in',
        contact_phone: '+919811223344'
      }
    ];

    for (const t of tenants) {
      db.prepare(`
        INSERT OR IGNORE INTO tenants (id, slug, name, gateway_account_id, fee_bearer_type, default_platform_fee, is_gateway_fee_passed_to_customer, status, contact_email, contact_phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(t.id, t.slug, t.name, t.gateway_account_id, t.fee_bearer_type, t.default_platform_fee, t.is_gateway_fee_passed_to_customer, t.status, t.contact_email, t.contact_phone, now);
    }

    // Tenant Admins with bcrypt password "organizer123"
    db.prepare(`
      INSERT OR IGNORE INTO users (id, tenant_id, role, name, email, phone, password_hash, created_at)
      VALUES 
      ('usr_sunburn_admin', 'ten_sunburn_01', 'TENANT_ADMIN', 'Rohan Verma', 'rohan@sunburn.in', '+919988776655', ?, ?),
      ('usr_techconf_admin', 'ten_techconf_02', 'TENANT_ADMIN', 'Priya Sharma', 'priya@techconf.global', '+919123456780', ?, ?),
      ('usr_laugh_admin', 'ten_comedy_03', 'TENANT_ADMIN', 'Karan Mehta', 'karan@laughclub.in', '+919811223344', ?, ?)
    `).run(organizerHash, now, organizerHash, now, organizerHash, now);

    // Seed Events
    const events = [
      {
        id: 'evt_sunburn_2026',
        tenant_id: 'ten_sunburn_01',
        title: 'Sunburn Arena 2026 - Electronic Odyssey',
        banner_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&q=80',
        description: 'The premier electronic music festival featuring international superstar DJs, laser displays, and high-energy crowd vibes.',
        location: 'Vagator Beach Arena, North Goa',
        start_date: '2026-12-28T16:00:00Z',
        end_date: '2026-12-31T23:59:00Z'
      },
      {
        id: 'evt_techconf_2026',
        tenant_id: 'ten_techconf_02',
        title: 'Global AI Architecture & Cloud Conclave',
        banner_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80',
        description: 'A 2-day deep dive into autonomous AI agents, distributed systems, multimodal intelligence, and multi-tenant engineering.',
        location: 'Bengaluru International Exhibition Centre (BIEC)',
        start_date: '2026-11-14T09:00:00Z',
        end_date: '2026-11-15T18:00:00Z'
      },
      {
        id: 'evt_comedy_night',
        tenant_id: 'ten_comedy_03',
        title: 'Unfiltered Comedy Live Special with Top Headliners',
        banner_url: 'https://images.unsplash.com/photo-1514306191717-452ec28c7814?w=1200&q=80',
        description: 'An evening of rip-roaring standup comedy, crowd work, and hilarious anecdotes featuring top comedians in an intimate acoustic club setting.',
        location: 'The Cuckoo Club, Bandra West, Mumbai',
        start_date: '2026-10-20T19:30:00Z',
        end_date: '2026-10-20T22:00:00Z'
      }
    ];

    for (const e of events) {
      db.prepare(`
        INSERT OR IGNORE INTO events (id, tenant_id, title, banner_url, description, location, start_date, end_date, is_published, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(e.id, e.tenant_id, e.title, e.banner_url, e.description, e.location, e.start_date, e.end_date, now);
    }

    // Seed Sessions for each event
    const sessions = [
      // Sunburn — 4 sessions
      { id: 'sess_sb_d1', event_id: 'evt_sunburn_2026', name: 'Day 1 — Warm-Up Night', session_date: '2026-12-28', start_time: '16:00', end_time: '23:59', venue_note: 'Main Stage', sort_order: 1 },
      { id: 'sess_sb_d2', event_id: 'evt_sunburn_2026', name: 'Day 2 — Progressive House', session_date: '2026-12-29', start_time: '16:00', end_time: '23:59', venue_note: 'Main Stage', sort_order: 2 },
      { id: 'sess_sb_d3', event_id: 'evt_sunburn_2026', name: 'Day 3 — Tech Trance Night', session_date: '2026-12-30', start_time: '16:00', end_time: '23:59', venue_note: 'Main Stage', sort_order: 3 },
      { id: 'sess_sb_d4', event_id: 'evt_sunburn_2026', name: 'Day 4 — Grand Finale', session_date: '2026-12-31', start_time: '16:00', end_time: '23:59', venue_note: 'Main Stage', sort_order: 4 },
      // TechConf — 2 sessions
      { id: 'sess_tc_d1', event_id: 'evt_techconf_2026', name: 'Day 1 — AI & Agents', session_date: '2026-11-14', start_time: '09:00', end_time: '18:00', venue_note: 'Hall A', sort_order: 1 },
      { id: 'sess_tc_d2', event_id: 'evt_techconf_2026', name: 'Day 2 — Cloud & Systems', session_date: '2026-11-15', start_time: '09:00', end_time: '18:00', venue_note: 'Hall A', sort_order: 2 },
      // Comedy — 1 session
      { id: 'sess_com_01', event_id: 'evt_comedy_night', name: 'Comedy Night Live', session_date: '2026-10-20', start_time: '19:30', end_time: '22:00', venue_note: 'Main Stage', sort_order: 1 },
    ];

    for (const s of sessions) {
      db.prepare(`
        INSERT OR IGNORE INTO event_sessions (id, event_id, name, session_date, start_time, end_time, venue_note, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(s.id, s.event_id, s.name, s.session_date, s.start_time, s.end_time, s.venue_note, s.sort_order, now);
    }

    // Seed Tiers (with session_id linkage)
    const tiers = [
      // Sunburn per-session tiers
      { id: 'tier_sb_ga_d1',  event_id: 'evt_sunburn_2026', session_id: 'sess_sb_d1', name: 'General Access',    price: 149900, cap: 500, unl: 0, date: '2026-12-28' },
      { id: 'tier_sb_vip_d1', event_id: 'evt_sunburn_2026', session_id: 'sess_sb_d1', name: 'VIP Lounge Pass',   price: 349900, cap: 100, unl: 0, date: '2026-12-28' },
      { id: 'tier_sb_ga_d2',  event_id: 'evt_sunburn_2026', session_id: 'sess_sb_d2', name: 'General Access',    price: 199900, cap: 500, unl: 0, date: '2026-12-29' },
      { id: 'tier_sb_vip_d2', event_id: 'evt_sunburn_2026', session_id: 'sess_sb_d2', name: 'VIP Lounge Pass',   price: 399900, cap: 100, unl: 0, date: '2026-12-29' },
      { id: 'tier_sb_ga_d3',  event_id: 'evt_sunburn_2026', session_id: 'sess_sb_d3', name: 'General Access',    price: 249900, cap: 400, unl: 0, date: '2026-12-30' },
      { id: 'tier_sb_vip_d3', event_id: 'evt_sunburn_2026', session_id: 'sess_sb_d3', name: 'VIP Lounge Pass',   price: 449900, cap:  80, unl: 0, date: '2026-12-30' },
      { id: 'tier_sb_ga_d4',  event_id: 'evt_sunburn_2026', session_id: 'sess_sb_d4', name: 'General Access',    price: 299900, cap: 400, unl: 0, date: '2026-12-31' },
      { id: 'tier_sb_vip_d4', event_id: 'evt_sunburn_2026', session_id: 'sess_sb_d4', name: 'VIP Ultra Pass',    price: 499900, cap: 100, unl: 0, date: '2026-12-31' },
      // TechConf per-session
      { id: 'tier_tc_d1_std', event_id: 'evt_techconf_2026', session_id: 'sess_tc_d1', name: 'Delegate Pass',    price: 199900, cap: 400, unl: 0, date: '2026-11-14' },
      { id: 'tier_tc_d1_vip', event_id: 'evt_techconf_2026', session_id: 'sess_tc_d1', name: 'Workshop + Delegate', price: 349900, cap: 80, unl: 0, date: '2026-11-14' },
      { id: 'tier_tc_d2_std', event_id: 'evt_techconf_2026', session_id: 'sess_tc_d2', name: 'Delegate Pass',    price: 199900, cap: 400, unl: 0, date: '2026-11-15' },
      { id: 'tier_tc_d2_vip', event_id: 'evt_techconf_2026', session_id: 'sess_tc_d2', name: 'Workshop + Delegate', price: 349900, cap: 80, unl: 0, date: '2026-11-15' },
      // Comedy single session
      { id: 'tier_com_gen',   event_id: 'evt_comedy_night', session_id: 'sess_com_01', name: 'General Seating',  price:  49900, cap: 120, unl: 0, date: '2026-10-20' },
      { id: 'tier_com_prem',  event_id: 'evt_comedy_night', session_id: 'sess_com_01', name: 'Premium Front Row', price:  99900, cap:  30, unl: 0, date: '2026-10-20' },
    ];

    for (const tr of tiers) {
      db.prepare(`
        INSERT OR IGNORE INTO ticket_tiers (id, event_id, session_id, name, price_in_paise, capacity, is_unlimited, valid_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tr.id, tr.event_id, tr.session_id, tr.name, tr.price, tr.cap, tr.unl, tr.date, now);
    }
}

initSchema();
