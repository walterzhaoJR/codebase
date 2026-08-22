(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ThingsRecurrence = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const REPEAT_TYPES = new Set(['daily', 'weekly', 'monthly', 'yearly']);

  function normalizeRepeat(value) {
    return REPEAT_TYPES.has(value) ? value : 'none';
  }

  function getRepeatLabel(value) {
    const labels = {
      daily: '每天',
      weekly: '每周',
      monthly: '每月',
      yearly: '每年'
    };
    return labels[normalizeRepeat(value)] || '';
  }

  function parseLocalDate(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function toLocalDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function createClampedDate(year, monthIndex, day) {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return new Date(year, monthIndex, Math.min(day, lastDay));
  }

  function getNextRepeatDate(currentDateStr, repeatValue, anchorDateStr, referenceValue) {
    const repeat = normalizeRepeat(repeatValue);
    const current = parseLocalDate(currentDateStr);
    if (repeat === 'none' || !current) return null;

    const anchor = parseLocalDate(anchorDateStr) || current;
    const reference = referenceValue instanceof Date ? new Date(referenceValue) : new Date(referenceValue || Date.now());
    if (Number.isNaN(reference.getTime())) return null;
    reference.setHours(0, 0, 0, 0);

    let candidate;
    if (repeat === 'daily' || repeat === 'weekly') {
      candidate = new Date(current);
      const intervalDays = repeat === 'daily' ? 1 : 7;
      do {
        candidate.setDate(candidate.getDate() + intervalDays);
      } while (candidate <= reference);
    } else if (repeat === 'monthly') {
      let year = current.getFullYear();
      let month = current.getMonth() + 1;
      do {
        candidate = createClampedDate(year, month, anchor.getDate());
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
      } while (candidate <= reference);
    } else {
      let year = current.getFullYear() + 1;
      do {
        candidate = createClampedDate(year, anchor.getMonth(), anchor.getDate());
        year += 1;
      } while (candidate <= reference);
    }

    return toLocalDateString(candidate);
  }

  function getCalendarDayDifference(fromDateStr, toDateStr) {
    const from = parseLocalDate(fromDateStr);
    const to = parseLocalDate(toDateStr);
    if (!from || !to) return 0;
    const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
  }

  function shiftLocalDate(dateStr, dayDelta) {
    const date = parseLocalDate(dateStr);
    if (!date || !Number.isFinite(dayDelta)) return dateStr || null;
    date.setDate(date.getDate() + dayDelta);
    return toLocalDateString(date);
  }

  return {
    normalizeRepeat,
    getRepeatLabel,
    getNextRepeatDate,
    getCalendarDayDifference,
    shiftLocalDate
  };
}));
