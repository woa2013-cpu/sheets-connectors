/**
 * Toggl Track -> Google Sheets (free script)
 *
 * Pulls your Toggl Track time entries (descriptions, projects, clients, tags)
 * into a sheet called "Toggl entries" and keeps it up to date.
 *
 * Setup: Extensions > Apps Script, paste this file, save, reload the sheet,
 * then use the "Toggl Sync" menu. Your API token is stored only in your own
 * Apps Script user properties.
 *
 * Not affiliated with, endorsed by, or sponsored by Toggl.
 * Toggl is a trademark of its owner.
 *
 * @OnlyCurrentDoc
 */

var IS_ADDON = true; // Marketplace build

var TOGGL = {
  API: 'https://api.track.toggl.com/api/v9',
  REPORTS: 'https://api.track.toggl.com/reports/api/v3',
  SHEET: 'Toggl entries',
  HEADERS: ['Date', 'Start', 'Stop', 'Hours', 'Duration', 'Description',
            'Project', 'Client', 'Tags', 'Billable', 'User', 'Entry ID'],
  TOKEN_KEY: 'TOGGL_API_TOKEN',
  WS_KEY: 'TOGGL_WORKSPACE_ID',
  DAYS_KEY: 'TOGGL_SYNC_DAYS',
  DEFAULT_DAYS: 30,
  MAX_DAYS: 365
};

/* ---------------- Menu ---------------- */

function onOpen(e) {
  var ui = SpreadsheetApp.getUi();
  var menu = IS_ADDON ? ui.createAddonMenu() : ui.createMenu('Toggl Sync');
  menu.addItem('1. Connect Toggl (API token)', 'togglSetToken')
      .addItem('2. Sync now', 'togglSyncNow')
      .addItem('Sync a custom date range…', 'togglSyncRange')
      .addSeparator()
      .addItem('Turn on daily sync', 'togglEnableDaily')
      .addItem('Turn off daily sync', 'togglDisableDaily')
      .addItem('Disconnect (delete saved token)', 'togglDisconnect')
      .addSeparator()
      .addItem('Pro version: join the waitlist', 'togglWaitlist')
      .addToUi();
}

function onInstall(e) { onOpen(e); }

/* ---------------- Menu actions ---------------- */

function togglSetToken() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Connect Toggl Track',
    'Paste your Toggl Track API token.\nFind it at track.toggl.com > Profile settings > API Token.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var token = String(res.getResponseText() || '').trim();
  if (!token) { ui.alert('No token entered.'); return; }
  var me = togglRequest_('get', TOGGL.API + '/me', null, token);
  var props = PropertiesService.getUserProperties();
  props.setProperty(TOGGL.TOKEN_KEY, token);
  if (me.body && me.body.default_workspace_id) {
    PropertiesService.getDocumentProperties().setProperty(TOGGL.WS_KEY, String(me.body.default_workspace_id));
  }
  ui.alert('Connected as ' + (me.body.fullname || me.body.email || 'your Toggl account') +
    '.\nNow choose Toggl Sync > Sync now.');
}

function togglSyncNow() {
  var days = Number(PropertiesService.getDocumentProperties().getProperty(TOGGL.DAYS_KEY)) || TOGGL.DEFAULT_DAYS;
  var end = new Date();
  var start = new Date(end.getTime() - (days - 1) * 86400000);
  var result = togglSync_(start, end);
  SpreadsheetApp.getActive().toast(result.message, 'Toggl Sync', 8);
}

function togglSyncRange() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Sync a date range',
    'Enter start and end dates as YYYY-MM-DD YYYY-MM-DD (max 365 days).', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var parts = String(res.getResponseText()).trim().split(/\s+/);
  var start = togglParseDate_(parts[0]);
  var end = togglParseDate_(parts[1]);
  if (!start || !end || end < start) { ui.alert('Please use the format 2026-10-01 2026-10-31.'); return; }
  var result = togglSync_(start, end);
  ui.alert(result.message);
}

