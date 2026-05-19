// ===== data-processor.js — Parse, Normalize & Calculate =====

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export class DataProcessor {
  constructor(appState) {
    this.state = appState;
  }

  /**
   * Parse raw text items extracted from PDF into structured records.
   * Each record: { date: 'YYYY-MM-DD', time: 'HH:MM:SS', type: 'In'|'Out', raw: string }
   */
  parseRawText(textItems, fullText) {
    const records = [];
    // Try to parse line by line from the full text
    const lines = fullText.split('\n');
    
    // Pattern: YYYY-MM-DD HH:MM:SS followed by In or Out
    const dateTimePattern = /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/;
    const typePattern = /\b(In|Out)\b/i;

    // Sometimes the text items come as separate pieces, so we need to
    // reconstruct lines by grouping items with similar Y coordinates
    const lineGroups = this.groupTextByLines(textItems);

    for (const lineItems of lineGroups) {
      const lineText = lineItems.map(i => i.str).join(' ');
      const dateMatch = lineText.match(dateTimePattern);
      const typeMatch = lineText.match(typePattern);

      if (dateMatch) {
        records.push({
          date: dateMatch[1],
          time: dateMatch[2],
          type: typeMatch ? (typeMatch[1].toLowerCase() === 'in' ? 'In' : 'Out') : 'Unknown',
          raw: lineText.trim()
        });
      }
    }

    // If line grouping didn't work well, try parsing the full text
    if (records.length === 0) {
      const regex = /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s*(In|Out)?/gi;
      let match;
      while ((match = regex.exec(fullText)) !== null) {
        records.push({
          date: match[1],
          time: match[2],
          type: match[3] ? (match[3].toLowerCase() === 'in' ? 'In' : 'Out') : 'Unknown',
          raw: match[0]
        });
      }
    }

    // Sort chronologically
    records.sort((a, b) => {
      const da = new Date(`${a.date}T${a.time}`);
      const db = new Date(`${b.date}T${b.time}`);
      return da - db;
    });

    return records;
  }

  groupTextByLines(items) {
    if (items.length === 0) return [];
    const lines = [];
    let currentLine = [items[0]];

    for (let i = 1; i < items.length; i++) {
      if (Math.abs(items[i].y - currentLine[0].y) < 5) {
        currentLine.push(items[i]);
      } else {
        lines.push(currentLine.sort((a, b) => a.x - b.x));
        currentLine = [items[i]];
      }
    }
    lines.push(currentLine.sort((a, b) => a.x - b.x));
    return lines;
  }

  /**
   * Process raw records into table-ready data with shift matching and delay calculation.
   * @param {Array} records - Raw records [{date, time, type}]
   * @param {Object} employee - Employee config with schedules
   * @param {number} tolerance - Minutes of tolerance
   * @returns {Array} Processed rows for the table
   */
  processRecords(records, employee, tolerance) {
    if (!records || records.length === 0 || !employee) return [];

    // Group records by date
    const byDate = {};
    records.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    });

    const processedRows = [];

    // Sort dates
    const dates = Object.keys(byDate).sort();

    for (const date of dates) {
      const dayRecords = byDate[date].sort((a, b) => a.time.localeCompare(b.time));
      const dayOfWeek = new Date(date + 'T12:00:00').getDay(); // 0=Sun, 6=Sat
      const dayName = DAYS_ES[dayOfWeek];

      // Get applicable shifts for this day
      let shifts = [];
      if (dayOfWeek === 0) {
        // Sunday - typically no work
        shifts = [];
      } else if (dayOfWeek === 6) {
        // Saturday
        shifts = employee.saturday || [];
      } else {
        // Weekday (Mon-Fri)
        shifts = employee.weekday || [];
      }

      if (shifts.length === 0) {
        // Non-working day but has records - flag as warning
        if (dayRecords.length > 0) {
          processedRows.push({
            date, day: dayName, shift: '—',
            scheduled: 'No laboral',
            entry: dayRecords[0]?.time?.substring(0, 5) || '—',
            exit: dayRecords[dayRecords.length - 1]?.time?.substring(0, 5) || '—',
            delay: null, notes: 'Día no laboral con registros', status: 'warning'
          });
        }
        continue;
      }

      // Sort shifts by entry time to partition the day correctly
      const dayShifts = [...shifts].sort((a, b) => this.timeToMinutes(a.entry) - this.timeToMinutes(b.entry));

      // Match records to shifts using a midpoint partition to support any late check-out or early check-in
      for (let index = 0; index < dayShifts.length; index++) {
        const shift = dayShifts[index];
        const shiftEntry = this.timeToMinutes(shift.entry);
        const shiftExit = this.timeToMinutes(shift.exit);

        // Compute window boundaries dynamically based on adjacent shifts
        let windowStart = 0;
        if (index > 0) {
          const prevShift = dayShifts[index - 1];
          const prevExit = this.timeToMinutes(prevShift.exit);
          windowStart = Math.floor((prevExit + shiftEntry) / 2);
        }

        let windowEnd = 1440; // 24:00 in minutes
        if (index < dayShifts.length - 1) {
          const nextShift = dayShifts[index + 1];
          const nextEntry = this.timeToMinutes(nextShift.entry);
          windowEnd = Math.floor((shiftExit + nextEntry) / 2);
        }

        // Find records that belong to this shift's window
        const shiftRecords = dayRecords.filter(r => {
          const recMin = this.timeToMinutes(r.time.substring(0, 5));
          return recMin >= windowStart && recMin < windowEnd;
        });

        // Determine entry and exit intelligently
        let entryRecord = null;
        let exitRecord = null;

        if (shiftRecords.length === 0) {
          // No records for this shift
          processedRows.push({
            date, day: dayName, shift: shift.shift,
            scheduled: `${shift.entry} - ${shift.exit}`,
            entry: '—', exit: '—',
            delay: null, notes: 'Sin registro', status: 'warning'
          });
          continue;
        }

        if (shiftRecords.length === 1) {
          // Single record - determine if entry or exit based on type if available, otherwise proximity
          const r = shiftRecords[0];
          const recMin = this.timeToMinutes(r.time.substring(0, 5));

          if (r.type === 'In') {
            entryRecord = r;
          } else if (r.type === 'Out') {
            exitRecord = r;
          } else {
            // Proximity fallback
            if (Math.abs(recMin - shiftEntry) < Math.abs(recMin - shiftExit)) {
              entryRecord = r;
            } else {
              exitRecord = r;
            }
          }
        } else {
          // Multiple records - sort chronologically
          const sortedRecs = [...shiftRecords].sort((a, b) => a.time.localeCompare(b.time));

          // Filter by explicit biometric tags if available
          const ins = sortedRecs.filter(r => r.type === 'In');
          const outs = sortedRecs.filter(r => r.type === 'Out');

          if (ins.length > 0 && outs.length > 0) {
            // Earliest In is entry, latest Out is exit
            entryRecord = ins[0];
            exitRecord = outs[outs.length - 1];
          } else {
            // Fallback to absolute earliest as entry and absolute latest as exit
            entryRecord = sortedRecs[0];
            exitRecord = sortedRecs[sortedRecs.length - 1];
          }

          // Check for duplicate or multiple records
          if (sortedRecs.length > 2) {
            const entryTime = entryRecord ? entryRecord.time.substring(0, 5) : '—';
            const exitTime = exitRecord ? exitRecord.time.substring(0, 5) : '—';

            processedRows.push({
              date, day: dayName, shift: shift.shift,
              scheduled: `${shift.entry} - ${shift.exit}`,
              entry: entryTime, exit: exitTime,
              delay: entryTime !== '—' ? this.calculateDelay(entryTime, shift.entry, tolerance) : null,
              notes: `${sortedRecs.length} marcaciones en este turno`,
              status: 'warning',
              _duplicateCount: sortedRecs.length
            });
            continue;
          }
        }

        const entryTime = entryRecord?.time?.substring(0, 5) || null;
        const exitTime = exitRecord?.time?.substring(0, 5) || null;
        const delay = entryTime ? this.calculateDelay(entryTime, shift.entry, tolerance) : null;

        let status = 'no-data';
        if (entryTime && delay !== null) {
          status = delay > 0 ? 'late' : 'on-time';
        }
        if (!entryTime || !exitTime) {
          status = 'warning';
        }

        processedRows.push({
          date, day: dayName, shift: shift.shift,
          scheduled: `${shift.entry} - ${shift.exit}`,
          entry: entryTime || '—',
          exit: exitTime || '—',
          delay: delay,
          notes: !entryTime ? 'Sin entrada' : (!exitTime ? 'Sin salida' : ''),
          status
        });
      }
    }

    return processedRows;
  }

  /**
   * Convert "HH:MM" to minutes since midnight
   */
  timeToMinutes(timeStr) {
    if (!timeStr || timeStr === '—') return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }

  /**
   * Calculate delay in minutes.
   * Returns positive if late, 0 if on time (within tolerance), negative not used.
   */
  calculateDelay(actualTime, scheduledTime, tolerance) {
    const actual = this.timeToMinutes(actualTime);
    const scheduled = this.timeToMinutes(scheduledTime);
    const diff = actual - scheduled;
    if (diff <= tolerance) return 0;
    return diff;
  }
}
