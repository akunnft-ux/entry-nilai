/* ============================================================================
 * Code.gs — Backend Google Apps Script, aplikasi "Entry Nilai".
 *
 * Sumber kontrak:
 *   - docs/prd.md        §15 (API table API-001..013), §8 (FR-001..009), §21 (SEC)
 *   - docs/architecture.md  ADR-002 (transport), ADR-004 (kunci bisnis), ADR-005
 *   - docs/schema.md     definisi 4 sheet, constraint C-01..C-10, IX-01..IX-07
 *
 * Aturan yang dijaga ketat:
 *   - SEMUA path return body non-kosong (ADR-002): doGet/doPost → handle_().
 *   - Endpoint publik hanya `ping` dan `auth.verify` (BR-010). Sisanya wajib token.
 *   - Validasi server otoritatif; client hanya preview.
 *   - Menambah aksi = 1 baris di ACTIONS (BO-005) — doPost/doGet tidak berubah.
 * ============================================================================
 */

/* ----------------------------------------------------------------------------
 * Konstanta & skema
 * ------------------------------------------------------------------------- */
var APP_VERSION = '1.0.2';
var TOKEN_TTL_SEC = 6 * 3600;                    /* CacheService maks 21600 dtk */
var BATCH_SIZE = 200;
var TZ = 'GMT';

var SCHEMA = {
  siswa:  ['id', 'nis', 'nama', 'kelas', 'status', 'created_at', 'updated_at', 'created_by', 'updated_by'],
  nilai:  ['id', 'siswa_id', 'kelas', 'jenis', 'kode', 'mapel', 'skor', 'catatan', 'created_at', 'updated_at', 'actor'],
  konfig: ['group', 'key', 'label', 'aktif', 'urut', 'parent', 'updated_at'],
  log:    ['ts', 'actor', 'action', 'entity', 'entity_id', 'before', 'after', 'request_id']
};

var KONFIG_GROUPS = ['kelas', 'jenis', 'kode', 'app'];
var SISWA_STATUS = ['aktif', 'nonaktif'];

/* Aksi yang boleh dipanggil TANPA token (BR-010). */
var PUBLIC_ACTIONS = ['ping', 'auth.verify'];

/* Batas rate per action. scope 'global' dipakai auth.verify (tanpa identitas IP). */
var RATE_CONF = {
  'auth.verify':       { key: 'AUTH',  scope: 'global',  n: 5,  win: 900 },
  'settings.changePin':{ scope: 'session',                n: 5,  win: 900 },
  'write':             { scope: 'session',                n: 30, win: 60 },
  'read':              { scope: 'session',                n: 60, win: 60 },
  'rekap':             { scope: 'session',                n: 30, win: 60 },
  'log':               { scope: 'session',                n: 10, win: 60 }
};

/* ---------------- error aplikasi ---------------- */
function AppError_(code, message, opt) {
  this.code = code;
  this.message = message || code;
  this.retryIn = opt && opt.retryIn;
  this.details = opt && opt.details;
}
function throwApp_(code, message, opt) { throw new AppError_(code, message, opt); }

var CTX = { requestId: '', warnings: [], retryIn: null, details: null };

/* ----------------------------------------------------------------------------
 * Entry point — ADR-002: doGet & doPost memanggil handler yang sama.
 * ------------------------------------------------------------------------- */
function doGet(e) {
  var query = (e && e.parameter) || {};
  var cb = query.cb || '';
  var payload = null;
  if (query.p) payload = parseJson_(query.p);
  return respond_(handle_(payload, 'GET', query), cb);
}

function doPost(e) {
  var raw = e && e.postData && e.postData.contents;
  var query = (e && e.parameter) || {};
  var cb = query.cb || '';
  if (!raw && query.p) raw = query.p;
  var payload = raw ? parseJson_(raw) : null;
  return respond_(handle_(payload, 'POST', query), cb);
}

function respond_(env, cb) {
  var text = JSON.stringify(env);
  var out;
  if (cb) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$]{0,63}$/.test(cb)) cb = 'callback';
    out = ContentService.createTextOutput(cb + '(' + text + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    out = ContentService.createTextOutput(text)
      .setMimeType(ContentService.MimeType.JSON);
  }
  return out;
}

function parseJson_(s) {
  if (typeof s !== 'string' || !s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

/* ----------------------------------------------------------------------------
 * Router generik (BO-005). Akses: registerAction = 1 baris di objek ACTIONS.
 * ------------------------------------------------------------------------- */
var ACTIONS = {};

function registerAction(name, bucket, fn) {
  ACTIONS[name] = { bucket: bucket, fn: fn };
}

function handle_(payload, method, query) {
  CTX = { requestId: Utilities.getUuid(), warnings: [], retryIn: null, details: null, method: method, logQueue: [] };

  try {
    var action = String((payload && (payload.a || payload.action)) || '').trim();
    if (!action) throwApp_('BAD_REQUEST', 'Action wajib diisi.');

    var entry = ACTIONS[action];
    if (!entry) throwApp_('UNKNOWN_ACTION', 'Aksi tidak dikenal: ' + action);

    ensureSchema_();

    var session = null;
    if (PUBLIC_ACTIONS.indexOf(action) === -1) {
      session = requireAuth_(payload ? payload.token : '');
    }

    rateLimit_(entry.bucket, action, session);

    var data = entry.fn(payload, session);
    if (CTX.warnings.length && data && typeof data === 'object') {
      data.warnings = CTX.warnings;
    }
    return { ok: true, data: data, requestId: CTX.requestId };
  } catch (e) {
    if (e instanceof AppError_) {
      return {
        ok: false,
        error: { code: e.code, message: e.message,
                 retryIn: e.retryIn || undefined, details: e.details || undefined },
        requestId: CTX.requestId
      };
    }
    Logger.log('FATAL requestId=' + CTX.requestId + ' :: ' + (e && e.stack || e));
    return { ok: false, error: { code: 'SERVER_ERROR', message: 'Terjadi kesalahan pada server.' },
             requestId: CTX.requestId };
  } finally {
    flushLogs_();
  }
}

/* ---------- register aksi ---------- */
registerAction('ping',               'read',  actionPing_);
registerAction('auth.verify',        'auth.verify', actionVerify_);
registerAction('auth.logout',        'read',  actionLogout_);
registerAction('meta.get',           'read',  actionMetaGet_);
registerAction('siswa.list',         'read',  actionSiswaList_);
registerAction('siswa.save',         'write', actionSiswaSave_);
registerAction('nilai.list',         'read',  actionNilaiList_);
registerAction('nilai.bulkSave',     'write', actionNilaiBulkSave_);
registerAction('rekap.get',          'rekap', actionRekapGet_);
registerAction('konfig.list',        'read',  actionKonfigList_);
registerAction('konfig.save',        'write', actionKonfigSave_);
registerAction('konfig.remove',      'write', actionKonfigRemove_);
registerAction('konfig.deactivate',  'write', actionKonfigDeactivate_);
registerAction('log.list',           'log',   actionLogList_);
registerAction('settings.changePin', 'settings.changePin', actionChangePin_);

/* ----------------------------------------------------------------------------
 * Auth & rate limit
 * ------------------------------------------------------------------------- */
function props_() { return PropertiesService.getScriptProperties(); }

function sha256Hex_(str) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(str), Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < digest.length; i++) {
    var b = (digest[i] < 0) ? digest[i] + 256 : digest[i];
    out += ('0' + b.toString(16)).slice(-2);
  }
  return out;
}