function togglEnableDaily() {
  togglDisableDaily(true);
  ScriptApp.newTrigger('togglDailySync').timeBased().everyDays(1).atHour(6).create();
  SpreadsheetApp.getActive().toast('Daily sync is on (around 6am, sheet time zone).', 'Toggl Sync', 6);
}

function togglDisableDaily(silent) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'togglDailySync') ScriptApp.deleteTrigger(t);
  });
  if (silent !== true) SpreadsheetApp.getActive().toast('Daily sync is off.', 'Toggl Sync', 5);
}

function togglDisconnect() {
  PropertiesService.getUserProperties().deleteProperty(TOGGL.TOKEN_KEY);
  togglDisableDaily(true);
  SpreadsheetApp.getActive().toast('Token deleted and daily sync turned off.', 'Toggl Sync', 6);
}

function togglDailySync() {
  var end = new Date();
  var start = new Date(end.getTime() - 6 * 86400000); // last 7 days, catches late edits
  togglSync_(start, end);
}

function togglWaitlist() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' +
    '<p>A Pro version is planned: automatic syncs without setup, more history and support. ' +
    '$9/month, with a free tier for small accounts.</p>' +
    '<p><a href="https://tally.so/r/jeZ5M9" target="_blank" rel="noopener">Join the waitlist</a> (email only, no spam).</p></div>'
  ).setWidth(380).setHeight(170);
  SpreadsheetApp.getUi().showModalDialog(html, 'Toggl Sync Pro');
}

/* ---------------- Core sync ---------------- */

function togglSync_(start, end) {
  var token = PropertiesService.getUserProperties().getProperty(TOGGL.TOKEN_KEY);
  if (!token) return { ok: false, message: 'Connect Toggl first (Toggl Sync > Connect).' };
  if ((end - start) / 86400000 > TOGGL.MAX_DAYS) return { ok: false, message: 'Range is longer than 365 days.' };

  var docProps = PropertiesService.getDocumentProperties();
  var wid = docProps.getProperty(TOGGL.WS_KEY);
  if (!wid) {
    var me = togglRequest_('get', TOGGL.API + '/me', null, token);
    wid = String(me.body.default_workspace_id);
    docProps.setProperty(TOGGL.WS_KEY, wid);
  }

  var lookups = togglLookups_(wid, token);
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var rows = [];
  var firstRow = null;
  var pages = 0;
  do {
    var body = {
      start_date: Utilities.formatDate(start, tz, 'yyyy-MM-dd'),
      end_date: Utilities.formatDate(end, tz, 'yyyy-MM-dd'),
      order_by: 'date',
      order_dir: 'ASC',
      enrich_response: true
    };
    if (firstRow) body.first_row_number = Number(firstRow);
    var res = togglRequest_('post', TOGGL.REPORTS + '/workspace/' + wid + '/search/time_entries', body, token);
    (res.body || []).forEach(function (group) {
      (group.time_entries || []).forEach(function (te) {
        rows.push(togglRow_(group, te, lookups, tz));
      });
    });
    firstRow = res.headers['X-Next-Row-Number'] || res.headers['x-next-row-number'] || null;
    pages++;
  } while (firstRow && pages < 200);

  var written = togglUpsert_(rows);
  return { ok: true, message: rows.length + ' entries synced (' + written.added + ' new, ' +
           written.updated + ' updated).' };
}

function togglRow_(group, te, lookups, tz) {
  var startD = new Date(te.start);
  var stopD = te.stop ? new Date(te.stop) : null;
  var seconds = Number(te.seconds || 0);
  var project = group.project_name || lookups.projects[group.project_id] || '';
  var clientId = lookups.projectClient[group.project_id];
  var client = group.client_name || lookups.clients[clientId] || '';
  var tags = (group.tag_ids || []).map(function (id) { return lookups.tags[id] || id; }).join(', ');
  return [
    Utilities.formatDate(startD, tz, 'yyyy-MM-dd'),
    Utilities.formatDate(startD, tz, 'HH:mm'),
    stopD ? Utilities.formatDate(stopD, tz, 'HH:mm') : '(running)',
    Math.round(seconds / 36) / 100,
    togglHms_(seconds),
    group.description || '',
    project,
    client,
    tags,
    group.billable ? 'Yes' : 'No',
    group.username || group.user_id || '',
    String(te.id)
  ];
}

