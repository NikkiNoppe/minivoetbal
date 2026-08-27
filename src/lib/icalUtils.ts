/**
 * iCal and CSV generation utilities for match schedule export
 * Generates properly formatted files for calendar and spreadsheet import
 */

export interface ICalEvent {
  id: string | number;
  title: string;
  date: string;      // YYYY-MM-DD format
  time: string;      // HH:MM format
  location: string;
  description?: string;
  duration?: number; // Duration in minutes (default: 60)
}

// ============================================================================
// iCal Generation
// ============================================================================

/**
 * Formats a date string (YYYY-MM-DD) to iCal format (YYYYMMDD)
 */
const formatICalDate = (dateStr: string): string => {
  // Extract date part if it's a full ISO string
  const dateOnly = dateStr.split('T')[0];
  return dateOnly.replace(/-/g, '');
};

/**
 * Formats a time string (HH:MM) to iCal format (HHMMSS)
 */
const formatICalTime = (timeStr: string): string => {
  const [hours, minutes] = timeStr.split(':');
  return `${hours.padStart(2, '0')}${minutes.padStart(2, '0')}00`;
};

/**
 * Combines date and time into iCal datetime format (YYYYMMDDTHHMMSS)
 */
const formatICalDateTime = (dateStr: string, timeStr: string): string => {
  return `${formatICalDate(dateStr)}T${formatICalTime(timeStr)}`;
};

/**
 * Calculates end time based on start time and duration
 */
const calculateEndTime = (timeStr: string, durationMinutes: number): string => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
};

/**
 * Gets current timestamp in UTC format for DTSTAMP
 */
const getICalTimestamp = (): string => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const hours = now.getUTCHours().toString().padStart(2, '0');
  const minutes = now.getUTCMinutes().toString().padStart(2, '0');
  const seconds = now.getUTCSeconds().toString().padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

/**
 * Escapes special characters for iCal text fields
 */
const escapeICalText = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
};

/**
 * Validates date format (YYYY-MM-DD or ISO string)
 */
const isValidDate = (dateStr: string): boolean => {
  if (!dateStr) return false;
  // Accept both YYYY-MM-DD and full ISO strings
  const dateOnly = dateStr.split('T')[0];
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  return regex.test(dateOnly);
};

/**
 * Validates time format (HH:MM)
 */
const isValidTime = (timeStr: string): boolean => {
  if (!timeStr) return false;
  const regex = /^\d{1,2}:\d{2}$/;
  return regex.test(timeStr);
};

/**
 * Generates the VTIMEZONE component for Europe/Brussels
 */
const generateVTimezone = (): string => {
  return [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Brussels',
    'X-LIC-LOCATION:Europe/Brussels',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ].join('\r\n');
};

/**
 * Generates a single iCal event (VEVENT)
 */
const generateICalEvent = (event: ICalEvent, domain: string = 'harelbeekse-minivoetbal.be'): string => {
  const duration = event.duration || 60;
  const endTime = calculateEndTime(event.time, duration);
  const timestamp = getICalTimestamp();
  
  const lines = [
    'BEGIN:VEVENT',
    `UID:match-${event.id}@${domain}`,
    `DTSTAMP:${timestamp}`,
    `DTSTART;TZID=Europe/Brussels:${formatICalDateTime(event.date, event.time)}`,
    `DTEND;TZID=Europe/Brussels:${formatICalDateTime(event.date, endTime)}`,
    `SUMMARY:${escapeICalText(event.title)}`,
    `LOCATION:${escapeICalText(event.location || 'Harelbekese Minivoetbal')}`,
  ];
  
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  }
  
  lines.push(
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT'
  );
  
  return lines.join('\r\n');
};

/**
 * Generates a complete iCal file content from an array of events
 */
export const generateICalFile = (events: ICalEvent[], calendarName?: string): string => {
  // Filter valid events only
  const validEvents = events.filter(event => {
    const validDate = isValidDate(event.date);
    const validTime = isValidTime(event.time);
    if (!validDate || !validTime) {
      console.warn(`Invalid event skipped: date=${event.date}, time=${event.time}, title=${event.title}`);
    }
    return validDate && validTime;
  });

  if (validEvents.length === 0) {
    console.error('No valid events to generate iCal file');
    return '';
  }

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Harelbeekse Minivoetbal//Speelschema//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalText(calendarName || 'Speelschema')}`,
    'X-WR-TIMEZONE:Europe/Brussels',
  ].join('\r\n');
  
  const timezone = generateVTimezone();
  const eventStrings = validEvents.map(event => generateICalEvent(event));
  const footer = 'END:VCALENDAR';
  
  return [header, timezone, ...eventStrings, footer].join('\r\n');
};

/**
 * Downloads an iCal file to the user's device
 * Returns true if successful, false if no valid events
 */
export const downloadICalFile = (
  events: ICalEvent[], 
  filename: string = 'speelschema', 
  calendarName?: string
): boolean => {
  const content = generateICalFile(events, calendarName);
  
  if (!content) {
    return false;
  }
  
  // Use UTF-8 BOM for better compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  return true;
};

// ============================================================================
// CSV Generation for Excel
// ============================================================================

/**
 * Formats a date string (YYYY-MM-DD) to DD/MM/YYYY for Excel
 */
const formatDateForCSV = (dateStr: string): string => {
  const dateOnly = dateStr.split('T')[0];
  const [year, month, day] = dateOnly.split('-');
  return `${day}/${month}/${year}`;
};

/**
 * Escapes a field for CSV (handles quotes and commas)
 */
const escapeCSVField = (field: string): string => {
  if (!field) return '';
  // If the field contains comma, newline, or quote, wrap in quotes and escape existing quotes
  if (field.includes(',') || field.includes('\n') || field.includes('"')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
};

/**
 * Generates CSV content from events
 * Columns: Onderwerp, Begin datum, Begin tijd, Locatie, Beschrijving
 */
export const generateCSVFile = (events: ICalEvent[]): string => {
  // Filter valid events only
  const validEvents = events.filter(event => {
    return isValidDate(event.date) && isValidTime(event.time);
  });

  if (validEvents.length === 0) {
    console.error('No valid events to generate CSV file');
    return '';
  }

  const header = 'Onderwerp,Begin datum,Begin tijd,Locatie,Beschrijving';
  
  const rows = validEvents.map(event => {
    const formattedDate = formatDateForCSV(event.date);
    
    return [
      escapeCSVField(event.title),
      formattedDate,
      event.time,
      escapeCSVField(event.location || ''),
      escapeCSVField(event.description || ''),
    ].join(',');
  });
  
  return [header, ...rows].join('\r\n');
};

/**
 * Downloads a CSV file to the user's device
 * Returns true if successful, false if no valid events
 */
export const downloadCSVFile = (
  events: ICalEvent[], 
  filename: string = 'speelschema'
): boolean => {
  const content = generateCSVFile(events);
  
  if (!content) {
    return false;
  }
  
  // Use UTF-8 BOM for Excel compatibility with special characters
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  return true;
};
