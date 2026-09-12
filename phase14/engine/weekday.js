// engine/weekday.js
//
// One reader for the day column.
//
// Eight modules each carried their own copy of this function, and every copy
// was the same three lines: lowercase the cell, take the first three
// characters, accept it if those three spell a weekday. That works for "Tue"
// and for nothing else.
//
// The fight camp died on it. The timeline brief asks the model to label the
// event week by distance from the event -- "Day -4 (Tue)", "Day -1 (Fri)" --
// because an athlete counting down to a fight should see the countdown. Every
// one of those cells read as "day", so the week table appeared to have no
// training days at all, the calendar correctly showed gym on Tuesday and
// Friday, and the rule that exists to catch the two views disagreeing fired on
// a program in which they agreed perfectly. The repair then found no offending
// day to move and changed nothing, so the flag outlived its repair and the
// build died with the customer's credit spent.
//
// The engine asked for a label and then could not read it. That is one bug, so
// there is now one function, and the annotation is allowed to be an annotation.

export const WEEKDAY_KEYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const WEEKDAY_LABEL = Object.freeze({
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
});

const ALIASES = new Map([
  ['mon', 'mon'], ['monday', 'mon'],
  ['tue', 'tue'], ['tues', 'tue'], ['tuesday', 'tue'],
  ['wed', 'wed'], ['weds', 'wed'], ['wednesday', 'wed'],
  ['thu', 'thu'], ['thur', 'thu'], ['thurs', 'thu'], ['thursday', 'thu'],
  ['fri', 'fri'], ['friday', 'fri'],
  ['sat', 'sat'], ['saturday', 'sat'],
  ['sun', 'sun'], ['sunday', 'sun'],
]);

// The three-letter key for whatever weekday a day cell names, or null if it
// names none. "Tue", "Tuesday", "Day -4 (Tue)", "Fri (sport only)" and
// "Sun - recovery" all answer; "Day -4" and "Week 4" answer null, because they
// genuinely do not say which day it is.
export function weekdayKey(value) {
  const text = String(value == null ? '' : value).toLowerCase();
  const direct = ALIASES.get(text.trim().replace(/\.$/, ''));
  if (direct) return direct;
  for (const token of text.split(/[^a-z]+/)) {
    const hit = ALIASES.get(token);
    if (hit) return hit;
  }
  return null;
}

// Index in Monday-first order, or -1.
export function weekdayIndex(value) {
  const key = weekdayKey(value);
  return key ? WEEKDAY_KEYS.indexOf(key) : -1;
}
