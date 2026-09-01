/**
 * Calendar, Google Calendar & Google Maps Integration Utilities
 */

import { MemorialService, TempleTodo, Household } from '../types';
import { normalizeDateInput } from './memorialCalculator';

export { normalizeDateInput };

/**
 * Format Date to YYYYMMDDTHHmmss for Google Calendar URL & iCal
 */
export function formatToGCalDateTime(dateStr: string, timeStr?: string): string {
  if (!dateStr) return '';
  // Normalize YYYY/MM/DD or YYYY-MM-DD
  const cleanDate = dateStr.replace(/\//g, '-');
  const parts = cleanDate.split('-');
  if (parts.length < 3) return '';

  const y = parts[0].padStart(4, '0');
  const m = parts[1].padStart(2, '0');
  const d = parts[2].padStart(2, '0');

  if (!timeStr || timeStr === '終日') {
    // All day
    return `${y}${m}${d}`;
  }

  const timeParts = timeStr.split(':');
  const hh = (timeParts[0] || '09').padStart(2, '0');
  const mm = (timeParts[1] || '00').padStart(2, '0');
  const ss = '00';

  return `${y}${m}${d}T${hh}${mm}${ss}`;
}

/**
 * Generate Google Calendar New Event URL
 */
export function generateGoogleCalendarUrl(options: {
  title: string;
  startDate: string; // YYYY-MM-DD or YYYY/MM/DD
  startTime?: string; // HH:mm
  endDate?: string;
  endTime?: string;
  details?: string;
  location?: string;
}): string {
  const { title, startDate, startTime, endDate, endTime, details, location } = options;

  let startFormatted = formatToGCalDateTime(startDate, startTime);
  
  // End date calculation
  let endFormatted = '';
  if (endDate || endTime) {
    endFormatted = formatToGCalDateTime(endDate || startDate, endTime || (startTime ? calculateEndTime(startTime, 60) : undefined));
  } else if (startTime) {
    endFormatted = formatToGCalDateTime(startDate, calculateEndTime(startTime, 60));
  } else {
    // All day event end is next day in GCal
    const d = new Date(startDate.replace(/\//g, '-'));
    d.setDate(d.getDate() + 1);
    const nextY = d.getFullYear();
    const nextM = String(d.getMonth() + 1).padStart(2, '0');
    const nextD = String(d.getDate()).padStart(2, '0');
    endFormatted = `${nextY}${nextM}${nextD}`;
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startFormatted}/${endFormatted}`,
  });

  if (details) params.set('details', details);
  if (location) params.set('location', location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Calculate simple end time given HH:mm and duration in minutes
 */
export function calculateEndTime(startTime: string, durationMinutes: number = 60): string {
  if (startTime === '終日' || !startTime) return '終日';
  const parts = startTime.split(':');
  if (parts.length < 2) return '12:00';
  let hours = parseInt(parts[0], 10);
  let minutes = parseInt(parts[1], 10) + durationMinutes;

  hours += Math.floor(minutes / 60);
  minutes = minutes % 60;
  hours = hours % 24;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Generate Google Maps Search URL for Address
 */
export function getGoogleMapsSearchUrl(address: string): string {
  if (!address) return 'https://maps.google.com';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Generate Google Maps Multi-stop Route Directions URL
 */
export function getGoogleMapsMultiRouteUrl(templeAddress: string, stopAddresses: string[]): string {
  const validStops = stopAddresses.filter((a) => a && a.trim().length > 0);
  if (validStops.length === 0) {
    return getGoogleMapsSearchUrl(templeAddress);
  }

  const origin = encodeURIComponent(templeAddress || '現在地');
  const destination = encodeURIComponent(templeAddress || validStops[validStops.length - 1]);
  
  // Waypoints (all intermediate stops)
  const waypoints = validStops.map((a) => encodeURIComponent(a)).join('|');

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}&travelmode=driving`;
}

export interface TanagyoRouteSegment {
  segmentIndex: number;
  startNumber: number;
  endNumber: number;
  label: string;
  startFamilyHead: string;
  endFamilyHead: string;
  routeUrl: string;
  count: number;
}

/**
 * Generate Google Maps Route URL connecting from first patron to last patron in schedule slot
 * (Excludes temple start point as per requirements)
 */
export function getTanagyoRouteUrl(addresses: string[]): string {
  const validStops = addresses.filter((a) => a && a.trim().length > 0);
  if (validStops.length === 0) {
    return 'https://www.google.com/maps';
  }
  if (validStops.length === 1) {
    return getGoogleMapsSearchUrl(validStops[0]);
  }

  const origin = encodeURIComponent(validStops[0]);
  const destination = encodeURIComponent(validStops[validStops.length - 1]);
  const waypointsList = validStops.slice(1, -1);

  if (waypointsList.length > 0) {
    const waypoints = waypointsList.map((a) => encodeURIComponent(a)).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}&travelmode=driving`;
  }

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
}

/**
 * Generate Google Maps Route Segments for Tanagyo visits
 * Google Maps URL allows maximum 10 stops (1 origin + 8 waypoints + 1 destination).
 * When visits exceed 10, divides into continuous segments: 1〜10件目, 10〜19件目, 19〜28件目, etc.
 */
export function getTanagyoRouteSegments(
  households: { familyHead?: string; address?: string; tanagyoAddress?: string }[]
): TanagyoRouteSegment[] {
  const total = households.length;
  if (total === 0) return [];

  if (total <= 10) {
    const addrs = households.map((h) => h.tanagyoAddress || h.address || '').filter(Boolean);
    const startName = households[0]?.familyHead || '';
    const endName = households[total - 1]?.familyHead || '';
    const label = total === 1 ? '1件目' : `1〜${total}件目`;
    return [
      {
        segmentIndex: 0,
        startNumber: 1,
        endNumber: total,
        label,
        startFamilyHead: startName,
        endFamilyHead: endName,
        routeUrl: getTanagyoRouteUrl(addrs),
        count: total,
      },
    ];
  }

  const segments: TanagyoRouteSegment[] = [];
  let k = 0;

  while (true) {
    const startIndex = k * 9;
    const endIndex = Math.min(startIndex + 9, total - 1);
    const startNum = startIndex + 1;
    const endNum = endIndex + 1;

    const slice = households.slice(startIndex, endIndex + 1);
    const addrs = slice.map((h) => h.tanagyoAddress || h.address || '').filter(Boolean);
    const startName = slice[0]?.familyHead || '';
    const endName = slice[slice.length - 1]?.familyHead || '';

    segments.push({
      segmentIndex: k,
      startNumber: startNum,
      endNumber: endNum,
      label: `${startNum}〜${endNum}件目`,
      startFamilyHead: startName,
      endFamilyHead: endName,
      routeUrl: getTanagyoRouteUrl(addrs),
      count: slice.length,
    });

    if (endIndex >= total - 1) {
      break;
    }
    k++;
  }

  return segments;
}

/**
 * Generate .ics iCalendar file content
 */
export function generateICalendarContent(
  services: MemorialService[],
  templeName: string = '寺院'
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Renge Temple Management System//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${templeName} 法要・法務スケジュール`,
    'X-WR-TIMEZONE:Asia/Tokyo',
  ];

  services.forEach((s) => {
    const startStr = formatToGCalDateTime(s.scheduledDate, s.scheduledTime);
    const endStr = formatToGCalDateTime(s.scheduledDate, s.endTime || (s.scheduledTime ? calculateEndTime(s.scheduledTime, 60) : undefined));
    const title = `${s.memorialType} - ${s.chiefMourner}家 (${s.dharmaName || s.deceasedName || ''})`;
    const location = s.venue ? (s.address ? `${s.venue} (${s.address})` : s.venue) : (s.address || '');
    const description = `【施主】${s.chiefMourner}\n【故人/戒名】${s.dharmaName || s.deceasedName}\n【参列予定】${s.attendeeCount}名\n【塔婆】${s.tobaCount ? s.tobaCount + '本' : 'なし'}\n【備考】${s.notes || '特になし'}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:MS-${s.id}@renge-temple`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    lines.push(`DTSTART:${startStr}`);
    lines.push(`DTEND:${endStr}`);
    lines.push(`SUMMARY:${title.replace(/\n/g, ' ')}`);
    if (location) lines.push(`LOCATION:${location.replace(/\n/g, ' ')}`);
    lines.push(`DESCRIPTION:${description.replace(/\n/g, '\\n')}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Download text file helper
 */
export function downloadFile(filename: string, text: string, mimeType: string = 'text/calendar') {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Simple Rokuyo (六曜) calculation helper
 */
const ROKUYO_NAMES = ['大安', '赤口', '先勝', '友引', '先負', '仏滅'];

export function getRokuyo(yearOrDateStr: number | string, month?: number, day?: number): string {
  if (typeof yearOrDateStr === 'string') {
    const clean = yearOrDateStr.replace(/\//g, '-');
    const parts = clean.split('-');
    if (parts.length >= 3) {
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const baseOffset = (m + d) % 6;
      return ROKUYO_NAMES[baseOffset] || '大安';
    }
    return '大安';
  }
  // Approximate Japanese traditional lunar calendar based rokuyo calculation
  // Base offset
  const m = month || 1;
  const d = day || 1;
  const baseOffset = (m + d) % 6;
  return ROKUYO_NAMES[baseOffset] || '大安';
}

/**
 * Calculate the previous day in YYYY/MM/DD format
 */
export function getPreviousDay(dateStr: string): string {
  if (!dateStr) return '';
  const cleanDate = dateStr.replace(/\//g, '-');
  const parts = cleanDate.split('-');
  if (parts.length < 3) return dateStr;
  
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  
  const targetDate = new Date(y, m, d);
  targetDate.setDate(targetDate.getDate() - 1);
  
  const resY = targetDate.getFullYear();
  const resM = String(targetDate.getMonth() + 1).padStart(2, '0');
  const resD = String(targetDate.getDate()).padStart(2, '0');
  
  return `${resY}/${resM}/${resD}`;
}

/**
 * Get current local date string (e.g. "2026/08/18" or "2026-08-18") strictly based on local client time
 */
export function getTodayDateString(separator: '/' | '-' = '/'): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${separator}${m}${separator}${day}`;
}
