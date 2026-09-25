/**
 * Automatic Date & Time Active Session Detection Engine
 * 
 * Automatically resolves which event session is currently active for gate admission
 * based on the real-time clock (current date and time), with customizable gate entry buffer.
 */

export interface EventSession {
  id: string;
  event_id?: string;
  name: string;
  session_date: string; // 'YYYY-MM-DD' or date string
  start_time?: string | null; // 'HH:MM' (24-hr)
  end_time?: string | null;   // 'HH:MM' (24-hr)
  venue_note?: string | null;
  sort_order?: number;
}

export interface SessionStatusResult {
  activeSession: EventSession | null;
  status: 'LIVE_NOW' | 'UPCOMING' | 'CONCLUDED' | 'NO_SESSIONS';
  label: string;
  description: string;
  nextSession?: EventSession | null;
  allSessionsWithStatus: Array<EventSession & {
    isLive: boolean;
    isToday: boolean;
    isPast: boolean;
    isFuture: boolean;
    formattedWindow: string;
  }>;
}

/**
 * Parses date + time string into a valid JS Date object
 */
export function parseSessionDateTime(dateStr: string, timeStr?: string | null, isEnd: boolean = false): Date {
  if (!dateStr) return new Date();
  
  // Clean dateStr to YYYY-MM-DD
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
  
  let timeOnly = '00:00:00';
  if (timeStr && timeStr.trim()) {
    const parts = timeStr.trim().split(':');
    const hh = parts[0]?.padStart(2, '0') || '00';
    const mm = parts[1]?.padStart(2, '0') || '00';
    timeOnly = `${hh}:${mm}:00`;
  } else if (isEnd) {
    timeOnly = '23:59:59';
  }

  // Parse in local time
  const [year, month, day] = dateOnly.split('-').map(Number);
  const [hours, minutes, seconds] = timeOnly.split(':').map(Number);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return new Date(dateStr);
  }

  return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, seconds || 0);
}

/**
 * Determines the active session automatically based on real-time current date and time.
 * 
 * Gate entry buffer: Gate opens 2 hours (120 mins) before show starts,
 * and allows entry until 60 minutes after show ends (or until midnight).
 */
export function getActiveSessionByTime(
  sessions: EventSession[] = [],
  currentTime: Date = new Date(),
  gateOpenBufferMinutes: number = 120,
  gateCloseBufferMinutes: number = 60
): SessionStatusResult {
  if (!sessions || sessions.length === 0) {
    return {
      activeSession: null,
      status: 'NO_SESSIONS',
      label: 'No Sessions Configured',
      description: 'Event has no sessions defined.',
      allSessionsWithStatus: []
    };
  }

  const nowMs = currentTime.getTime();
  const todayStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}-${String(currentTime.getDate()).padStart(2, '0')}`;

  const evaluated = sessions.map(session => {
    const startDate = parseSessionDateTime(session.session_date, session.start_time, false);
    const endDate = parseSessionDateTime(session.session_date, session.end_time || session.start_time, true);

    // Gate entry opens `gateOpenBufferMinutes` before show start
    const gateOpenMs = startDate.getTime() - (gateOpenBufferMinutes * 60 * 1000);
    // Gate entry closes `gateCloseBufferMinutes` after show end
    const gateCloseMs = endDate.getTime() + (gateCloseBufferMinutes * 60 * 1000);

    const isLive = nowMs >= gateOpenMs && nowMs <= gateCloseMs;
    const isPast = nowMs > gateCloseMs;
    const isFuture = nowMs < gateOpenMs;
    const isToday = session.session_date?.includes(todayStr) || false;

    const formattedWindow = `${session.session_date}${session.start_time ? ` (${session.start_time}${session.end_time ? ` - ${session.end_time}` : ''})` : ''}`;

    return {
      ...session,
      gateOpenMs,
      gateCloseMs,
      startDate,
      endDate,
      isLive,
      isToday,
      isPast,
      isFuture,
      formattedWindow
    };
  });

  // 1. Find live session right now
  const liveSession = evaluated.find(s => s.isLive);
  if (liveSession) {
    return {
      activeSession: liveSession,
      status: 'LIVE_NOW',
      label: liveSession.name,
      description: `Active Gate Window (${liveSession.formattedWindow})`,
      allSessionsWithStatus: evaluated
    };
  }

  // 2. If no session is live, find upcoming session today or in future
  const upcomingSessions = evaluated.filter(s => s.isFuture).sort((a, b) => a.gateOpenMs - b.gateOpenMs);
  if (upcomingSessions.length > 0) {
    const next = upcomingSessions[0];
    return {
      activeSession: next, // Next active show
      status: 'UPCOMING',
      label: next.name,
      description: `Gate opens at ${new Date(next.gateOpenMs).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} (${next.formattedWindow})`,
      nextSession: next,
      allSessionsWithStatus: evaluated
    };
  }

  // 3. If all sessions past, default to the last concluded session
  const lastSession = evaluated[evaluated.length - 1];
  return {
    activeSession: lastSession,
    status: 'CONCLUDED',
    label: lastSession.name,
    description: `All shows have ended. Last show was ${lastSession.formattedWindow}`,
    allSessionsWithStatus: evaluated
  };
}

/**
 * Validates if a ticket's session matches the real-time active session.
 */
export function validateTicketSessionActive(
  ticketSessionId: string | null | undefined,
  sessions: EventSession[],
  currentTime: Date = new Date()
): {
  isValidForActiveSession: boolean;
  activeSession: EventSession | null;
  ticketSession: EventSession | null;
  message?: string;
} {
  if (!sessions || sessions.length === 0 || !ticketSessionId) {
    return { isValidForActiveSession: true, activeSession: null, ticketSession: null };
  }

  // If there's only 1 session, it's always valid for this event
  if (sessions.length === 1) {
    return { isValidForActiveSession: true, activeSession: sessions[0], ticketSession: sessions[0] };
  }

  const { activeSession, status } = getActiveSessionByTime(sessions, currentTime);
  const ticketSession = sessions.find(s => s.id === ticketSessionId) || null;

  if (!activeSession) {
    return { isValidForActiveSession: true, activeSession: null, ticketSession };
  }

  if (ticketSessionId === activeSession.id) {
    return { isValidForActiveSession: true, activeSession, ticketSession };
  }

  return {
    isValidForActiveSession: false,
    activeSession,
    ticketSession,
    message: `Inactive Session! This ticket is valid for "${ticketSession?.name || 'Another Show'}" (${ticketSession?.session_date || 'different time'}), but the currently active show by date & time is "${activeSession.name}" (${activeSession.session_date} ${activeSession.start_time || ''}).`
  };
}
