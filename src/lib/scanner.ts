import { db } from './db';
import { verifyTicketToken } from './crypto';
import crypto from 'node:crypto';

export async function verifyAndScanTicket({
  qrToken,
  expectedEventId,
  expectedSessionId,
  adminId = 'gate_operator',
  ip = '127.0.0.1',
  deviceInfo = 'Mobile Camera PWA'
}: {
  qrToken: string;
  expectedEventId?: string;
  expectedSessionId?: string;
  adminId?: string;
  ip?: string;
  deviceInfo?: string;
}) {
  const now = new Date().toISOString();

  // 1. Check token validity and HMAC signature
  const cryptoResult = verifyTicketToken(qrToken);
  if (!cryptoResult.valid) {
    return {
      status: 'INVALID',
      color: 'red',
      reason: cryptoResult.error || 'Cryptographic verification failed: tampered QR payload'
    };
  }

  const { ticketId, eventId } = cryptoResult.payload;

  // 2. Fetch ticket with tier, session and event
  const ticket: any = await db.prepare(`
    SELECT t.*, o.payment_status, o.customer_phone, o.customer_email, 
           tt.name as tier_name, tt.event_id, tt.session_id,
           e.title as event_title,
           es.name as session_name, es.session_date, es.start_time, es.end_time
    FROM tickets t
    JOIN orders o ON t.order_id = o.id
    JOIN ticket_tiers tt ON t.tier_id = tt.id
    JOIN events e ON tt.event_id = e.id
    LEFT JOIN event_sessions es ON tt.session_id = es.id
    WHERE t.id = ?
  `).get(ticketId);

  if (!ticket) {
    return {
      status: 'INVALID',
      color: 'red',
      reason: 'Ticket record not found in system database.'
    };
  }

  if (ticket.payment_status !== 'PAID') {
    return {
      status: 'INVALID',
      color: 'red',
      reason: `Order is ${ticket.payment_status}. Access denied for unpaid bookings.`
    };
  }

  // 3. Event check
  if (expectedEventId && ticket.event_id !== expectedEventId) {
    const auditId = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await db.prepare(`
      INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
      VALUES (?, ?, 'SCAN_ATTEMPT', ?, ?)
    `).run(
      auditId,
      ticket.id,
      JSON.stringify({ status: 'WRONG_EVENT', expectedEventId, actualEventId: ticket.event_id, adminId, ip, deviceInfo }),
      now
    );

    return {
      status: 'WRONG_EVENT',
      color: 'red',
      reason: `Wrong Event! This ticket is for "${ticket.event_title}", not the selected event.`,
      ticketEvent: ticket.event_title
    };
  }

  // 4. Automatic Date & Time Active Session Check
  const eventSessions: any[] = await db.prepare(`
    SELECT * FROM event_sessions WHERE event_id = ? ORDER BY sort_order ASC, session_date ASC
  `).all(ticket.event_id);

  let targetSessionId = expectedSessionId;
  let activeSessionObj: any = null;

  if (eventSessions && eventSessions.length > 1) {
    // If expectedSessionId was not provided or set to 'AUTO', resolve by current date and time
    if (!targetSessionId || targetSessionId === 'AUTO') {
      const { getActiveSessionByTime } = await import('./session-utils');
      const timeResult = getActiveSessionByTime(eventSessions, new Date());
      activeSessionObj = timeResult.activeSession;
      targetSessionId = activeSessionObj?.id;
    } else if (targetSessionId !== 'ALL') {
      activeSessionObj = eventSessions.find(s => s.id === targetSessionId);
    }
  }

  if (targetSessionId && targetSessionId !== 'ALL' && ticket.session_id && ticket.session_id !== targetSessionId) {
    const auditId = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await db.prepare(`
      INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
      VALUES (?, ?, 'SCAN_ATTEMPT', ?, ?)
    `).run(
      auditId,
      ticket.id,
      JSON.stringify({
        status: 'WRONG_SESSION',
        expectedSessionId: targetSessionId,
        actualSessionId: ticket.session_id,
        sessionName: ticket.session_name,
        sessionDate: ticket.session_date,
        activeSessionResolved: activeSessionObj?.name,
        adminId,
        ip,
        deviceInfo
      }),
      now
    );

    const activeShowName = activeSessionObj ? `"${activeSessionObj.name}" (${activeSessionObj.session_date} ${activeSessionObj.start_time || ''})` : 'another time slot';
    return {
      status: 'WRONG_SESSION',
      color: 'red',
      reason: `Inactive Show! This pass is valid for "${ticket.session_name || 'Show'}" (${ticket.session_date || 'scheduled date'}), but the currently active show by date & time is ${activeShowName}.`,
      ticket: {
        id: ticket.id,
        attendeeName: ticket.attendee_name,
        attendeeAge: ticket.attendee_age,
        tierName: ticket.tier_name,
        eventTitle: ticket.event_title,
        sessionName: ticket.session_name,
        sessionDate: ticket.session_date,
        activeSessionName: activeSessionObj?.name
      },
      canOverride: true
    };
  }

  // 4. Status Check: Valid (Green) vs Already Scanned (Yellow)
  if (!ticket.checkin_count || ticket.checkin_count === 0) {
    // First scan -> GREEN (VALID)
    await db.prepare(`
      UPDATE tickets 
      SET checked_in_at = ?, checkin_count = 1 
      WHERE id = ?
    `).run(now, ticket.id);

    const auditId = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await db.prepare(`
      INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
      VALUES (?, ?, 'SCAN_ATTEMPT', ?, ?)
    `).run(
      auditId,
      ticket.id,
      JSON.stringify({ status: 'VALID', action: 'FIRST_CHECKIN', adminId, ip, deviceInfo, scannedAt: now }),
      now
    );

    return {
      status: 'VALID',
      color: 'green',
      message: 'Valid Ticket - Access Granted',
      ticket: {
        id: ticket.id,
        attendeeName: ticket.attendee_name,
        attendeeAge: ticket.attendee_age,
        tierName: ticket.tier_name,
        eventTitle: ticket.event_title,
        checkedInAt: now,
        checkinCount: 1
      }
    };
  } else {
    // Already scanned -> YELLOW WARNING
    const auditId = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await db.prepare(`
      INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
      VALUES (?, ?, 'SCAN_ATTEMPT', ?, ?)
    `).run(
      auditId,
      ticket.id,
      JSON.stringify({ status: 'ALREADY_SCANNED', adminId, ip, deviceInfo, firstCheckedInAt: ticket.checked_in_at, attemptTime: now }),
      now
    );

    return {
      status: 'ALREADY_SCANNED',
      color: 'yellow',
      message: 'Ticket Already Scanned!',
      warning: `This ticket was previously checked in on ${new Date(ticket.checked_in_at).toLocaleString('en-IN')}.`,
      ticket: {
        id: ticket.id,
        attendeeName: ticket.attendee_name,
        attendeeAge: ticket.attendee_age,
        tierName: ticket.tier_name,
        eventTitle: ticket.event_title,
        firstCheckedInAt: ticket.checked_in_at,
        checkinCount: ticket.checkin_count,
        isOverrideAllowed: Boolean(ticket.is_override_allowed)
      },
      canOverride: true
    };
  }
}

export async function overrideCheckIn({ ticketId, adminId = 'gate_admin_override', reason = 'Organizer Discretion / Re-entry' }: any) {
  const now = new Date().toISOString();

  const ticket: any = await db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found' };
  }

  const newCount = (ticket.checkin_count || 1) + 1;

  await db.prepare(`
    UPDATE tickets 
    SET checkin_count = ?, is_override_allowed = 1 
    WHERE id = ?
  `).run(newCount, ticketId);

  const auditId = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await db.prepare(`
    INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
    VALUES (?, ?, 'OVERRIDE_CHECKIN', ?, ?)
  `).run(
    auditId,
    ticketId,
    JSON.stringify({ status: 'OVERRIDE_APPROVED', reason, adminId, timestamp: now, newCheckinCount: newCount }),
    now
  );

  return {
    success: true,
    status: 'RE_ENTRY_ALLOWED',
    color: 'green',
    message: `Re-entry Approved! Total check-in passes: ${newCount}`,
    checkinCount: newCount
  };
}
