/**
 * API de pointage pour l'appli iPhone (PWA).
 * À coller dans le Google Sheets : Extensions > Apps Script.
 *
 * L'appli appelle cette API avec :
 *   GET  ?action=ping&key=...
 *   GET  ?action=day&date=2026-10-12&key=...
 *   POST {"action":"punch","date":"2026-10-12","type":"arrivee"|"depart","time":"08:32","pause":"","key":"..."}
 *
 * Avant le premier déploiement, exécuter une fois la fonction setup()
 * pour créer le code d'accès (il s'affiche dans le journal d'exécution).
 */

const SHEET_NAME = 'Pointage';
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

// ---------- Mise en place ----------

function setup() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('APP_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    props.setProperty('APP_KEY', key);
  }
  sheet_(); // vérifie que l'onglet existe
  Logger.log("Code d'accès à saisir dans l'appli : " + key);
}

// ---------- Points d'entrée HTTP ----------

function doGet(e) {
  return respond_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  let params = {};
  try { params = JSON.parse(e.postData.contents); } catch (err) { /* corps vide ou invalide */ }
  return respond_(params);
}

function respond_(p) {
  let out;
  try {
    checkKey_(p.key);
    switch (p.action) {
      case 'ping':  out = { ok: true, data: { sheet: SpreadsheetApp.getActive().getName() } }; break;
      case 'day':   out = { ok: true, data: getDay(p.date) }; break;
      case 'punch': out = { ok: true, data: punch(p.date, p.type, p.time, p.pause) }; break;
      default: throw new Error('Action inconnue.');
    }
  } catch (err) {
    out = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_KEY');
  if (!expected) throw new Error("Le code d'accès n'est pas configuré : exécute setup() dans Apps Script.");
  if (String(key || '') !== expected) throw new Error("Code d'accès incorrect.");
}

// ---------- Lecture du tableau ----------

function sheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Onglet "' + SHEET_NAME + '" introuvable.');
  return sh;
}

// Lit les colonnes A à I une seule fois et indexe les lignes par date (yyyy-MM-dd).
function index_(sh) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const n = sh.getLastRow() - 1;
  const range = sh.getRange(2, 1, n, 9);
  const values = range.getValues();
  const display = range.getDisplayValues();
  const byDate = {};
  for (let i = 0; i < n; i++) {
    const v = values[i][0];
    if (v instanceof Date) {
      byDate[Utilities.formatDate(v, tz, 'yyyy-MM-dd')] = { row: i + 2, v: values[i], d: display[i] };
    }
  }
  return byDate;
}

function checkDate_(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) throw new Error('Date invalide : ' + dateStr);
}

// "08:32" -> fraction de journée (format horaire de Sheets)
function toDayFraction_(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) throw new Error('Heure invalide : ' + hhmm);
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error('Heure invalide : ' + hhmm);
  return (h * 60 + min) / 1440;
}

function fmtHours_(h) {
  const t = Math.round(h * 60);
  return Math.floor(t / 60) + 'h' + String(t % 60).padStart(2, '0');
}

// Les 5 jours ouvrés (lundi à vendredi) de la semaine qui contient dateStr.
function week_(byDate, dateStr) {
  const p = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  const monday = new Date(base.getTime() - ((base.getUTCDay() + 6) % 7) * 86400000);
  let worked = 0, planned = 0;
  const days = JOURS.map(function (name, i) {
    const key = Utilities.formatDate(new Date(monday.getTime() + i * 86400000), 'UTC', 'yyyy-MM-dd');
    const e = byDate[key];
    const w = e && typeof e.v[6] === 'number' ? e.v[6] * 24 : 0;   // colonne G
    const pl = e && typeof e.v[7] === 'number' ? e.v[7] * 24 : 0;  // colonne H
    worked += w; planned += pl;
    return { name: name, date: key, worked: w, planned: pl, label: w ? fmtHours_(w) : '' };
  });
  return { days: days, worked: fmtHours_(worked), planned: fmtHours_(planned) };
}

function getDay(dateStr) {
  checkDate_(dateStr);
  const byDate = index_(sheet_());
  const e = byDate[dateStr];
  const out = { found: !!e, date: dateStr, week: week_(byDate, dateStr) };
  if (e) {
    const d = e.d; // valeurs affichées A..I
    Object.assign(out, {
      type: d[2], arrivee: d[3], depart: d[4], pause: d[5],
      travaille: d[6], prevu: d[7], ecart: d[8]
    });
  }
  return out;
}

// ---------- Écriture ----------

function punch(dateStr, type, hhmm, pauseHHMM) {
  checkDate_(dateStr);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const e = index_(sh)[dateStr];
    if (!e) throw new Error("Ce jour n'existe pas dans le tableau (week-end ou hors période).");

    const col = type === 'arrivee' ? 4 : type === 'depart' ? 5 : 0;
    if (!col) throw new Error('Type de pointage inconnu.');
    sh.getRange(e.row, col).setValue(toDayFraction_(hhmm));

    if (type === 'depart' && pauseHHMM) {
      sh.getRange(e.row, 6).setValue(toDayFraction_(pauseHHMM));
    }
    if (!e.v[2]) sh.getRange(e.row, 3).setValue('Entreprise');

    SpreadsheetApp.flush();
    return getDay(dateStr);
  } finally {
    lock.releaseLock();
  }
}
