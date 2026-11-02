/**
 * Calendly -> Google Sheets (free script)
 *
 * Pulls your Calendly bookings (one row per invitee: time, event, name, email,
 * status, cancellations, reschedules, no-shows, UTM tags and every booking
 * question as its own column) into a sheet called "Calendly bookings".
 * Works on Calendly's free plan (uses a Personal Access Token, no webhooks).
 *
 * Setup: Extensions > Apps Script, paste this file, save, reload the sheet,
 * then use the "Calendly Sync" menu. Your token is stored only in your own
 * Apps Script user properties.
 *
 * Not affiliated with, endorsed by, or sponsored by Calendly.
 * Calendly is a trademark of its owner.
 *
 * @OnlyCurrentDoc
 */

var IS_ADDON = false; // true in the Marketplace build

var CAL = {
  API: 'https://api.calendly.com',
  SHEET: 'Calendly bookings',
  BASE_HEADERS: ['Event start', 'Event end', 'Event', 'Event status', 'Invitee name', 'Invitee email',
                 'Invitee status', 'Invitee time zone', 'Booked at', 'Canceled by', 'Cancel reason',
                 'Rescheduled', 'No-show', 'Location', 'UTM source', 'UTM medium', 'UTM campaign', 'Invitee ID'],
  TOKEN_KEY: 'CALENDLY_PAT',
  USER_KEY: 'CALENDLY_USER_URI',
  PAST_DAYS: 30,
  FUTURE_DAYS: 60,
  BATCH: 10
};

/* ---------------- Menu ---------------- */

function onOpen(e) {
  var ui = SpreadsheetApp.getUi();
  var menu = IS_ADDON ? ui.createAddonMenu() : ui.createMenu('Calendly Sync');
  menu.addItem('1. Connect Calendly (personal access token)', 'calSetToken')
      .addItem('2. Sync now', 'calSyncNow')
      .addItem('Sync a custom date range…', 'calSyncRange')
      .addSeparator()
      .addItem('Turn on hourly sync', 'calEnableHourly')
      .addItem('Turn off automatic sync', 'calDisableAuto')
      .addItem('Disconnect (delete saved token)', 'calDisconnect')
      .addSeparator()
      .addItem('Pro version: join the waitlist', 'calWaitlist')
      .addToUi();
}

function onInstall(e) { onOpen(e); }

/* ---------------- Menu actions ---------------- */

function calSetToken() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Connect Calendly',
    'Paste a Calendly personal access token.\nCreate one at calendly.com > Integrations & apps > API and webhooks.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var token = String(res.getResponseText() || '').trim();
  if (!token) { ui.alert('No token entered.'); return; }
  var me = calRequest_(CAL.API + '/users/me', token);
  var props = PropertiesService.getUserProperties();
  props.setProperty(CAL.TOKEN_KEY, token);
  props.setProperty(CAL.USER_KEY, me.resource.uri);
  ui.alert('Connected as ' + (me.resource.name || 'your Calendly account') + '.\nNow choose Calendly Sync > Sync now.');
}

function calSyncNow() {
  var now = new Date();
  var r = calSync_(new Date(now.getTime() - CAL.PAST_DAYS * 86400000), new Date(now.getTime() + CAL.FUTURE_DAYS * 86400000));
  SpreadsheetApp.getActive().toast(r.message, 'Calendly Sync', 8);
}

function calSyncRange() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Sync a date range', 'Enter start and end dates as YYYY-MM-DD YYYY-MM-DD.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var p = String(res.getResponseText()).trim().split(/\s+/);
  var a = calParseDate_(p[0]), b = calParseDate_(p[1]);
  if (!a || !b || b < a) { ui.alert('Please use the format 2026-10-01 2026-10-31.'); return; }
  b = new Date(b.getTime() + 86400000 - 1); // include the whole end day
  ui.alert(calSync_(a, b).message);
}

function calEnableHourly() {
  calDisableAuto(true);
  ScriptApp.newTrigger('calAutoSync').timeBased().everyHours(1).create();
  SpreadsheetApp.getActive().toast('Hourly sync is on.', 'Calendly Sync', 5);
}

