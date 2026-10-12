'use strict';

// ---------- Réglages enregistrés sur le téléphone ----------
const STORE = 'pointage.config';
function loadConfig() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
}
function saveConfig(cfg) {
  try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* stockage indisponible */ }
}
let config = loadConfig();

// ---------- Appels à l'API Google Apps Script ----------
async function api(action, params = {}, write = false) {
  if (!config.url) throw new Error("L'appli n'est pas reliée au tableau.");
  const body = Object.assign({ action, key: config.key }, params);
  let res;
  if (write) {
    // Corps en text/plain : requête "simple", sans pré-vérification CORS.
    res = await fetch(config.url, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
  } else {
    res = await fetch(config.url + '?' + new URLSearchParams(body), { redirect: 'follow' });
  }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) {
    throw new Error("Réponse inattendue du script. Vérifie que l'accès du déploiement est réglé sur « Tout le monde ».");
  }
  if (!json.ok) throw new Error(json.error || 'Erreur inconnue.');
  return json.data;
}

// ---------- Outils ----------
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const isoDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}
function show(el, text, cls) { $(el).textContent = text; $(el).className = 'msg ' + (cls || ''); }

// ---------- Écran de connexion ----------
function openSetup() {
  $('cfgName').value = config.name || '';
  $('cfgUrl').value = config.url || '';
  $('cfgKey').value = config.key || '';
  $('cfgCancel').hidden = !config.url;
  show('cfgMsg', '');
  $('main').hidden = true;
  $('setup').hidden = false;
}

async function saveSetup() {
  const url = $('cfgUrl').value.trim();
  const key = $('cfgKey').value.trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec$/.test(url)) {
    show('cfgMsg', "L'adresse doit commencer par https://script.google.com et finir par /exec.", 'err');
    return;
  }
  if (!key) { show('cfgMsg', "Saisis le code d'accès.", 'err'); return; }
  const previous = config;
  config = { name: $('cfgName').value.trim(), url, key };
  $('cfgSave').disabled = true;
  show('cfgMsg', 'Connexion au tableau…');
  try {
    const info = await api('ping');
    saveConfig(config);
    show('cfgMsg', 'Connecté à « ' + info.sheet + ' ».', 'ok');
    setTimeout(openMain, 600);
  } catch (err) {
    config = previous;
    show('cfgMsg', err.message, 'err');
  } finally {
    $('cfgSave').disabled = false;
  }
}

// ---------- Écran principal ----------
let timeTouched = false, mode = 'arrivee', current = null;

function openMain() {
  $('setup').hidden = true;
  $('main').hidden = false;
  $('greet').textContent = config.name ? 'Bonjour ' + config.name + ' 👋' : 'Bonjour 👋';
  load();
}

function tick() {
  const now = new Date();
  $('clock').textContent = hhmm(now);
  if (!timeTouched) $('time').value = hhmm(now);
}

