const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRepeat,
  getNextRepeatDate,
  getReminderDateTime,
  getNextRepeatReminder,
  getCalendarDayDifference,
  shiftLocalDate
} = require('./recurrence.js');

test('normalizes unsupported repeat values', () => {
  assert.equal(normalizeRepeat('daily'), 'daily');
  assert.equal(normalizeRepeat('sometimes'), 'none');
  assert.equal(normalizeRepeat(undefined), 'none');
});

test('daily and weekly repeats skip missed occurrences', () => {
  assert.equal(getNextRepeatDate('2026-08-20', 'daily', '2026-08-20', new Date(2026, 7, 22)), '2026-08-23');
  assert.equal(getNextRepeatDate('2026-08-01', 'weekly', '2026-08-01', new Date(2026, 7, 22)), '2026-08-29');
});

test('monthly repeats preserve the original day after a short month', () => {
  assert.equal(getNextRepeatDate('2026-01-31', 'monthly', '2026-01-31', new Date(2026, 0, 31)), '2026-02-28');
  assert.equal(getNextRepeatDate('2026-02-28', 'monthly', '2026-01-31', new Date(2026, 1, 28)), '2026-03-31');
});

test('yearly repeats clamp leap day and restore it in leap years', () => {
  assert.equal(getNextRepeatDate('2024-02-29', 'yearly', '2024-02-29', new Date(2024, 1, 29)), '2025-02-28');
  assert.equal(getNextRepeatDate('2027-02-28', 'yearly', '2024-02-29', new Date(2027, 1, 28)), '2028-02-29');
});

test('date shifting uses calendar days across month boundaries', () => {
  assert.equal(getCalendarDayDifference('2026-01-31', '2026-02-28'), 28);
  assert.equal(shiftLocalDate('2026-02-01', 28), '2026-03-01');
});

test('calculates reminder timestamps with the configured offset', () => {
  assert.equal(
    getReminderDateTime('2026-08-24', '15min', '09:00'),
    new Date(2026, 7, 24, 8, 45).getTime()
  );
  assert.equal(getReminderDateTime('2026-08-24', 'none', '09:00'), null);
  assert.equal(getReminderDateTime('invalid', 'at-time', '09:00'), null);
});

test('describes the next reminder in a recurring series', () => {
  assert.deepEqual(
    getNextRepeatReminder(
      '2026-08-23',
      'daily',
      '2026-08-23',
      'at-time',
      '09:00',
      new Date(2026, 7, 23, 9, 0)
    ),
    {
      repeat: 'daily',
      repeatLabel: '每天',
      date: '2026-08-24',
      reminderAt: new Date(2026, 7, 24, 9, 0).getTime()
    }
  );
});