function calDisableAuto(silent) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'calAutoSync') ScriptApp.deleteTrigger(t);
  });
  if (silent !== true) SpreadsheetApp.getActive().toast('Automatic sync is off.', 'Calendly Sync', 5);
}

function calDisconnect() {
  var p = PropertiesService.getUserProperties();
  p.deleteProperty(CAL.TOKEN_KEY); p.deleteProperty(CAL.USER_KEY);
  calDisableAuto(true);
  SpreadsheetApp.getActive().toast('Token deleted and automatic sync turned off.', 'Calendly Sync', 6);
}

function calAutoSync() {
  var now = new Date();
  calSync_(new Date(now.getTime() - 7 * 86400000), new Date(now.getTime() + CAL.FUTURE_DAYS * 86400000));
}

function calWaitlist() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' +
    '<p>A Pro version is planned: automatic syncs without setup, more history and support. ' +
    '$9/month, with a free tier for small accounts.</p>' +
    '<p><a href="https://tally.so/r/7Xq1W9" target="_blank" rel="noopener">Join the waitlist</a> (email only, no spam).</p></div>'
  ).setWidth(380).setHeight(170);
  SpreadsheetApp.getUi().showModalDialog(html, 'Calendly Sync Pro');
}

/* ---------------- Core sync ---------------- */

function calSync_(start, end) {
  var props = PropertiesService.getUserProperties();
  var token = props.getProperty(CAL.TOKEN_KEY);
  var user = props.getProperty(CAL.USER_KEY);
  if (!token || !user) return { ok: false, message: 'Connect Calendly first (Calendly Sync > Connect).' };

  // 1. Events in range (both active and canceled)
  var events = [];
  var url = CAL.API + '/scheduled_events?user=' + encodeURIComponent(user) +
    '&min_start_time=' + encodeURIComponent(start.toISOString()) +
    '&max_start_time=' + encodeURIComponent(end.toISOString()) +
    '&sort=start_time:asc&count=100';
  var guard = 0;
  while (url && guard++ < 100) {
    var page = calRequest_(url, token);
    events = events.concat(page.collection || []);
    url = page.pagination && page.pagination.next_page;
  }

  // 2. Invitees for each event, fetched in small parallel batches
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var rows = [];
  for (var i = 0; i < events.length; i += CAL.BATCH) {
    var batch = events.slice(i, i + CAL.BATCH);
    var lists = calFetchAll_(batch.map(function (ev) { return ev.uri + '/invitees?count=100'; }), token);
    batch.forEach(function (ev, k) {
      (lists[k].collection || []).forEach(function (inv) { rows.push(calRow_(ev, inv, tz)); });
    });
  }

  var w = calUpsert_(rows);
  return { ok: true, message: rows.length + ' bookings from ' + events.length + ' events synced (' +
           w.added + ' new, ' + w.updated + ' updated).' };
}

function calRow_(ev, inv, tz) {
  var fmt = function (iso) { return iso ? Utilities.formatDate(new Date(iso), tz, 'yyyy-MM-dd HH:mm') : ''; };
  var loc = ev.location || {};
  var tr = inv.tracking || {};
  var c = inv.cancellation || ev.cancellation || null;
  var qa = {};
  (inv.questions_and_answers || []).forEach(function (q) { qa[q.question] = q.answer; });
  return {
    base: [
      fmt(ev.start_time), fmt(ev.end_time), ev.name || '', ev.status || '',
      inv.name || '', inv.email || '', inv.status || '', inv.timezone || '', fmt(inv.created_at),
      c ? (c.canceler_type || c.canceled_by || 'yes') : '', c ? (c.reason || '') : '',
      inv.rescheduled ? 'Yes' : 'No', inv.no_show ? 'Yes' : 'No',
      loc.join_url || loc.location || loc.type || '',
      tr.utm_source || '', tr.utm_medium || '', tr.utm_campaign || '',
      inv.uri || ''
    ],
    qa: qa
  };
}

