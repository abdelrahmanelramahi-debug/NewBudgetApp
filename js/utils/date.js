/**
 * Shared date constants and helpers for pay cycle and food calendar.
 */

var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Last day of month (1–31) for given year/month. */
function lastDayOfMonth(y, m) {
    return new Date(y, m + 1, 0).getDate();
}

if (typeof window !== 'undefined') {
    window.MONTH_NAMES = MONTH_NAMES;
    window.DAY_NAMES = DAY_NAMES;
    window.lastDayOfMonth = lastDayOfMonth;
}
