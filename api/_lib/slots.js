// Meeting slots for a paid spec request: working days and hours from settings.calendar, minus what
// is busy in the developers@pro-algo.com calendar (through Toro) and meetings already booked here.
// A small spread is offered (at most two a day) so the client is not faced with a wall of times.
import { query } from "./db.js";
import { calendarBusy } from "./calendar.js";
import { addDays, isBusinessDay, israelDate } from "./sales-calc.js";

const TZ = "Asia/Jerusalem";

// offset (minutes) of Israel time from UTC at a given instant
function tzOffset(at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return Math.round((asUtc - at.getTime()) / 60000);
}

// "2026-11-24", "09:30" in Israel -> Date
export function israelTime(day, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(...day.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))), h, m));
  return new Date(guess.getTime() - tzOffset(guess) * 60000);
}

const MORNING = "10:00";     // the first time suggested each day (earlier free times are under "more times")
const AFTERNOON = "12:30";
const iso = (s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() });

const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/** -> { slots: [{ start, end }] the first suggestions, days: [{ day, suggested, all }] every free day in range,
 *       calendarConnected, isFree(startIso) for validation } */
export async function availableSlots(settings, minutes, { now = new Date(), excludeId = null } = {}) {
  const cal = settings.calendar;
  const step = 30;
  const buffer = Number(cal.bufferMinutes || 0) * 60000;
  const earliest = now.getTime() + Number(cal.minNoticeHours || 0) * 3600e3;
  const firstDay = israelDate(now);
  const lastDay = addDays(firstDay, Number(cal.daysAhead || 14));

  // busy: Google calendar (when connected) + meetings booked here
  const busyRes = await calendarBusy(settings, israelTime(firstDay, "00:00").toISOString(), israelTime(addDays(lastDay, 1), "00:00").toISOString());
  const busy = (busyRes.ok ? busyRes.busy || [] : []).map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()]);
  const booked = await query(
    `SELECT meeting_start, meeting_end FROM sales.discovery
      WHERE meeting_start IS NOT NULL AND canceled_at IS NULL AND meeting_end > now() AND ($1::uuid IS NULL OR id <> $1)`, [excludeId]);
  for (const r of booked.rows) busy.push([r.meeting_start.getTime(), r.meeting_end.getTime()]);

  const all = [];
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (!cal.days.includes(dow) || !isBusinessDay(day)) continue;
    const dayStart = israelTime(day, cal.from).getTime();
    const dayEnd = israelTime(day, cal.to).getTime();
    for (let t = dayStart; t + minutes * 60000 <= dayEnd; t += step * 60000) {
      const end = t + minutes * 60000;
      if (t < earliest) continue;
      if (busy.some(([b0, b1]) => overlaps(t - buffer, end + buffer, b0, b1))) continue;
      all.push({ day, start: t, end });
    }
  }

  // spread: per day a morning slot (from 10:00) and an afternoon slot (from 12:30), so the client is not
  // faced with a wall of times. Every other free time is sent too (days), for "more times" / "more dates".
  const picked = [];
  const days = [];
  const byDay = new Map();
  for (const s of all) (byDay.get(s.day) || byDay.set(s.day, []).get(s.day)).push(s);
  for (const [day, list] of byDay) {
    const morning = israelTime(day, MORNING).getTime();
    const noon = israelTime(day, AFTERNOON).getTime();
    const am = list.find((s) => s.start >= morning && s.start < noon) || list.find((s) => s.start < noon);
    const pm = list.find((s) => s.start >= noon && (!am || s.start >= am.end + 3600e3));   // an afternoon option, at least an hour after the morning one
    const suggested = [am, pm].filter(Boolean);
    days.push({ day, suggested: suggested.map(iso), all: list.map(iso) });
    if (picked.length < Number(cal.slotsToOffer || 8)) picked.push(...suggested);
  }
  return {
    slots: picked.slice(0, Number(cal.slotsToOffer || 8)).map(iso),
    days,
    calendarConnected: busyRes.ok,
    isFree: (startIso) => all.some((s) => s.start === new Date(startIso).getTime()),
  };
}