function togglLookups_(wid, token) {
  // Names for projects, clients and tags. If a lookup fails, the sheet falls back to IDs.
  var out = { projects: {}, projectClient: {}, clients: {}, tags: {} };
  var base = TOGGL.API + '/workspaces/' + wid;
  togglTry_(function () {
    (togglRequest_('get', base + '/projects?per_page=200', null, token).body || []).forEach(function (x) {
      out.projects[x.id] = x.name; out.projectClient[x.id] = x.client_id || x.cid;
    });
  });
  togglTry_(function () {
    (togglRequest_('get', base + '/clients', null, token).body || []).forEach(function (x) { out.clients[x.id] = x.name; });
  });
  togglTry_(function () {
    (togglRequest_('get', base + '/tags', null, token).body || []).forEach(function (x) { out.tags[x.id] = x.name; });
  });
  return out;
}

function togglTry_(fn) {
  try { fn(); } catch (err) {
    if (/hourly limit|rejected the API token/.test(err.message)) throw err;
    console.warn('Lookup skipped: ' + err.message);
  }
}

/* ---------------- Sheet writing ---------------- */

function togglUpsert_(rows) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(TOGGL.SHEET) || ss.insertSheet(TOGGL.SHEET);
  var idCol = TOGGL.HEADERS.length;
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, idCol).setValues([TOGGL.HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var last = sh.getLastRow();
  var index = {};
  if (last > 1) {
    var ids = sh.getRange(2, idCol, last - 1, 1).getDisplayValues();
    ids.forEach(function (r, i) { index[r[0]] = i + 2; });
  }
  var added = [], updated = 0;
  rows.forEach(function (r) {
    var at = index[r[idCol - 1]];
    if (at) { sh.getRange(at, 1, 1, idCol).setValues([r]); updated++; }
    else { added.push(r); }
  });
  if (added.length) {
    sh.getRange(sh.getLastRow() + 1, 1, added.length, idCol).setValues(added);
    sh.getRange(2, idCol, sh.getLastRow() - 1, 1).setNumberFormat('@');
  }
  if (sh.getLastRow() > 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, idCol).sort([{ column: 1, ascending: true }, { column: 2, ascending: true }]);
  }
  return { added: added.length, updated: updated };
}

/* ---------------- HTTP ---------------- */

function togglRequest_(method, url, payload, token) {
  var opts = {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(token + ':api_token') },
    contentType: 'application/json'
  };
  if (payload) opts.payload = JSON.stringify(payload);
  for (var attempt = 0; attempt < 3; attempt++) {
    var r = UrlFetchApp.fetch(url, opts);
    var code = r.getResponseCode();
    var headers = r.getAllHeaders() || {};
    if (code === 429) { Utilities.sleep(5000 * (attempt + 1)); continue; }
    if (code === 401 || code === 403) throw new Error('Toggl rejected the API token (HTTP ' + code + '). Reconnect with a fresh token.');
    if (code === 402) {
      var wait = headers['X-Toggl-Quota-Resets-In'] || headers['x-toggl-quota-resets-in'] || '?';
      throw new Error('Toggl API hourly limit reached. Try again in about ' + wait + ' seconds.');
    }
    if (code >= 400) throw new Error('Toggl API error ' + code + ': ' + r.getContentText().slice(0, 200));
    Utilities.sleep(1000); // Toggl recommends about 1 request per second
    var text = r.getContentText();
    return { body: text ? JSON.parse(text) : null, headers: headers };
  }
  throw new Error('Toggl API is rate limiting requests. Try again in a few minutes.');
}

/* ---------------- Helpers ---------------- */

function togglHms_(s) {
  s = Math.max(0, Math.round(s));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
}

function togglParseDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