function cache_() { return CacheService.getScriptCache(); }

function requireAuth_(token) {
  if (!token) throwApp_('INVALID_TOKEN', 'Sesi berakhir, silakan verifikasi PIN kembali.');
  var raw = cache_().get('TOK:' + token);
  if (!raw) throwApp_('INVALID_TOKEN', 'Sesi berakhir, silakan verifikasi PIN kembali.');
  var rec;
  try { rec = JSON.parse(raw); } catch (e) { throwApp_('INVALID_TOKEN', 'Sesi berakhir, silakan verifikasi PIN kembali.'); }
  if (!rec || !rec.actor || rec.exp < Date.now()) {
    cache_().remove('TOK:' + token);
    throwApp_('INVALID_TOKEN', 'Sesi berakhir, silakan verifikasi PIN kembali.');
  }
  return { actor: rec.actor, token: token };
}

function issueToken_(actor) {
  var token = Utilities.getUuid().replace(/-/g, '');
  var rec = JSON.stringify({ actor: actor, exp: Date.now() + TOKEN_TTL_SEC * 1000 });
  cache_().put('TOK:' + token, rec, TOKEN_TTL_SEC);
  return { token: token, expiresAt: Date.now() + TOKEN_TTL_SEC * 1000 };
}

function rateLimit_(bucket, action, session) {
  var conf = RATE_CONF[bucket];
  if (!conf) return;
  var key;
  if (conf.scope === 'global') key = 'RL:' + conf.key;
  else if (session && session.token) key = 'RLU:' + session.token.slice(0, 16) + ':' + bucket;
  else key = 'RLI:' + action; /* sesi nil → fallback per-aksi (jarang terjadi) */

  try {
    var cache = cache_();
    var raw = cache.get(key);
    var now = Date.now();
    var rec = null;
    if (raw) { try { rec = JSON.parse(raw); } catch (e) { rec = null; } }
    if (!rec || (now - rec.t0) >= conf.win * 1000) rec = { t0: now, n: 0 };
    rec.n += 1;
    cache.put(key, JSON.stringify(rec), conf.win);
    if (rec.n > conf.n) {
      var retryIn = Math.max(1, Math.ceil((rec.t0 + conf.win * 1000 - now) / 1000));
      throwApp_('RATE_LIMITED',
        'Terlalu banyak permintaan. Coba lagi dalam ' + Math.ceil(retryIn / 60) + ' menit.',
        { retryIn: retryIn });
    }
  } catch (e) {
    if (e instanceof AppError_) throw e;
    Logger.log('rateLimit_ gagal (fail-open): ' + e);
  }
}

/* ----------------------------------------------------------------------------
 * Spreadsheet & schema (docs/schema.md §13 migration, idempoten)
 * ------------------------------------------------------------------------- */
function spreadsheet_() {
  if (!_ssCache) {
    var id = props_().getProperty('SPREADSHEET_ID');
    var ss = null;
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
    else { try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; } }
    if (!ss) throwApp_('SHEET_NOT_READY',
      'Spreadsheet belum dihubungkan. Set properti SPREADSHEET_ID (lihat docs/deployment.md).');
    _ssCache = ss;
  }
  return _ssCache;
}

/* C-12: objek spreadsheet di-cache selama 1 eksekusi script (bukan antar request).
   openById/getActiveSpreadsheet tidak diulang dlm 1 request berurutan. */
var _ssCache = null;

function sheet_(name) {
  var ss = spreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) throwApp_('SHEET_NOT_READY', 'Sheet "' + name + '" belum dibuat.');
  return sh;
}

function ensureSchema_() {
  /* C-13: hindari RPC getSheets di tiap request — schema parenan v60 detik.
   * Skema hanya berubah lewat kode ini; edit manual sheet terdeteksi di
   * cache-miss berikutnya (maksimal 60 detik lebih lambat). */
  try { if (cache_().get('SCHEMA_OK') === '1') return; } catch (e) {}

  var ss = spreadsheet_();
  var names = {};
  ss.getSheets().forEach(function (sh) { names[sh.getName()] = true; });

  for (var sheetName in SCHEMA) {
    if (!Object.prototype.hasOwnProperty.call(SCHEMA, sheetName)) continue;
    var want = SCHEMA[sheetName];
    var sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
      sh.appendRow(want);
      continue;
    }
    if (sh.getLastRow() === 0) { sh.appendRow(want); continue; }
    var have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    /* additive-only (ADR-006): tambah kolom baru, jangan sentuh yang lama */
    for (var i = 0; i < want.length; i++) {
      if (have.indexOf(want[i]) === -1) {
        sh.getRange(1, sh.getLastColumn() + 1).setValue(want[i]);
        CTX.warnings.push('SCHEMA_MIGRATED:' + sheetName + ':+' + want[i]);
      }
    }
    /* kolom tak dikenal = owner mengedit manual → warning (RISK-014) */
    for (var j = 0; j < have.length; j++) {
      if (have[j] && want.indexOf(have[j]) === -1) {
        CTX.warnings.push('SCHEMA_MISMATCH:' + sheetName + ':+' + have[j]);
        break;
      }
    }
  }
  try { cache_().put('SCHEMA_OK', '1', 60); } catch (e) {}
}

