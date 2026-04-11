/**
 * Shared date constants and helpers for pay cycle and food calendar.
 */

var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Last day of month (1–31) for given year/month. */
function lastDayOfMonth(y, m) {
    return new Date(y, m + 1, 0).getDate();
}

function normalizeExpectedPaymentDay(day) {
    var num = parseInt(day, 10);
    if (!num || num < 1 || num > 31) return null;
    return num;
}

function getOrdinalDayLabel(day) {
    var num = normalizeExpectedPaymentDay(day);
    if (!num) return '';
    var mod10 = num % 10;
    var mod100 = num % 100;
    var suffix = 'th';
    if (mod10 === 1 && mod100 !== 11) suffix = 'st';
    else if (mod10 === 2 && mod100 !== 12) suffix = 'nd';
    else if (mod10 === 3 && mod100 !== 13) suffix = 'rd';
    return num + suffix;
}

function getExpectedPaymentDateForMonth(day, year, month) {
    var normalizedDay = normalizeExpectedPaymentDay(day);
    if (!normalizedDay) return null;
    var safeDay = Math.min(normalizedDay, lastDayOfMonth(year, month));
    return new Date(year, month, safeDay);
}

function getNextExpectedPaymentDate(day, fromDate) {
    var normalizedDay = normalizeExpectedPaymentDay(day);
    if (!normalizedDay) return null;
    var now = fromDate instanceof Date ? new Date(fromDate.getTime()) : new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var currentMonthDate = getExpectedPaymentDateForMonth(normalizedDay, year, month);
    if (!currentMonthDate) return null;
    if (currentMonthDate.getTime() >= new Date(year, month, now.getDate()).getTime()) {
        return currentMonthDate;
    }
    var nextMonth = month + 1;
    var nextYear = year;
    if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
    }
    return getExpectedPaymentDateForMonth(normalizedDay, nextYear, nextMonth);
}

function formatExpectedPaymentDate(day, fromDate) {
    var nextDate = getNextExpectedPaymentDate(day, fromDate);
    if (!nextDate) return '';
    return MONTH_NAMES[nextDate.getMonth()] + ' ' + nextDate.getDate();
}

function getExpectedPaymentStatus(day, fromDate) {
    var normalizedDay = normalizeExpectedPaymentDay(day);
    if (!normalizedDay) return null;
    var now = fromDate instanceof Date ? new Date(fromDate.getTime()) : new Date();
    var thisMonthDate = getExpectedPaymentDateForMonth(normalizedDay, now.getFullYear(), now.getMonth());
    var isDueToday = !!thisMonthDate &&
        thisMonthDate.getFullYear() === now.getFullYear() &&
        thisMonthDate.getMonth() === now.getMonth() &&
        thisMonthDate.getDate() === now.getDate();
    var nextDate = getNextExpectedPaymentDate(normalizedDay, now);
    return {
        day: normalizedDay,
        ordinalLabel: getOrdinalDayLabel(normalizedDay),
        nextDate: nextDate,
        nextDateLabel: formatExpectedPaymentDate(normalizedDay, now),
        isDueToday: isDueToday
    };
}

if (typeof window !== 'undefined') {
    window.MONTH_NAMES = MONTH_NAMES;
    window.DAY_NAMES = DAY_NAMES;
    window.lastDayOfMonth = lastDayOfMonth;
    window.normalizeExpectedPaymentDay = normalizeExpectedPaymentDay;
    window.getOrdinalDayLabel = getOrdinalDayLabel;
    window.getExpectedPaymentDateForMonth = getExpectedPaymentDateForMonth;
    window.getNextExpectedPaymentDate = getNextExpectedPaymentDate;
    window.formatExpectedPaymentDate = formatExpectedPaymentDate;
    window.getExpectedPaymentStatus = getExpectedPaymentStatus;
}