function setDayLabel() {
  const [y, m, d] = $('date').value.split('-').map(Number);
  $('dayLabel').textContent = new Date(y, m - 1, d)
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function setMode(m) {
  mode = m;
  $('mIn').classList.toggle('on', m === 'arrivee');
  $('mOut').classList.toggle('on', m === 'depart');
  $('goLabel').textContent = m === 'arrivee' ? "Valider l'arrivée" : 'Valider le départ';
  $('go').classList.toggle('out', m === 'depart');
  $('pauseLink').hidden = m !== 'depart';
  if (m === 'arrivee') $('pauseChip').classList.add('off');
}

function renderWeek(w) {
  const max = Math.max(9, ...w.days.map(d => Math.max(d.worked || 0, d.planned || 0)));
  const sel = $('date').value;
  $('bars').innerHTML = w.days.map(d =>
    '<div class="bar' + (d.date === sel ? ' sel' : '') + '"><div class="track">' +
    '<div class="fill" style="height:' + ((d.worked || 0) / max * 100) + '%">' +
    (d.worked >= 1.5 ? '<em>' + d.label + '</em>' : '') + '</div></div>' +
    '<span>' + d.name + '</span></div>').join('');
  $('weekTotal').innerHTML = w.worked + ' <small>/ ' + w.planned + ' prévues</small>';
}

function render(d) {
  current = d;
  renderWeek(d.week);
  $('go').disabled = !d.found;
  if (!d.found) {
    ['sIn', 'sOut', 'sWork', 'sGap'].forEach(id => { $(id).textContent = '–'; });
    $('dockHint').textContent = 'Week-end ou hors période';
    $('dockState').textContent = 'Jour non travaillé';
    show('msg', "Ce jour n'est pas dans le tableau.", 'err');
    return;
  }
  $('sIn').textContent = d.arrivee || '–';
  $('sOut').textContent = d.depart || '–';
  $('sWork').textContent = d.travaille || '–';
  $('sGap').textContent = d.ecart || '–';
  $('sGap').className = d.ecart.startsWith('+') ? 'pos' : d.ecart.startsWith('-') ? 'neg' : '';
  if (!d.arrivee) { $('dockHint').textContent = 'Pas encore pointé'; $('dockState').textContent = 'Bonne journée'; }
  else if (!d.depart) { $('dockHint').textContent = 'Arrivée à ' + d.arrivee; $('dockState').textContent = 'En poste'; }
  else { $('dockHint').textContent = 'Journée terminée'; $('dockState').textContent = d.travaille + ' travaillées'; }
  setMode(d.arrivee && !d.depart ? 'depart' : !d.arrivee ? 'arrivee' : mode);
}

async function load() {
  setDayLabel();
  show('msg', 'Chargement…');
  try {
    const d = await api('day', { date: $('date').value });
    render(d);
    if (d.found) show('msg', '');
  } catch (err) {
    show('msg', err.message, 'err');
  }
}

async function punch() {
  const time = $('time').value;
  if (!time) { show('msg', "Choisis une heure.", 'err'); return; }
  const already = current && (mode === 'arrivee' ? current.arrivee : current.depart);
  if (already && !confirm('Remplacer ' + already + ' par ' + time + ' ?')) return;
  const label = mode === 'arrivee' ? 'Arrivée' : 'Départ';
  $('go').disabled = true;
  show('msg', 'Enregistrement…');
  try {
    const d = await api('punch', {
      date: $('date').value, type: mode, time,
      pause: mode === 'depart' ? $('pause').value : ''
    }, true);
    render(d);
    show('msg', label + ' enregistrée à ' + time + '.', 'ok');
    if (label === 'Arrivée') toast('Bonne journée, travaille bien 😘');
    timeTouched = false;
    if (navigator.vibrate) navigator.vibrate(30);
  } catch (err) {
    $('go').disabled = false;
    show('msg', err.message, 'err');
  }
}

// ---------- Démarrage ----------
$('date').value = isoDate(new Date());
$('date').addEventListener('change', load);
$('time').addEventListener('input', () => { timeTouched = true; });
$('mIn').addEventListener('click', () => setMode('arrivee'));
$('mOut').addEventListener('click', () => setMode('depart'));
$('pauseLink').addEventListener('click', () => $('pauseChip').classList.toggle('off'));
$('go').addEventListener('click', punch);
$('settings').addEventListener('click', openSetup);
$('cfgSave').addEventListener('click', saveSetup);
$('cfgCancel').addEventListener('click', openMain);

// Au retour sur l'appli (iPhone la garde en mémoire), on remet la date et l'heure du jour.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || $('main').hidden) return;
  const today = isoDate(new Date());
  timeTouched = false;
  tick();
  if ($('date').value !== today) { $('date').value = today; load(); }
});

setMode('arrivee');
tick();
setInterval(tick, 15000);
if (config.url && config.key) openMain(); else openSetup();

// Demande à iOS de ne jamais effacer les réglages enregistrés (connexion faite une seule fois).
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