function nowIso_() { return new Date().toISOString(); }

/* nilai string yang aman terhadap null/undefined — null dikosongkan, bukan "null" */
function pick_(rec, field, row, fallback) {
  if (rec[field] === undefined) {
    var rv = row && row[field];
    return (rv === undefined || rv === null) ? fallback : rv;
  }
  var v = rec[field];
  return v === null ? '' : v;
}

function randId_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

/* ----------------------------------------------------------------------------
 * REPO — membaca & menulis (IX-01..IX-07; kunci bisnis, bukan nomor baris)
 * ------------------------------------------------------------------------- */
function readSheetObjects_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 1) return [];
  var range = sh.getRange(1, 1, last, sh.getLastColumn());
  var rows = range.getValues();
  var headers = rows.shift();
  return rows.map(function (r) {
    var o = {};
    for (var i = 0; i < headers.length; i++) o[headers[i]] = r[i];
    return o;
  });
}

function readSiswa_() {
  var sh = sheet_('siswa');
  var last = sh.getLastRow();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var vals = last > 1 ? sh.getRange(2, 1, last - 1, headers.length).getValues() : [];
  var byId = {}; var byNis = {}; var byKelas = {};
  var list = vals.map(function (r, i) {
    var o = { row: i + 2 };
    for (var j = 0; j < headers.length; j++) o[headers[j]] = r[j];
    byId[o.id] = o;
    var nis = String(o.nis || '').trim().toLowerCase();
    if (nis) byNis[nis] = o;
    if (o.kelas) { byKelas[o.kelas] = byKelas[o.kelas] || []; byKelas[o.kelas].push(o); }
    return o;
  });
  return { list: list, byId: byId, byNis: byNis, byKelas: byKelas };
}

function readNilai_(kelas, jenis, kode) {
  var sh = sheet_('nilai');
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var c = function (name) { return headers.indexOf(name) + 1; };
  var cId = c('id'), cSiswa = c('siswa_id'), cKelas = c('kelas'), cJenis = c('jenis'),
      cKode = c('kode'), cMapel = c('mapel'), cSkor = c('skor'), cCatatan = c('catatan'),
      cCreated = c('created_at'), cUpdated = c('updated_at'), cActor = c('actor');

  var all = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var r = all[i];
    if (kelas && r[cKelas - 1] !== kelas) continue;
    if (jenis && r[cJenis - 1] !== jenis) continue;
    if (kode && r[cKode - 1] !== kode) continue;
    out.push({
      row: i + 2,
      id: r[cId - 1], siswa_id: r[cSiswa - 1], kelas: r[cKelas - 1],
      jenis: r[cJenis - 1], kode: r[cKode - 1], mapel: r[cMapel - 1],
      skor: r[cSkor - 1], catatan: r[cCatatan - 1],
      created_at: r[cCreated - 1], updated_at: r[cUpdated - 1], actor: r[cActor - 1]
    });
  }
  return out;
}

