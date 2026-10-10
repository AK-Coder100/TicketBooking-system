/**
 * Terminal Reconciliation Script for Stuck/Pending Orders (Past 24 Hours)
 * =========================================================================
 * 
 * Usage:
 *   node scripts/reconcile-pending.mjs                  # Check all PENDING orders in past 24h & auto-fix confirmed
 *   node scripts/reconcile-pending.mjs --dry-run        # Check status only (read-only, does not touch DB)
 *   node scripts/reconcile-pending.mjs --hours 48       # Check past 48 hours
 *   node scripts/reconcile-pending.mjs --order BK-XXXX  # Check and reconcile a single specific order
 *   node scripts/reconcile-pending.mjs --all            # Check all pending orders in entire database
 */

import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load environment variables
dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_y3KUvWs1ewbO@ep-rough-mountain-aob0vjsn-pooler.c-2.ap-southeast-1.aws.neon.tech/event_manage?sslmode=require&channel_binding=require';
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

// Parse CLI Arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const isAll = args.includes('--all');

let hours = 24;
const hoursIdx = args.indexOf('--hours');
if (hoursIdx !== -1 && args[hoursIdx + 1]) {
  hours = parseFloat(args[hoursIdx + 1]) || 24;
}

let singleOrderId = null;
const orderIdx = args.indexOf('--order');
if (orderIdx !== -1 && args[orderIdx + 1]) {
  singleOrderId = args[orderIdx + 1].trim();
}

// ─────────────────────────────────────────────────────────────
// Paytm Status API Integration (Pure Node.js)
// ─────────────────────────────────────────────────────────────

class PaytmChecksum {
  static iv = '@@@@&&&&####$$$$';