/* ---------------- Sheet writing ---------------- */

function calUpsert_(rows) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CAL.SHEET) || ss.insertSheet(CAL.SHEET);
  var headers = sh.getLastRow() > 0
    ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0]
    : CAL.BASE_HEADERS.slice();
  // Add one column per booking question we haven't seen before
  rows.forEach(function (r) {
    Object.keys(r.qa).forEach(function (q) { if (headers.indexOf(q) === -1) headers.push(q); });
  });
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);

  var idCol = CAL.BASE_HEADERS.length; // "Invitee ID"
  var last = sh.getLastRow();
  var index = {};
  if (last > 1) {
    sh.getRange(2, idCol, last - 1, 1).getDisplayValues().forEach(function (r, i) { index[r[0]] = i + 2; });
  }
  var added = [], updated = 0;
  rows.forEach(function (r) {
    var line = r.base.slice();
    for (var h = CAL.BASE_HEADERS.length; h < headers.length; h++) line.push(r.qa[headers[h]] || '');
    var at = index[r.base[idCol - 1]];
    if (at) { sh.getRange(at, 1, 1, line.length).setValues([line]); updated++; }
    else added.push(line);
  });
  if (added.length) sh.getRange(sh.getLastRow() + 1, 1, added.length, headers.length).setValues(added);
  if (sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).sort({ column: 1, ascending: true });
  return { added: added.length, updated: updated };
}

/* ---------------- HTTP ---------------- */

function calOpts_(token) {
  return { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } };
}

function calCheck_(r) {
  var code = r.getResponseCode();
  if (code === 401 || code === 403) throw new Error('Calendly rejected the token (HTTP ' + code + '). Reconnect with a fresh token.');
  if (code >= 400 && code !== 429) throw new Error('Calendly API error ' + code + ': ' + r.getContentText().slice(0, 200));
  return code;
}

function calRemaining_(r) {
  var h = r.getAllHeaders() || {};
  var v = Number(h['X-RateLimit-Remaining'] || h['x-ratelimit-remaining']);
  return isNaN(v) ? 9999 : v;
}

function calWaitIfLow_(r) {
  var h = r.getAllHeaders() || {};
  var left = calRemaining_(r);
  var reset = Number(h['X-RateLimit-Reset'] || h['x-ratelimit-reset']) || 60;
  if (!isNaN(left) && left < CAL.BATCH + 2) Utilities.sleep((reset + 1) * 1000);
}

function calRequest_(url, token) {
  for (var attempt = 0; attempt < 3; attempt++) {
    var r = UrlFetchApp.fetch(url, calOpts_(token));
    if (calCheck_(r) === 429) { Utilities.sleep(61000); continue; }
    calWaitIfLow_(r);
    return JSON.parse(r.getContentText());
  }
  throw new Error('Calendly is rate limiting requests. Try again in a minute.');
}

function calFetchAll_(urls, token) {
  var reqs = urls.map(function (u) { var o = calOpts_(token); o.url = u; return o; });
  var out = new Array(urls.length);
  for (var attempt = 0; attempt < 3; attempt++) {
    var pending = [];
    reqs.forEach(function (req, i) { if (!out[i]) pending.push(i); });
    if (!pending.length) break;
    var res = UrlFetchApp.fetchAll(pending.map(function (i) { return reqs[i]; }));
    var limited = false, lowest = null;
    res.forEach(function (r, k) {
      if (calCheck_(r) === 429) { limited = true; return; }
      out[pending[k]] = JSON.parse(r.getContentText());
      if (!lowest || calRemaining_(r) < calRemaining_(lowest)) lowest = r;
    });
    if (limited) Utilities.sleep(61000);
    else if (lowest) calWaitIfLow_(lowest);
  }
  for (var i = 0; i < out.length; i++) if (!out[i]) throw new Error('Calendly is rate limiting requests. Try again in a minute.');
  return out;
}

/* ---------------- Helpers ---------------- */

function calParseDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