function readKonfig_() {
  /* C-14: konfig jarang berubah — baca sekali dari sheet, cache 10 dtk.
     Di-invalidate di setiap konfig.save/remove/deactivate agar write selalu
     langsung terlihat oleh request berikutnya. */
  try {
    var cached = cache_().get('KONFIG_V1');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  var objs = readSheetObjects_('konfig');
  var byGroup = {};
  objs.forEach(function (e) {
    byGroup[e.group] = byGroup[e.group] || [];
    byGroup[e.group].push(e);
  });
  var out = { list: objs, byGroup: byGroup };
  try { cache_().put('KONFIG_V1', JSON.stringify(out), 10); } catch (e) {}
  return out;
}

function invalidateKonfig_() {
  try { cache_().remove('KONFIG_V1'); } catch (e) {}
}

function konfigEntry_(group, key) {
  var k = readKonfig_();
  var list = k.byGroup[group] || [];
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  return null;
}

/* ----------------------------------------------------------------------------
 * AUDIT — append-only (FR-009). Gagal menulis log TIDAK membatalkan transaksi.
 * C-16: log di-queue dulu (tanpa RPC), lalu di-flush SATU batch di akhir request
 * oleh flushLogs_() dari finally handle_() — cost log ≈ 2 RPC untuk berapa pun.
 * ------------------------------------------------------------------------- */
function appendLog_(actor, action, entity, entityId, before, after) {
  if (!CTX || !CTX.logQueue) return;
  var clip = function (v) {
    if (v === null || v === undefined) return '';
    var s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 5000 ? s.slice(0, 5000) : s;      /* C-08 */
  };
  CTX.logQueue.push([nowIso_(), actor || 'unknown', action, entity, entityId,
                     clip(before), clip(after), CTX.requestId]);
}

function flushLogs_() {
  var q = CTX && CTX.logQueue;
  if (!q || !q.length) return;
  var rows = q.slice();
  CTX.logQueue.length = 0;
  try {
    var sh = sheet_('log');
    var last = sh.getLastRow();
    sh.getRange(last + 1, 1, rows.length, rows[0].length).setValues(rows);
  } catch (e) {
    CTX.warnings.push('LOG_WRITE_FAILED');
    Logger.log('flushLogs_ gagal: ' + e);
  }
}

/* ============================================================================
 * Handlers
 * ========================================================================== */

/* ------------- ping (API-001) ------------- */
function actionPing_() {
  var out = { version: APP_VERSION, sheetOk: true };
  return out;
}

/* ------------- auth.verify (API-002) — PIN sudah sha256 dari klien ------------- */
function actionVerify_(p) {
  var hash = String((p && p.pin) || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throwApp_('INVALID_PIN', 'PIN tidak valid.');

  var stored = props_().getProperty('PIN_HASH');
  if (!stored) {
    throwApp_('PIN_NOT_CONFIGURED',
      'PIN belum diatur. Atur Script Property PIN_HASH (lihat docs/deployment.md).');
  }
  if (sha256Hex_(hash) !== stored) {
    appendLog_('unknown', 'LOGIN_FAIL', 'auth', 'auth.verify', null, { ok: false });
    throwApp_('INVALID_PIN', 'PIN salah.', { retryIn: 60 });
  }
  cache_().remove('RL:AUTH');            /* verifikasi sukses → reset penghitung brute-force */
  var sess = { actor: 'guru' };
  var tok = issueToken_('guru');
  appendLog_('guru', 'LOGIN_OK', 'auth', sess.actor, null, { issued: true });
  return tok;
}

/* ------------- auth.logout ------------- */
function actionLogout_(p, sess) {
  try { if (p && p.token) cache_().remove('TOK:' + p.token); } catch (e) {}
  appendLog_(sess.actor, 'LOGOUT', 'auth', sess.actor, null, null);
  return { done: true };
}

/* ------------- meta.get (API-003) ------------- */
function actionMetaGet_() {
  var k = readKonfig_();
  var pick = function (group) {
    var list = (k.byGroup[group] || []).slice();
    list.sort(function (a, b) {
      return (a.urut || 0) - (b.urut || 0) || String(a.key).localeCompare(String(b.key));
    });
    return list.map(function (e) {
      return { group: group, key: e.key, label: e.label,
               aktif: !(e.aktif === false || e.aktif === 'false'),
               parent: e.parent || '' };
    });
  };
  return {
    kelas: pick('kelas'),
    jenis: pick('jenis'),
    kode: pick('kode'),
    app: { name: 'Entry Nilai', version: APP_VERSION }
  };
}

/* ------------- siswa.list (API-004) ------------- */
function actionSiswaList_(p) {
  var k = readSiswa_();
  var kelas = (p && p.kelas) || '';
  var status = (p && p.status) || '';

  if (kelas && !konfigEntry_('kelas', kelas)) throwApp_('INVALID_KELAS', 'Kelas tidak dikenal.');

  var out = k.list.filter(function (s) {
    if (kelas && s.kelas !== kelas) return false;
    if (status && s.status !== status) return false;
    return true;
  }).map(function (s) {
    return { id: s.id, nis: s.nis || '', nama: s.nama, kelas: s.kelas,
             status: s.status || 'aktif',
             created_at: s.created_at, updated_at: s.updated_at };
  });
  return { siswa: out };
}

/* ------------- siswa.save (API-005) ------------- */
function actionSiswaSave_(p) {
  var records = Array.isArray(p && p.records) ? p.records : [];
  if (!records.length) return { saved: 0, skipped: [{ nis: '', reason: 'EMPTY_BATCH', message: 'Tidak ada record.' }] };
  if (records.length > BATCH_SIZE) throwApp_('BAD_REQUEST', 'Maksimum ' + BATCH_SIZE + ' record per request.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throwApp_('SHEET_BUSY', 'Spreadsheet sedang digunakan, coba lagi sebentar.');
  try {
    var repo = readSiswa_();
    var konfig = readKonfig_();
    var validKelas = {};
    ((konfig.byGroup['kelas'] || [])).forEach(function (e) { validKelas[e.key] = e; });

    var skipped = [];
    var ops = [];                       /* {isNew, after, rowNum?, before?} */
    var seenNis = {};
    var usedIds = {};

    records.forEach(function (rec) {
      var id = String(rec.id || '').trim();
      var isNew = !id;
      var row = isNew ? null : repo.byId[id];
      if (!isNew && !row) { skipped.push({ id: id, reason: 'NOT_FOUND', message: 'Siswa tidak ditemukan.' }); return; }

      var nama = String(pick_(rec, 'nama', row, '')).trim();
      var kelas = String(pick_(rec, 'kelas', row, '')).trim();
      var status = String(pick_(rec, 'status', row, 'aktif')).trim();
      var nis = String(pick_(rec, 'nis', row, '')).trim();

      if (nama.length < 2 || nama.length > 80 || /[\u0000-\u001f]/.test(nama)) {
        skipped.push({ id: isNew ? '' : id, nama: nama, reason: 'NAMA_INVALID', message: 'Nama harus 2–80 karakter.' }); return;
      }
      if (isNew || rec.kelas !== undefined) {
        if (!kelas) { skipped.push({ id: isNew ? '' : id, nama: nama, reason: 'KELAS_INVALID', message: 'Kelas wajib diisi.' }); return; }
        if (!validKelas[kelas]) { skipped.push({ id: isNew ? '' : id, nama: nama, reason: 'KELAS_INVALID', message: 'Kelas tidak dikenal.' }); return; }
      }
      if (SISWA_STATUS.indexOf(status) === -1) {
        skipped.push({ id: isNew ? '' : id, nama: nama, reason: 'STATUS_INVALID', message: 'Status tidak valid.' }); return;
      }
      if (nis && nis.length > 32) {
        skipped.push({ id: isNew ? '' : id, nama: nama, reason: 'NIS_INVALID', message: 'NIS terlalu panjang.' }); return;
      }

      /* C-03: NIS unik case-insensitive */
      var nisKey = nis.toLowerCase();
      if (nisKey) {
        var owner = repo.byNis[nisKey];
        if (owner && owner.id !== id) {
          skipped.push({ id: isNew ? '' : id, nis: nis, reason: 'DUPLICATE_NIS',
            message: 'NIS "' + nis + '" sudah dipakai ' + (owner.nama || 'siswa lain') + '.' });
          return;
        }
        if (seenNis[nisKey]) { skipped.push({ id: isNew ? '' : id, nis: nis, reason: 'DUPLICATE_NIS', message: 'NIS duplikat dalam satu batch.' }); return; }
        seenNis[nisKey] = true;
      }

      var before = null, after = null;
      if (isNew) {
        var id2 = randId_('S');
        while (repo.byId[id2] || usedIds[id2]) id2 = randId_('S');
        usedIds[id2] = true;
        var now = nowIso_();
        after = snapSiswa_(id2, nis, nama, kelas, status, now, now);
        ops.push({ isNew: true, after: after });
      } else {
        var merged = {};
        SCHEMA['siswa'].forEach(function (f) { merged[f] = row[f]; });
        if (rec.nama !== undefined) merged.nama = nama;
        if (rec.kelas !== undefined) merged.kelas = kelas;
        if (rec.status !== undefined) merged.status = status;
        if (rec.nis !== undefined) merged.nis = nis;
        merged.updated_at = nowIso_();
        merged.updated_by = 'guru';
        if (row.nama === merged.nama && row.kelas === merged.kelas &&
            row.status === merged.status && String(row.nis || '') === String(merged.nis || '')) {
          return;   /* tidak berubah → tanpa operasi */
        }
        ops.push({ isNew: false, rowNum: row.row,
                   before: snapSiswa_(row.id, row.nis, row.nama, row.kelas, row.status,
                                      row.created_at, row.updated_at),
                   after: merged });
      }
    });

    var sh = sheet_('siswa');
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var newRows = [];
    ops.forEach(function (op) {
      if (op.isNew) newRows.push(headers.map(function (h) { return op.after[h]; }));
      else {
        var vals = headers.map(function (h) { return op.after[h]; });
        sh.getRange(op.rowNum, 1, 1, headers.length).setValues([vals]);
      }
    });
    if (newRows.length) {
      var last = sh.getLastRow();
      sh.getRange(last + 1, 1, newRows.length, headers.length).setValues(newRows);
    }
    ops.forEach(function (op) {
      appendLog_('guru', op.isNew ? 'INSERT' : 'UPDATE', 'siswa', op.after.id,
                 op.isNew ? null : op.before, op.after);
    });
    return { saved: ops.length, inserted: ops.filter(function (o) { return o.isNew; }).length,
             updated: ops.filter(function (o) { return !o.isNew; }).length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

/* snapshot 4 field yang bisa berubah untuk keperluan log audit */
function snapSiswa_(id, nis, nama, kelas, status, createdAt, updatedAt) {
  return { id: id, nis: nis || '', nama: nama, kelas: kelas, status: status || 'aktif',
           created_at: createdAt, updated_at: updatedAt };
}

/* ------------- nilai.list (API-006) ------------- */
function actionNilaiList_(p) {
  var kelas = String((p && p.kelas) || '').trim();
  var jenis = String((p && p.jenis) || '').trim();
  var kode = String((p && p.kode) || '').trim();
  if (!kelas) throwApp_('INVALID_FILTER', 'Filter kelas wajib diisi.');
  if (!konfigEntry_('kelas', kelas)) throwApp_('INVALID_KELAS', 'Kelas tidak dikenal.');

  var list = readNilai_(kelas, jenis || null, kode || null);
  return { nilai: list.map(function (n) {
    return { id: n.id, siswa_id: n.siswa_id, kelas: n.kelas, jenis: n.jenis, kode: n.kode,
             mapel: n.mapel || '', skor: n.skor, catatan: n.catatan || '', updated_at: n.updated_at };
  }) };
}

/* ------------- nilai.bulkSave (API-007) ------------- */
function actionNilaiBulkSave_(p) {
  var kelas = String((p && p.kelas) || '').trim();
  var jenis = String((p && p.jenis) || '').trim();
  var kode = String((p && p.kode) || '').trim();
  if (!kelas || !jenis || !kode) throwApp_('INVALID_FILTER', 'kelas, jenis, kode wajib dikirim (konteks tabel).');
  var records = Array.isArray(p && p.records) ? p.records : [];
  if (!records.length) return { inserted: 0, updated: 0, deleted: 0, skipped: [] };
  if (records.length > BATCH_SIZE) throwApp_('BAD_REQUEST', 'Maksimum ' + BATCH_SIZE + ' record per request.');

  if (!konfigEntry_('kelas', kelas)) throwApp_('INVALID_KELAS', 'Kelas tidak dikenal.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throwApp_('SHEET_BUSY', 'Spreadsheet sedang digunakan, coba lagi sebentar.');
  try {
    var repo = readSiswa_();
    var nilai = readNilai_(kelas, jenis, kode);
    var jenisCfg = konfigEntry_('jenis', jenis);
    var kodeCfg = konfigEntry_('kode', kode);
    /* C-05: jenis & kode harus aktif */
    if (!jenisCfg || jenisCfg.aktif === false || jenisCfg.aktif === 'false') {
      throwApp_('INVALID_FILTER', 'Jenis penilaian nonaktif. Bawa ke Pengaturan untuk mengaktifkannya.');
    }
    if (!kodeCfg || kodeCfg.aktif === false || kodeCfg.aktif === 'false') {
      throwApp_('INVALID_FILTER', 'Kode penilaian nonaktif.');
    }

    var ctxKey = function (sid) { return sid + '\t' + kelas + '\t' + jenis + '\t' + kode; };
    var byKey = {};
    nilai.forEach(function (n) { byKey[ctxKey(n.siswa_id)] = n; });
    var bySiswaDefault = {};
    nilai.forEach(function (n) { if (!bySiswaDefault[n.siswa_id]) bySiswaDefault[n.siswa_id] = n; });

    var skipped = [];
    var insertRows = [];      /* row nilai untuk di-append */
    var updateRows = [];      /* {old, new} */
    var deleteRows = [];      /* row sheets yang dihapus */

    /* FR-004 edge: record yang sama di batch → yang TERAKHIR menang, yang awal skipped */
    var lastIdx = {};
    records.forEach(function (rec, i) {
      var sidx = rec && String(rec.siswa_id || '').trim();
      if (sidx) lastIdx[sidx] = i;
    });

    records.forEach(function (rec, i) {
      var sid = rec && String(rec.siswa_id || '').trim();
      if (!sid) { skipped.push({ siswa_id: sid, reason: 'INVALID_ROW', message: 'siswa_id wajib.' }); return; }
      if (lastIdx[sid] !== i) {
        skipped.push({ siswa_id: sid, reason: 'DUPLICATE_IN_BATCH', message: 'Record duplikat dalam batch (yang terakhir berlaku).' });
        return;
      }

      var sw = repo.byId[sid];
      if (!sw) { skipped.push({ siswa_id: sid, reason: 'SISWA_NOT_FOUND', message: 'Siswa tidak ditemukan.' }); return; }
      if (sw.status === 'nonaktif') { skipped.push({ siswa_id: sid, reason: 'SISWA_INACTIVE', message: 'Siswa dinonaktifkan.' }); return; }
      if (sw.kelas !== kelas) { skipped.push({ siswa_id: sid, reason: 'KELAS_MISMATCH', message: 'Siswa bukan anggota kelas ini.' }); return; }

      var catatan = (rec.catatan === undefined ? '' : rec.catatan);
      catatan = catatan === null ? '' : String(catatan);
      if (catatan.length > 200) { skipped.push({ siswa_id: sid, reason: 'CATATAN_TOO_LONG', message: 'Catatan maksimal 200 karakter.' }); return; }

      var nilaiV = rec.nilai;
      var isDelete = nilaiV === null || nilaiV === undefined || nilaiV === '' || (typeof nilaiV === 'number' && isNaN(nilaiV));
      if (isDelete) {
        var old = bySiswaDefault[sid];
        if (old) { deleteRows.push({ row: old.row, old: old }); delete bySiswaDefault[sid]; }
        return;
      }

      var skor = Number(nilaiV);
      /* C-01: 0–100, ≤1 desimal */
      if (!isFinite(skor) || skor < 0 || skor > 100) {
        skipped.push({ siswa_id: sid, reason: 'INVALID_SCORE', message: 'Nilai harus 0–100.' });
        return;
      }
      if (typeof nilaiV === 'number' && Math.abs(skor * 10 - Math.round(skor * 10)) > 1e-9) {
        skipped.push({ siswa_id: sid, reason: 'INVALID_SCORE', message: 'Nilai maksimal satu desimal.' }); return;
      }
      skor = Math.round(skor * 10) / 10;

      var prev = bySiswaDefault[sid];
      if (prev) {
        var same = Number(prev.skor) === skor && String(prev.catatan || '') === catatan;
        if (same) return;   /* tidak berubah → tidak usah menulis */
        updateRows.push({ old: prev, new: { skor: skor, catatan: catatan } });
      } else {
        insertRows.push({ siswa_id: sid, skor: skor, catatan: catatan });
      }
    });

    var sh = sheet_('nilai');
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var now = nowIso_();

    /* 1) append baru */
    var inserted = 0;
    if (insertRows.length) {
      var rows = insertRows.map(function (r) {
        var idr = randId_('N');
        var row = {};
        SCHEMA['nilai'].forEach(function (f) { row[f] = ''; });
        row.id = idr; row.siswa_id = r.siswa_id; row.kelas = kelas; row.jenis = jenis;
        row.kode = kode; row.mapel = '-'; row.skor = r.skor;
        row.catatan = r.catatan; row.created_at = now; row.updated_at = now; row.actor = 'guru';
        return headers.map(function (h) { return row[h] === '' ? '' : row[h]; });
      });
      var last = sh.getLastRow();
      sh.getRange(last + 1, 1, rows.length, headers.length).setValues(rows);
      inserted = rows.length;
      insertRows.forEach(function (r, i) {
        var idr = rows[i][headers.indexOf('id')];
        appendLog_('guru', 'INSERT', 'nilai', idr || r.siswa_id, null,
                   { siswa_id: r.siswa_id, kelas: kelas, jenis: jenis, kode: kode, skor: r.skor, catatan: r.catatan });
      });
    }

    /* 2) update baris lama */
    var updated = 0;
    updateRows.forEach(function (u) {
      var vals = headers.map(function (h) { return u.old[h]; });
      vals[headers.indexOf('skor')] = u.new.skor;
      vals[headers.indexOf('catatan')] = u.new.catatan;
      vals[headers.indexOf('updated_at')] = now;
      vals[headers.indexOf('actor')] = 'guru';
      sh.getRange(u.old.row, 1, 1, headers.length).setValues([vals]);
      updated++;
      appendLog_('guru', 'UPDATE', 'nilai', u.old.id || u.old.siswa_id,
                 { siswa_id: u.old.siswa_id, skor: u.old.skor, catatan: u.old.catatan || '' },
                 { siswa_id: u.old.siswa_id, skor: u.new.skor, catatan: u.new.catatan });
    });

    /* 3) hapus baris (descending agar nomor baris tidak bergeser) */
    var deleted = 0;
    deleteRows.sort(function (a, b) { return b.row - a.row; });
    deleteRows.forEach(function (d) {
      sh.deleteRow(d.row);
      deleted++;
      appendLog_('guru', 'DELETE', 'nilai', d.old.id || d.old.siswa_id,
                 { siswa_id: d.old.siswa_id, skor: d.old.skor, catatan: d.old.catatan || '' }, null);
    });

    return { inserted: inserted, updated: updated, deleted: deleted, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

/* ------------- rekap.get (API-008) ------------- */
function actionRekapGet_(p) {
  var kelas = String((p && p.kelas) || '').trim();
  if (!kelas) throwApp_('INVALID_KELAS', 'Kelas wajib dipilih.');
  if (!konfigEntry_('kelas', kelas)) throwApp_('INVALID_KELAS', 'Kelas tidak dikenal.');

  var k = readKonfig_();
  var jenisList = (k.byGroup['jenis'] || []).slice().sort(function (a, b) {
    return (a.urut || 0) - (b.urut || 0) || String(a.key).localeCompare(String(b.key));
  });
  var kodeList = (k.byGroup['kode'] || []).slice().sort(function (a, b) {
    return (a.urut || 0) - (b.urut || 0) || String(a.key).localeCompare(String(b.key));
  });
  var jenisByKey = {}; jenisList.forEach(function (e) { jenisByKey[e.key] = e; });
  var kodeByKey = {}; kodeList.forEach(function (e) { kodeByKey[e.key] = e; });

  var siswa = readSiswa_().list.filter(function (s) { return s.kelas === kelas; });
  var nilai = readNilai_(kelas);

  var colKeys = [];
  var colSeen = {};
  nilai.forEach(function (n) {
    var ck = n.jenis + '|' + n.kode;
    if (!colSeen[ck]) { colSeen[ck] = true; colKeys.push(ck); }
  });
  /* urut kolom: ikuti urutan jenis & kode dari konfig */
  colKeys.sort(function (a, b) {
    var aj = a.split('|')[0], ak = a.split('|')[1];
    var bj = b.split('|')[0], bk = b.split('|')[1];
    var d = indexOfKey_(jenisList, aj) - indexOfKey_(jenisList, bj);
    if (d !== 0) return d;
    return indexOfKey_(kodeList, ak) - indexOfKey_(kodeList, bk);
  });

  var columns = colKeys.map(function (ck) {
    var parts = ck.split('|');
    var j = jenisByKey[parts[0]], kk = kodeByKey[parts[1]];
    return {
      jenis: parts[0], jenisLabel: (j && j.label) || parts[0],
      kode: parts[1], kodeLabel: (kk && kk.label) || parts[1],
      archived: !!(j && j.aktif === false) || !!(kk && kk.aktif === false)
    };
  });

  /* baris: semua siswa aktif + siswa nonaktif yang punya nilai */
  var rows = [];
  var valueBySiswa = {};
  nilai.forEach(function (n) {
    valueBySiswa[n.siswa_id] = valueBySiswa[n.siswa_id] || {};
    valueBySiswa[n.siswa_id][n.jenis + '|' + n.kode] = n.skor;
  });
  siswa.forEach(function (s) {
    var has = valueBySiswa[s.id];
    if (s.status === 'nonaktif' && !has) return;
    rows.push({ id: s.id, nis: s.nis || '', nama: s.nama, status: s.status, cells: has || {} });
  });
  rows.sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama), 'id'); });

  var stats = columns.map(function (c) {
    var terisi = 0;
    nilai.forEach(function (n) {
      if (n.kelas !== kelas) return;
      if (n.jenis === c.jenis && n.kode === c.kode && n.skor !== '' && n.skor !== null && n.skor !== undefined) terisi++;
    });
    /* denominator = jumlah siswa aktif (target pengisian), bukan jumlah baris nilai */
    return { terisi: terisi, total: siswa.filter(function (s) { return s.status !== 'nonaktif'; }).length };
  });

  return { kelas: kelas, columns: columns, rows: rows, stats: stats, totalSiswa: siswa.length };
}

function indexOfKey_(list, key) {
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return i;
  return 9999;
}

/* ------------- konfig.list (API-009) ------------- */
function actionKonfigList_(p) {
  var group = String((p && p.group) || '').trim();
  var k = readKonfig_();
  var entries = [];
  var source = group ? [group] : KONFIG_GROUPS;
  source.forEach(function (g) {
    ((k.byGroup[g] || [])).sort(function (a, b) {
      return (a.urut || 0) - (b.urut || 0) || String(a.key).localeCompare(String(b.key));
    }).forEach(function (e) {
      entries.push({ group: g, key: e.key, label: e.label,
                     aktif: !(e.aktif === false || e.aktif === 'false'),
                     urut: e.urut || 0, parent: e.parent || '', updated_at: e.updated_at });
    });
  });
  return { entries: entries };
}

/* ------------- konfig.save (API-010) ------------- */
function actionKonfigSave_(p) {
  var entries = Array.isArray(p && p.entries) ? p.entries : [];
  if (!entries.length) return { saved: 0, skipped: [{ key: '', reason: 'EMPTY_BATCH', message: 'Tidak ada entri.' }] };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throwApp_('SHEET_BUSY', 'Spreadsheet sedang digunakan, coba lagi sebentar.');
  try {
    var sh = sheet_('konfig');
    var all = sh.getDataRange().getValues();          /* 1 RPC: header + semua baris */
    var headers = all.length ? all[0] : [];
    var data = [];
    for (var r = 1; r < all.length; r++) {
      var o = { row: r + 1 };                          /* baris fisik sheet (C-17) */
      for (var j = 0; j < headers.length; j++) o[headers[j]] = all[r][j];
      data.push(o);
    }
    var index = {};
    data.forEach(function (e) { index[e.group + '\t' + e.key] = e; });

    var skipped = [];
    var upserts = [];

    entries.forEach(function (e) {
      var group = String(e.group || '').trim();
      var key = String(e.key || '').trim();
      if (KONFIG_GROUPS.indexOf(group) === -1) { skipped.push({ key: key, reason: 'GROUP_INVALID', message: 'Group tidak dikenal.' }); return; }
      if (!key || key.length > 40) { skipped.push({ key: key, reason: 'KEY_INVALID', message: 'Key 1–40 karakter.' }); return; }
      var label = String(e.label === undefined ? key : e.label).trim();
      if (!label || label.length > 40) { skipped.push({ key: key, reason: 'LABEL_INVALID', message: 'Label 1–40 karakter.' }); return; }

      var ik = group + '\t' + key;
      var prev = index[ik];
      var urut = (prev ? prev.urut : (data.length + 1)) || 0;
      upserts.push({ group: group, key: key, label: label,
                     aktif: true, urut: urut,
                     parent: String(e.parent || (prev && prev.parent) || ''),
                     updated_at: nowIso_(), prev: prev });
    });

    /* baris baru: append sekali (1 RPC) */
    var rowsToWrite = [];
    var newUpserts = [];
    upserts.forEach(function (u) {
      if (u.prev) return;
      var idx = data.length + rowsToWrite.length + 1;
      u.urut = idx;
      var obj = { group: u.group, key: u.key, label: u.label, aktif: true,
                  urut: idx, parent: u.parent, updated_at: u.updated_at };
      rowsToWrite.push(headers.map(function (h) { return obj[h]; }));
      newUpserts.push(u);
    });
    if (rowsToWrite.length) {
      sh.getRange(all.length + 1, 1, rowsToWrite.length, headers.length).setValues(rowsToWrite);
      newUpserts.forEach(function (u) {
        appendLog_('guru', 'INSERT', 'konfig', u.group + '/' + u.key,
                   null, { group: u.group, key: u.key, label: u.label,
                           parent: u.parent, aktif: true });
      });
    }
    /* baris lama: patch dari data (prev.row), tanpa getValues ulang (C-17) */
    upserts.forEach(function (u) {
      if (!u.prev) return;
      var p = u.prev;
      var arr = headers.map(function (h) {
        if (h === 'label') return u.label;
        if (h === 'parent') return u.parent;
        if (h === 'updated_at') return u.updated_at;
        if (h === 'aktif') return true;
        return p[h] === undefined || p[h] === null ? '' : p[h];
      });
      sh.getRange(p.row, 1, 1, headers.length).setValues([arr]);
      appendLog_('guru', 'UPDATE', 'konfig', u.group + '/' + u.key, p,
                 { group: u.group, key: u.key, label: u.label, parent: u.parent, aktif: true });
    });

    invalidateKonfig_();
    return { saved: upserts.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function findKonfigRow_(group, key) {
  var sh = sheet_('konfig');
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var vals = sh.getRange(2, 1, last - 1, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === group && vals[i][1] === key) return i + 2;
  }
  return -1;
}

/* ------------- konfig.remove & konfig.deactivate (API-011 + ekstensi) ------------- */
function konfigUsage_(group, key) {
  if (group === 'kelas') return readSiswa_().list.filter(function (s) { return s.kelas === key; }).length;
  if (group === 'jenis') {
    /* jenis terpakai bila ada nilai ATAU masih memiliki kode turunan */
    var nilaiCount = readNilai_(null).filter(function (n) { return n.jenis === key; }).length;
    if (nilaiCount > 0) return nilaiCount;
    var k = readKonfig_();
    return ((k.byGroup['kode'] || []).filter(function (e) { return e.parent === key; })).length;
  }
  if (group === 'kode') return readNilai_(null).filter(function (n) { return n.kode === key; }).length;
  return 0;
}

function actionKonfigRemove_(p) {
  var group = String((p && p.group) || '').trim();
  var key = String((p && p.key) || '').trim();
  var prev = konfigEntry_(group, key);
  if (!prev) throwApp_('NOT_FOUND', 'Entri tidak ditemukan.');

  /* BR-004: entri terpakai tak bisa dihapus → hanya dinonaktifkan */
  var usage = konfigUsage_(group, key);
  if (usage > 0) {
    throwApp_('CONFIG_IN_USE', '"' + key + '" sudah dipakai ' + usage + ' data.',
      { details: String(usage) });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throwApp_('SHEET_BUSY', 'Spreadsheet sedang digunakan, coba lagi sebentar.');
  try {
    var rowIdx = findKonfigRow_(group, key);
    if (rowIdx < 0) throwApp_('NOT_FOUND', 'Entri tidak ditemukan.');
    sheet_('konfig').deleteRow(rowIdx);
    appendLog_('guru', 'DELETE', 'konfig', group + '/' + key, prev, null);
    invalidateKonfig_();
    return { removed: true };
  } finally { lock.releaseLock(); }
}

function actionKonfigDeactivate_(p) {
  var group = String((p && p.group) || '').trim();
  var key = String((p && p.key) || '').trim();
  var rowIdx = findKonfigRow_(group, key);
  if (rowIdx < 0) throwApp_('NOT_FOUND', 'Entri tidak ditemukan.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throwApp_('SHEET_BUSY', 'Spreadsheet sedang digunakan, coba lagi sebentar.');
  try {
    var sh = sheet_('konfig');
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var vals = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
    var before = readSheetObjects_('konfig').filter(function (e) { return e.group === group && e.key === key; })[0];
    vals[headers.indexOf('aktif')] = false;
    vals[headers.indexOf('updated_at')] = nowIso_();
    sh.getRange(rowIdx, 1, 1, headers.length).setValues([vals]);
    appendLog_('guru', 'DEACTIVATE', 'konfig', group + '/' + key, before,
               { group: group, key: key, aktif: false });
    invalidateKonfig_();
    return { deactivated: true };
  } finally { lock.releaseLock(); }
}

/* ------------- log.list (API-012) ------------- */
function actionLogList_(p) {
  var limit = Math.min(parseInt((p && p.limit) || 200, 10) || 200, 200);
  var sh = sheet_('log');
  var last = sh.getLastRow();
  if (last < 2) return { entries: [] };
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var from = Math.max(2, last - limit + 1);
  var vals = sh.getRange(from, 1, last - from + 1, headers.length).getValues();
  var out = [];
  for (var i = vals.length - 1; i >= 0; i--) {
    var o = {};
    headers.forEach(function (h, j) { o[h] = vals[i][j]; });
    out.push({ ts: o.ts, actor: o.actor, action: o.action, entity: o.entity,
               entity_id: o.entity_id, before: o.before || '', after: o.after || '',
               request_id: o.request_id || '' });
  }
  return { entries: out };
}

/* ------------- settings.changePin (API-013) ------------- */
function actionChangePin_(p, sess) {
  var oldHash = String((p && p.oldPin) || '').trim().toLowerCase();
  var newHash = String((p && p.newPin) || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(oldHash) || !/^[0-9a-f]{64}$/.test(newHash)) {
    throwApp_('INVALID_ROW', 'Parameter PIN tidak valid.');
  }
  var neo = sha256Hex_(newHash);
  if (neo === sha256Hex_(oldHash)) throwApp_('WEAK_PIN', 'PIN baru tidak boleh sama dengan PIN lama.');

  var stored = props_().getProperty('PIN_HASH');
  if (!stored) throwApp_('PIN_NOT_CONFIGURED', 'PIN belum diatur.');
  if (sha256Hex_(oldHash) !== stored) throwApp_('INVALID_OLD_PIN', 'PIN lama salah.');

  props_().setProperty('PIN_HASH', neo);
  appendLog_(sess.actor, 'PIN_CHANGE', 'auth', sess.actor, null, { changed: true });
  return { changed: true };
}

/* ----------------------------------------------------------------------------
 * Utilitas setup (dipanggil manual dari script editor — lihat docs/deployment.md)
 * ------------------------------------------------------------------------- */

/** Pascuberes: hitung PIN_HASH untuk disalin ke Script Properties. */
function SETUP_pinHash(pinPlain) {
  var once = sha256Hex_(String(pinPlain).trim());
  var twice = sha256Hex_(once);
  Logger.log('PIN_HASH = ' + twice);
  Logger.log('(simpan nilai ini sebagai Script Property "PIN_HASH". Jangan simpan PIN asli.)');
  return twice;
}

/** Optional: set PIN_HASH langsung dari script editor pemilik. */
function SETUP_setPin(pinPlain) {
  var val = SETUP_pinHash(pinPlain);
  PropertiesService.getScriptProperties().setProperty('PIN_HASH', val);
  Logger.log('PIN_HASH tersimpan.');
}

/** Cek kesehatan skema (membuat ulang sheet bila hilang). */
function SETUP_ensureSchema() {
  ensureSchema_();
  Logger.log('Schema OK. Warnings: ' + JSON.stringify(CTX.warnings));
}