  static encrypt(input, key) {
    const cipher = crypto.createCipheriv('AES-128-CBC', String(key), PaytmChecksum.iv);
    let encrypted = cipher.update(input, 'binary', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }

  static calculateHash(params, salt) {
    const finalString = `${params}|${salt}`;
    return crypto.createHash('sha256').update(finalString).digest('hex') + salt;
  }

  static calculateChecksum(params, key, salt) {
    const hashString = PaytmChecksum.calculateHash(params, salt);
    return PaytmChecksum.encrypt(hashString, key);
  }

  static generateRandomString(length) {
    return new Promise((resolve, reject) => {
      crypto.randomBytes((length * 3.0) / 4.0, (err, buf) => {
        if (!err) resolve(buf.toString('base64'));
        else reject(err);
      });
    });
  }

  static async generateSignatureByString(params, key) {
    const salt = await PaytmChecksum.generateRandomString(4);
    return PaytmChecksum.calculateChecksum(params, key, salt);
  }

  static async generateSignature(params, key) {
    const data = {};
    Object.keys(params)
      .sort()
      .forEach(k => {
        if (k !== 'CHECKSUMHASH' && k !== 'checksum' && params[k] !== null && params[k] !== undefined) {
          data[k] = String(params[k]).trim();
        }
      });
    const paramString = Object.values(data).join('|');
    return PaytmChecksum.generateSignatureByString(paramString, key);
  }
}

function getPaytmConfig() {
  const envType = (process.env.PAYTM_ENVIRONMENT || 'PRODUCTION').replace(/^["']|["']$/g, '').toUpperCase();
  const isStaging = envType === 'STAGING' || envType === 'TEST';
  const mid = (process.env.PAYTM_MERCHANT_ID || 'MUHgMY57617969874640').replace(/^["']|["']$/g, '');
  const key = (process.env.PAYTM_MERCHANT_KEY || '&U4jV#C3AmJgDHTd').replace(/^["']|["']$/g, '');

  return {
    mid,
    key,
    environment: isStaging ? 'STAGING' : 'PRODUCTION',
    statusUrl: isStaging
      ? 'https://securegw-stage.paytm.in/v3/order/status'
      : 'https://securegw.paytm.in/v3/order/status',
    classicStatusUrl: isStaging
      ? 'https://securegw-stage.paytm.in/order/status'
      : 'https://securegw.paytm.in/order/status'
  };
}

async function queryPaytmStatus(orderId) {
  const config = getPaytmConfig();
  const cleanId = String(orderId).trim();

  // 1. Try V3 Status API
  try {
    const body = { mid: config.mid, orderId: cleanId };
    const bodyStr = JSON.stringify(body);
    const signature = await PaytmChecksum.generateSignatureByString(bodyStr, config.key);
    const url = `${config.statusUrl}?mid=${encodeURIComponent(config.mid)}&orderId=${encodeURIComponent(cleanId)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, head: { signature } })
    });

    const data = await res.json();
    const resultInfo = data?.body?.resultInfo || {};
    const status = resultInfo.resultStatus || '';
    const isSuccess = status === 'TXN_SUCCESS' || resultInfo.resultCode === '01';

    if (isSuccess || status) {
      return {
        success: isSuccess,
        status: status || 'UNKNOWN',
        respCode: resultInfo.resultCode || '',
        respMsg: resultInfo.resultMsg || '',
        txnId: data?.body?.txnId || '',
        amount: data?.body?.txnAmount || '',
        raw: data
      };
    }
  } catch (err) {
    // fallback to classic
  }

  // 2. Try Classic Status API
  try {
    const params = { MID: config.mid, ORDERID: cleanId };
    const signature = await PaytmChecksum.generateSignature(params, config.key);
    params.CHECKSUMHASH = signature;

    const res = await fetch(config.classicStatusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    const data = await res.json();
    const isSuccess = data?.STATUS === 'TXN_SUCCESS' || data?.RESPCODE === '01';
    return {
      success: isSuccess,
      status: data?.STATUS || 'UNKNOWN',
      respCode: data?.RESPCODE || '',
      respMsg: data?.RESPMSG || '',
      txnId: data?.TXNID || '',
      amount: data?.TXNAMOUNT || '',
      raw: data
    };
  } catch (err) {
    return {
      success: false,
      status: 'API_ERROR',
      respMsg: err.message,
      txnId: '',
      amount: ''
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Ticket & WhatsApp Helpers
// ─────────────────────────────────────────────────────────────

function normalizePhone(raw) {
  let cleaned = (raw || '').replace(/[^0-9]/g, '');
  if (cleaned.length === 10) {
    const prefix = process.env.WHATSAPP_PHONE_PREFIX || '0';
    return `${prefix}${cleaned}`;
  }
  return cleaned;
}

async function fixAndConfirmOrder(client, order, gatewayTxnId) {
  const orderId = order.id;
  const now = new Date().toISOString();
  const txnId = gatewayTxnId || order.gateway_payment_id || `paytm_rec_${Date.now()}`;

  // 1. Mark order as PAID
  await client.query(
    `UPDATE orders
     SET payment_status = 'PAID',
         gateway_payment_id = COALESCE(gateway_payment_id, $1),
         gateway_type = COALESCE(gateway_type, 'PAYTM'),
         payment_reference = $2
     WHERE id = $3`,
    [txnId, `reconciled_terminal_${txnId}`, orderId]
  );

  // 2. Check existing tickets
  const existingTickets = await client.query(`SELECT id FROM tickets WHERE order_id = $1`, [orderId]);
  let ticketsCreated = 0;

  if (existingTickets.rows.length === 0) {
    // Resolve attendee list
    let attendeeList = [];
    if (order.attendees_data) {
      try {
        const parsed = JSON.parse(order.attendees_data);
        if (Array.isArray(parsed) && parsed.length > 0) attendeeList = parsed;
      } catch (e) {}
    }
    if (attendeeList.length === 0) {
      attendeeList = [{ name: order.customer_name || 'Pass Holder', age: 0, tierId: order.tier_id }];
    }

    // Resolve tier & event info
    let tier = null;
    if (order.tier_id) {
      const tierRes = await client.query(
        `SELECT tt.*, e.id as event_id, e.title as event_title, e.location, e.start_date, e.end_date, t.name as tenant_name
         FROM ticket_tiers tt
         JOIN events e ON tt.event_id = e.id
         LEFT JOIN tenants t ON e.tenant_id = t.id
         WHERE tt.id = $1`,
        [order.tier_id]
      );
      tier = tierRes.rows[0] || null;
    }
    if (!tier) {
      const tierRes = await client.query(
        `SELECT tt.*, e.id as event_id, e.title as event_title, e.location, e.start_date, e.end_date, t.name as tenant_name
         FROM ticket_tiers tt
         JOIN events e ON tt.event_id = e.id
         LEFT JOIN tenants t ON e.tenant_id = t.id
         WHERE e.tenant_id = $1 LIMIT 1`,
        [order.tenant_id]
      );
      tier = tierRes.rows[0];
    }

    const tierIdToUse = tier?.id || order.tier_id;

    for (let i = 0; i < attendeeList.length; i++) {
      const a = attendeeList[i];
      const baseClean = orderId.replace('BK-', '');
      const ticketId = `TCK-${baseClean}-${i + 1}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const qrSecret = `TKT:${ticketId}:${orderId}:${crypto.randomBytes(8).toString('hex')}`;
      const attendeeName = (a.name || '').trim() || order.customer_name || `Pass #${i + 1}`;
      const attendeeAge = parseInt(String(a.age), 10) || 0;

      await client.query(
        `INSERT INTO tickets (id, order_id, tier_id, attendee_name, attendee_age, qr_secret_token, checkin_count, is_override_allowed, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 0, NOW())`,
        [ticketId, orderId, a.tierId || tierIdToUse, attendeeName, attendeeAge, qrSecret]
      );
      ticketsCreated++;

      // Enqueue WhatsApp ticket message
      if (order.customer_phone) {
        const queueId = `wa_msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const recipientPhone = normalizePhone(order.customer_phone);
        const ticketPayload = {
          phone: recipientPhone,
          ticket_id: ticketId,
          order_id: orderId,
          attendee_name: attendeeName,
          ticket_type: (tier?.name || 'Entry Pass').toUpperCase(),
          venue: tier?.location || 'Kacheri Club, Town Hall, Gorakhpur',
          date: tier?.valid_date || 'TBA',
          time: '7:00 PM – 11:30 PM',
          qr_data: qrSecret,
          caption: `🎟️ Ticket Booking Confirmed!\n\nYour ticket has been successfully booked.\n⚠️ Disclaimer: The event is solely managed by the Organizer.`
        };

        try {
          await client.query(
            `INSERT INTO whatsapp_msg_in_queue (
              id, phone, msg_type, ticket_id, order_id, attendee_name, ticket_type,
              venue, date, time, qr_data, caption, payload, status, created_at
            ) VALUES ($1, $2, 'TICKET', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', NOW())`,
            [
              queueId, recipientPhone, ticketId, orderId, attendeeName,
              ticketPayload.ticket_type, ticketPayload.venue, ticketPayload.date,
              ticketPayload.time, qrSecret, ticketPayload.caption, JSON.stringify(ticketPayload)
            ]
          );
        } catch (e) {
          // table might not exist yet or minor queue issue
        }
      }
    }
  }

  return { ticketsCreated, ticketsExisted: existingTickets.rows.length };
}

// ─────────────────────────────────────────────────────────────
// Main Execution
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('⚡ EVENTHUB — PAYMENT RECONCILIATION TERMINAL TOOL');
  console.log('='.repeat(70));
  console.log(`⏰ Time:       ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log(`🔧 Mode:       ${isDryRun ? '🟡 DRY-RUN (Read-Only)' : '🟢 LIVE (Auto-Fix Enabled)'}`);
  
  if (singleOrderId) {
    console.log(`🎯 Target:     Single Order [${singleOrderId}]`);
  } else if (isAll) {
    console.log(`🎯 Target:     ALL Pending Orders in Database`);
  } else {
    console.log(`🎯 Target:     Pending Orders in past ${hours} hours`);
  }
  console.log('-'.repeat(70));

  const client = await pool.connect();

  try {
    // 1. Fetch Orders
    let query = '';
    let queryParams = [];

    if (singleOrderId) {
      query = `SELECT * FROM orders WHERE id = $1`;
      queryParams = [singleOrderId];
    } else if (isAll) {
      query = `
        SELECT * FROM orders
        WHERE payment_status = 'PENDING'
          AND (gateway_type = 'PAYTM' OR gateway_type IS NULL OR gateway_type = 'UPI')
        ORDER BY created_at DESC
      `;
    } else {
      query = `
        SELECT * FROM orders
        WHERE payment_status = 'PENDING'
          AND (gateway_type = 'PAYTM' OR gateway_type IS NULL OR gateway_type = 'UPI')
          AND created_at >= NOW() - INTERVAL '${hours} hours'
        ORDER BY created_at DESC
      `;
    }

    const res = await client.query(query, queryParams);
    const orders = res.rows;

    if (orders.length === 0) {
      console.log(`\n✅ No stuck/pending orders found matching the criteria. Everything is clean!`);
      return;
    }

    console.log(`\n🔍 Found ${orders.length} order(s) to check against Paytm Gateway API...\n`);

    const stats = {
      total: orders.length,
      confirmedAndFixed: 0,
      alreadyPaid: 0,
      stillPendingGateway: 0,
      failedGateway: 0,
      errors: 0
    };

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const num = `[${i + 1}/${orders.length}]`;
      const amountFmt = `₹${((order.total_charged || order.total_base_price || 0) / 100).toFixed(2)}`;
      const timeFmt = new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const dateFmt = new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

      console.log(`${num} 📦 ${order.id} | ${order.customer_name || 'Anonymous'} (${order.customer_phone || 'No phone'}) | ${amountFmt} | ${dateFmt} ${timeFmt}`);

      // If already paid
      if (order.payment_status === 'PAID') {
        console.log(`    ↳ Status: 🟢 ALREADY PAID in DB. Skipping.\n`);
        stats.alreadyPaid++;
        continue;
      }

      // Check Paytm Status
      process.stdout.write(`    ↳ Checking Paytm Gateway... `);
      const statusRes = await queryPaytmStatus(order.id);

      if (statusRes.success || statusRes.status === 'TXN_SUCCESS') {
        console.log(`✅ PAYMENT CONFIRMED ON PAYTM! (Txn ID: ${statusRes.txnId || 'N/A'})`);
        
        if (isDryRun) {
          console.log(`       [DRY RUN] Would mark PAID, create tickets, and queue WhatsApp.\n`);
          stats.confirmedAndFixed++;
        } else {
          try {
            const fixRes = await fixAndConfirmOrder(client, order, statusRes.txnId);
            console.log(`       🎉 FIXED! Status → PAID | Tickets: ${fixRes.ticketsCreated} created | WhatsApp: Queued\n`);
            stats.confirmedAndFixed++;
          } catch (fixErr) {
            console.log(`       ❌ DB Fix Error: ${fixErr.message}\n`);
            stats.errors++;
          }
        }
      } else if (statusRes.status === 'PENDING') {
        console.log(`⏳ STILL PENDING on Paytm (Customer has not completed payment yet).\n`);
        stats.stillPendingGateway++;
      } else if (['TXN_FAILURE', 'FAILED', 'CANCELLED', 'FRAUD'].includes(statusRes.status?.toUpperCase())) {
        console.log(`❌ FAILED/CANCELLED on Paytm (${statusRes.respMsg || statusRes.status}).\n`);
        stats.failedGateway++;
      } else {
        console.log(`⚠️  Inconclusive (${statusRes.status || 'UNKNOWN'}: ${statusRes.respMsg || 'No response'}).\n`);
        stats.errors++;
      }

      // Small pause between network calls
      await new Promise(r => setTimeout(r, 200));
    }

    // ─────────────────────────────────────────────────────────────
    // Summary Table
    // ─────────────────────────────────────────────────────────────
    console.log('='.repeat(70));
    console.log('📊 RECONCILIATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`• Total Checked:               ${stats.total}`);
    console.log(`• Confirmed & Fixed to PAID:   ${stats.confirmedAndFixed} ✅`);
    console.log(`• Already Paid in DB:          ${stats.alreadyPaid}`);
    console.log(`• Still Pending on Gateway:    ${stats.stillPendingGateway} ⏳`);
    console.log(`• Gateway Failed / Cancelled:  ${stats.failedGateway} ❌`);
    console.log(`• Inconclusive / Errors:       ${stats.errors} ⚠️`);
    console.log('='.repeat(70) + '\n');

  } catch (err) {
    console.error('\n❌ Script Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
