/* ============================================================
 * backend/engine.js — logika backend (port apps-script/Code.gs)
 * yang berjalan di browser dengan SQLite (libSQL/Turso).
 *
 * Kontrak API dijaga identik: registry aksi + envelope
 * {ok,data,error,requestId}. Dengan begitu halaman (entry/rekap/
 * siswa/pengaturan) tidak perlu berubah selain transport.
 *
 * Semua akses data lewat antarmuka `db` (lihat turso/client.js):
 *   all(sql,args), run(sql,args), batch(statements), exec(sqlList)
 * ============================================================ */
window.App = window.App || {};

App.backend = (function () {
  "use strict";

  var PUBLIC_ACTIONS = ["ping", "auth.verify"];
  var KONFIG_GROUPS = ["kelas", "jenis", "kode", "app"];
  var SISWA_STATUS = ["aktif", "nonaktif"];
  var KONFIG_TTL_MS = 10 * 1000;

  var RATE_CONF = {
    "auth.verify":        { key: "AUTH", scope: "global",  n: 5,  win: 900 },
    "settings.changePin": { scope: "session",              n: 5,  win: 900 },
    "write":              { scope: "session",              n: 30, win: 60 },
    "read":               { scope: "session",              n: 60, win: 60 },
    "rekap":              { scope: "session",              n: 30, win: 60 },
    "log":                { scope: "session",              n: 60, win: 60 }
  };

  function AppError(code, message, opt) {
    this._app = true;
    this.code = code;
    this.message = message || code;
    this.retryIn = opt && opt.retryIn;
    this.details = opt && opt.details;
  }
  function throwApp(code, message, opt) { throw new AppError(code, message, opt); }

  function create(db, deps) {
    deps = deps || {};
    var sha256 = deps.sha256;
    var uuid = deps.uuid || defaultUuid;
    var batchSize = (window.App && App.config && App.config.BATCH_SIZE) || 200;
    var tokenTtlMs = ((window.App && App.config && App.config.TOKEN_TTL_HOURS) || 6) * 3600 * 1000;

    var CTX = null;
    var konfigCache = { at: 0, val: null };
    var sessCache = {};
    var rl = {};
    var schemaReady = null;

    var ACTIONS = {};
    function register(name, bucket, fn) { ACTIONS[name] = { bucket: bucket, fn: fn }; }

    /* ---------------- util ---------------- */
    function defaultUuid() {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
      var b = new Uint8Array(16);
      (crypto || window.crypto).getRandomValues(b);
      return Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    }
    function randId(prefix) { return prefix + "-" + uuid().slice(0, 8).toUpperCase(); }
    function nowIso() { return new Date().toISOString(); }
    function hashHex(str) { return Promise.resolve(sha256(String(str))); }

    async function getMeta(key) {
      var rows = await db.all("SELECT v FROM meta WHERE k = ?", [key]);
      return rows.length ? rows[0].v : null;
    }
    async function setMeta(key, val) {
      await db.run(
        "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
        [key, String(val)]
      );
    }

    async function ensureReady() {
      if (!schemaReady) schemaReady = App.schema.ensure(db);
      return schemaReady;
    }

    /* ---------------- auth ---------------- */
    async function issueToken(actor) {
      var token = uuid();
      var exp = Date.now() + tokenTtlMs;
      await db.run("INSERT INTO session (token, actor, exp) VALUES (?, ?, ?)", [token, actor, exp]);
      sessCache[token] = { actor: actor, exp: exp };
      return { token: token, expiresAt: exp };
    }

    async function requireAuth(token) {
      if (!token) throwApp("INVALID_TOKEN", "Sesi berakhir, silakan verifikasi PIN kembali.");
      var c = sessCache[token];
      if (c && c.exp >= Date.now()) return { actor: c.actor, token: token };
      var rows = await db.all("SELECT actor, exp FROM session WHERE token = ?", [token]);
      if (!rows.length) throwApp("INVALID_TOKEN", "Sesi berakhir, silakan verifikasi PIN kembali.");
      var rec = rows[0];
      if (!rec.actor || rec.exp < Date.now()) {
        await db.run("DELETE FROM session WHERE token = ?", [token]);
        throwApp("INVALID_TOKEN", "Sesi berakhir, silakan verifikasi PIN kembali.");
      }
      sessCache[token] = { actor: rec.actor, exp: rec.exp };
      return { actor: rec.actor, token: token };
    }

    function rateLimit(bucket, action, session) {
      var conf = RATE_CONF[bucket];
      if (!conf) return;
      var key;
      if (conf.scope === "global") key = "RL:" + conf.key;
      else if (session && session.token) key = "RLU:" + session.token.slice(0, 16) + ":" + bucket;
      else key = "RLI:" + action;
      var now = Date.now();
      var rec = rl[key];
      if (!rec || (now - rec.t0) >= conf.win * 1000) rec = { t0: now, n: 0 };
      rec.n += 1;
      rl[key] = rec;
      if (rec.n > conf.n) {
        var retryIn = Math.max(1, Math.ceil((rec.t0 + conf.win * 1000 - now) / 1000));
        throwApp("RATE_LIMITED", "Terlalu banyak permintaan. Coba lagi dalam " + Math.ceil(retryIn / 60) + " menit.", { retryIn: retryIn });
      }
    }

    /* ---------------- repo ---------------- */
    async function readSiswa() {
      var rows = await db.all("SELECT id, nis, nama, kelas, status, created_at, updated_at FROM siswa");
      var byId = {}, byNis = {}, byKelas = {};
      rows.forEach(function (o) {
        byId[o.id] = o;
        var nis = String(o.nis || "").trim().toLowerCase();
        if (nis) byNis[nis] = o;
        if (o.kelas) (byKelas[o.kelas] = byKelas[o.kelas] || []).push(o);
      });
      return { list: rows, byId: byId, byNis: byNis, byKelas: byKelas };
    }

    async function readNilai(kelas, jenis, kode) {
      var sql = "SELECT id, siswa_id, kelas, jenis, kode, mapel, skor, catatan, created_at, updated_at, actor FROM nilai";
      var where = [], args = [];
      if (kelas) { where.push("kelas = ?"); args.push(kelas); }
      if (jenis) { where.push("jenis = ?"); args.push(jenis); }
      if (kode) { where.push("kode = ?"); args.push(kode); }
      if (where.length) sql += " WHERE " + where.join(" AND ");
      return db.all(sql, args);
    }

    async function readKonfig(force) {
      var now = Date.now();
      if (!force && konfigCache.val && (now - konfigCache.at) < KONFIG_TTL_MS) return konfigCache.val;
      var rows = await db.all('SELECT grp AS "group", k AS key, label, aktif, urut, parent, updated_at FROM konfig');
      var byGroup = {};
      rows.forEach(function (e) {
        e.aktif = !!e.aktif;
        e.urut = Number(e.urut) || 0;
        e.parent = e.parent || "";
        (byGroup[e.group] = byGroup[e.group] || []).push(e);
      });
      var out = { list: rows, byGroup: byGroup };
      konfigCache = { at: now, val: out };
      return out;
    }
    function invalidateKonfig() { konfigCache = { at: 0, val: null }; }

    async function konfigEntry(group, key) {
      var k = await readKonfig();
      var list = k.byGroup[group] || [];
      for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
      return null;
    }

    /* ---------------- audit ---------------- */
    function appendLog(actor, action, entity, entityId, before, after) {
      if (!CTX || !CTX.logQueue) return;
      CTX.logQueue.push([nowIso(), actor || "unknown", action, entity, entityId,
        clip(before), clip(after), CTX.requestId]);
    }
    function clip(v) {
      if (v === null || v === undefined) return "";
      var s = typeof v === "string" ? v : JSON.stringify(v);
      return s.length > 5000 ? s.slice(0, 5000) : s;
    }
    async function flushLogs() {
      var q = CTX && CTX.logQueue;
      if (!q || !q.length) return;
      var rows = q.slice();
      CTX.logQueue.length = 0;
      try {
        var values = [], args = [];
        rows.forEach(function (r) {
          values.push("(?,?,?,?,?,?,?,?)");
          for (var i = 0; i < r.length; i++) args.push(r[i]);
        });
        await db.run("INSERT INTO log (ts, actor, action, entity, entity_id, before, after, request_id) VALUES " + values.join(","), args);
      } catch (e) {
        CTX.warnings.push("LOG_WRITE_FAILED");
      }
    }

    function pick(rec, field, row, fallback) {
      if (rec[field] === undefined) {
        var rv = row && row[field];
        return (rv === undefined || rv === null) ? fallback : rv;
      }
      var v = rec[field];
      return v === null ? "" : v;
    }

    /* ---------------- handlers ---------------- */
    async function actionPing() {
      var pin = await getMeta("PIN_HASH");
      return { version: App.config.VERSION, sheetOk: true, pinConfigured: !!pin };
    }

    async function actionVerify(p) {
      var hash = String((p && p.pin) || "").trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(hash)) throwApp("INVALID_PIN", "PIN tidak valid.");
      var stored = await getMeta("PIN_HASH");
      if (!stored) throwApp("PIN_NOT_CONFIGURED", "PIN belum diatur. Buat PIN terlebih dahulu.");
      if ((await hashHex(hash)) !== stored) {
        appendLog("unknown", "LOGIN_FAIL", "auth", "auth.verify", null, { ok: false });
        throwApp("INVALID_PIN", "PIN salah.", { retryIn: 60 });
      }
      delete rl["RL:AUTH"];
      var tok = await issueToken("guru");
      appendLog("guru", "LOGIN_OK", "auth", "guru", null, { issued: true });
      return tok;
    }

    async function actionLogout(p, sess) {
      if (p && p.token) { try { await db.run("DELETE FROM session WHERE token = ?", [p.token]); } catch (e) {} delete sessCache[p.token]; }
      appendLog(sess.actor, "LOGOUT", "auth", sess.actor, null, null);
      return { done: true };
    }

    async function actionMetaGet() {
      var k = await readKonfig();
      function pickGroup(group) {
        return (k.byGroup[group] || []).slice().sort(function (a, b) {
          return (a.urut || 0) - (b.urut || 0) || String(a.key).localeCompare(String(b.key));
        }).map(function (e) {
          return { group: group, key: e.key, label: e.label, aktif: !(e.aktif === false), parent: e.parent || "" };
        });
      }
      return {
        kelas: pickGroup("kelas"), jenis: pickGroup("jenis"), kode: pickGroup("kode"),
        app: { name: "Entry Nilai", version: App.config.VERSION }
      };
    }

    async function actionSiswaList(p) {
      var k = await readSiswa();
      var kelas = (p && p.kelas) || "";
      var status = (p && p.status) || "";
      if (kelas && !(await konfigEntry("kelas", kelas))) throwApp("INVALID_KELAS", "Kelas tidak dikenal.");
      var out = k.list.filter(function (s) {
        if (kelas && s.kelas !== kelas) return false;
        if (status && s.status !== status) return false;
        return true;
      }).map(function (s) {
        return { id: s.id, nis: s.nis || "", nama: s.nama, kelas: s.kelas,
          status: s.status || "aktif", created_at: s.created_at, updated_at: s.updated_at };
      });
      return { siswa: out };
    }

    async function actionSiswaSave(p) {
      var records = Array.isArray(p && p.records) ? p.records : [];
      if (!records.length) return { saved: 0, skipped: [{ nis: "", reason: "EMPTY_BATCH", message: "Tidak ada record." }] };
      if (records.length > batchSize) throwApp("BAD_REQUEST", "Maksimum " + batchSize + " record per request.");

      var repo = await readSiswa();
      var konfig = await readKonfig();
      var validKelas = {};
      (konfig.byGroup["kelas"] || []).forEach(function (e) { validKelas[e.key] = e; });

      var skipped = [], statements = [], logs = [];
      var seenNis = {}, usedIds = {};

      records.forEach(function (rec) {
        var id = String(rec.id || "").trim();
        var isNew = !id;
        var row = isNew ? null : repo.byId[id];
        if (!isNew && !row) { skipped.push({ id: id, reason: "NOT_FOUND", message: "Siswa tidak ditemukan." }); return; }

        var nama = String(pick(rec, "nama", row, "")).trim();
        var kelas = String(pick(rec, "kelas", row, "")).trim();
        var status = String(pick(rec, "status", row, "aktif")).trim();
        var nis = String(pick(rec, "nis", row, "")).trim();

        if (nama.length < 2 || nama.length > 80 || /[\u0000-\u001f]/.test(nama)) {
          skipped.push({ id: isNew ? "" : id, nama: nama, reason: "NAMA_INVALID", message: "Nama harus 2–80 karakter." }); return;
        }
        if (isNew || rec.kelas !== undefined) {
          if (!kelas) { skipped.push({ id: isNew ? "" : id, nama: nama, reason: "KELAS_INVALID", message: "Kelas wajib diisi." }); return; }
          if (!validKelas[kelas]) { skipped.push({ id: isNew ? "" : id, nama: nama, reason: "KELAS_INVALID", message: "Kelas tidak dikenal." }); return; }
        }
        if (SISWA_STATUS.indexOf(status) === -1) {
          skipped.push({ id: isNew ? "" : id, nama: nama, reason: "STATUS_INVALID", message: "Status tidak valid." }); return;
        }
        if (nis && nis.length > 32) {
          skipped.push({ id: isNew ? "" : id, nama: nama, reason: "NIS_INVALID", message: "NIS terlalu panjang." }); return;
        }

        var nisKey = nis.toLowerCase();
        if (nisKey) {
          var owner = repo.byNis[nisKey];
          if (owner && owner.id !== id) {
            skipped.push({ id: isNew ? "" : id, nis: nis, reason: "DUPLICATE_NIS", message: 'NIS "' + nis + '" sudah dipakai ' + (owner.nama || "siswa lain") + "." }); return;
          }
          if (seenNis[nisKey]) { skipped.push({ id: isNew ? "" : id, nis: nis, reason: "DUPLICATE_NIS", message: "NIS duplikat dalam satu batch." }); return; }
          seenNis[nisKey] = true;
        }

        if (isNew) {
          var id2 = randId("S");
          while (repo.byId[id2] || usedIds[id2]) id2 = randId("S");
          usedIds[id2] = true;
          var now = nowIso();
          statements.push({ sql: "INSERT INTO siswa (id, nis, nama, kelas, status, created_at, updated_at, created_by, updated_by) VALUES (?,?,?,?,?,?,?,?,?)",
            args: [id2, nis, nama, kelas, status, now, now, "guru", "guru"] });
          repo.byId[id2] = { id: id2, nis: nis, nama: nama, kelas: kelas, status: status };
          if (nisKey) repo.byNis[nisKey] = repo.byId[id2];
          logs.push({ action: "INSERT", id: id2, before: null, after: snapSiswa(id2, nis, nama, kelas, status, now, now) });
        } else {
          if (row.nama === nama && row.kelas === kelas && row.status === status && String(row.nis || "") === String(nis || "")) return;
          var updatedAt = nowIso();
          statements.push({ sql: "UPDATE siswa SET nis = ?, nama = ?, kelas = ?, status = ?, updated_at = ?, updated_by = ? WHERE id = ?",
            args: [nis, nama, kelas, status, updatedAt, "guru", id] });
          var prevNis = String(row.nis || "").toLowerCase();
          if (prevNis && prevNis !== nisKey) delete repo.byNis[prevNis];
          if (nisKey) repo.byNis[nisKey] = row;
          logs.push({ action: "UPDATE", id: id, before: snapSiswa(row.id, row.nis, row.nama, row.kelas, row.status, row.created_at, row.updated_at),
            after: snapSiswa(id, nis, nama, kelas, status, row.created_at, updatedAt) });
        }
      });

      await db.batch(statements);
      logs.forEach(function (l) { appendLog("guru", l.action, "siswa", l.id, l.before, l.after); });

      var inserted = logs.filter(function (l) { return l.action === "INSERT"; }).length;
      var updated = logs.filter(function (l) { return l.action === "UPDATE"; }).length;
      return { saved: inserted + updated, inserted: inserted, updated: updated, skipped: skipped };
    }

    function snapSiswa(id, nis, nama, kelas, status, createdAt, updatedAt) {
      return { id: id, nis: nis || "", nama: nama, kelas: kelas, status: status || "aktif",
        created_at: createdAt, updated_at: updatedAt };
    }

    async function actionNilaiList(p) {
      var kelas = String((p && p.kelas) || "").trim();
      var jenis = String((p && p.jenis) || "").trim();
      var kode = String((p && p.kode) || "").trim();
      if (!kelas) throwApp("INVALID_FILTER", "Filter kelas wajib diisi.");
      if (!(await konfigEntry("kelas", kelas))) throwApp("INVALID_KELAS", "Kelas tidak dikenal.");
      var list = await readNilai(kelas, jenis || null, kode || null);
      return { nilai: list.map(function (n) {
        return { id: n.id, siswa_id: n.siswa_id, kelas: n.kelas, jenis: n.jenis, kode: n.kode,
          mapel: n.mapel || "", skor: n.skor, catatan: n.catatan || "", updated_at: n.updated_at };
      }) };
    }

    async function actionNilaiBulkSave(p) {
      var kelas = String((p && p.kelas) || "").trim();
      var jenis = String((p && p.jenis) || "").trim();
      var kode = String((p && p.kode) || "").trim();
      if (!kelas || !jenis || !kode) throwApp("INVALID_FILTER", "kelas, jenis, kode wajib dikirim (konteks tabel).");
      var records = Array.isArray(p && p.records) ? p.records : [];
      if (!records.length) return { inserted: 0, updated: 0, deleted: 0, skipped: [] };
      if (records.length > batchSize) throwApp("BAD_REQUEST", "Maksimum " + batchSize + " record per request.");
      if (!(await konfigEntry("kelas", kelas))) throwApp("INVALID_KELAS", "Kelas tidak dikenal.");

      var repo = await readSiswa();
      var nilai = await readNilai(kelas, jenis, kode);
      var jenisCfg = await konfigEntry("jenis", jenis);
      var kodeCfg = await konfigEntry("kode", kode);
      if (!jenisCfg || jenisCfg.aktif === false) throwApp("INVALID_FILTER", "Jenis penilaian nonaktif. Bawa ke Pengaturan untuk mengaktifkannya.");
      if (!kodeCfg || kodeCfg.aktif === false) throwApp("INVALID_FILTER", "Kode penilaian nonaktif.");

      var bySiswa = {};
      nilai.forEach(function (n) { if (!bySiswa[n.siswa_id]) bySiswa[n.siswa_id] = n; });

      var skipped = [], insertRows = [], updateRows = [], deleteRows = [];
      var lastIdx = {};
      records.forEach(function (rec, i) {
        var sidx = rec && String(rec.siswa_id || "").trim();
        if (sidx) lastIdx[sidx] = i;
      });

      records.forEach(function (rec, i) {
        var sid = rec && String(rec.siswa_id || "").trim();
        if (!sid) { skipped.push({ siswa_id: sid, reason: "INVALID_ROW", message: "siswa_id wajib." }); return; }
        if (lastIdx[sid] !== i) { skipped.push({ siswa_id: sid, reason: "DUPLICATE_IN_BATCH", message: "Record duplikat dalam batch (yang terakhir berlaku)." }); return; }

        var sw = repo.byId[sid];
        if (!sw) { skipped.push({ siswa_id: sid, reason: "SISWA_NOT_FOUND", message: "Siswa tidak ditemukan." }); return; }
        if (sw.status === "nonaktif") { skipped.push({ siswa_id: sid, reason: "SISWA_INACTIVE", message: "Siswa dinonaktifkan." }); return; }
        if (sw.kelas !== kelas) { skipped.push({ siswa_id: sid, reason: "KELAS_MISMATCH", message: "Siswa bukan anggota kelas ini." }); return; }

        var catatan = (rec.catatan === undefined ? "" : rec.catatan);
        catatan = catatan === null ? "" : String(catatan);
        if (catatan.length > 200) { skipped.push({ siswa_id: sid, reason: "CATATAN_TOO_LONG", message: "Catatan maksimal 200 karakter." }); return; }

        var nilaiV = rec.nilai;
        var isDelete = nilaiV === null || nilaiV === undefined || nilaiV === "" || (typeof nilaiV === "number" && isNaN(nilaiV));
        if (isDelete) {
          var old = bySiswa[sid];
          if (old) { deleteRows.push(old); delete bySiswa[sid]; }
          return;
        }

        var skor = Number(nilaiV);
        if (!isFinite(skor) || skor < 0 || skor > 100) {
          skipped.push({ siswa_id: sid, reason: "INVALID_SCORE", message: "Nilai harus 0–100." }); return;
        }
        if (typeof nilaiV === "number" && Math.abs(skor * 10 - Math.round(skor * 10)) > 1e-9) {
          skipped.push({ siswa_id: sid, reason: "INVALID_SCORE", message: "Nilai maksimal satu desimal." }); return;
        }
        skor = Math.round(skor * 10) / 10;

        var prev = bySiswa[sid];
        if (prev) {
          if (Number(prev.skor) === skor && String(prev.catatan || "") === catatan) return;
          updateRows.push({ old: prev, skor: skor, catatan: catatan });
        } else {
          insertRows.push({ siswa_id: sid, skor: skor, catatan: catatan });
        }
      });

      var now = nowIso();
      var statements = [];
      insertRows.forEach(function (r) {
        var idr = randId("N");
        statements.push({ sql: "INSERT INTO nilai (id, siswa_id, kelas, jenis, kode, mapel, skor, catatan, created_at, updated_at, actor) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          args: [idr, r.siswa_id, kelas, jenis, kode, "-", r.skor, r.catatan, now, now, "guru"] });
        appendLog("guru", "INSERT", "nilai", idr, null, { siswa_id: r.siswa_id, kelas: kelas, jenis: jenis, kode: kode, skor: r.skor, catatan: r.catatan });
      });
      updateRows.forEach(function (u) {
        statements.push({ sql: "UPDATE nilai SET skor = ?, catatan = ?, updated_at = ?, actor = ? WHERE id = ?",
          args: [u.skor, u.catatan, now, "guru", u.old.id] });
        appendLog("guru", "UPDATE", "nilai", u.old.id || u.old.siswa_id, { siswa_id: u.old.siswa_id, skor: u.old.skor, catatan: u.old.catatan || "" },
          { siswa_id: u.old.siswa_id, skor: u.skor, catatan: u.catatan });
      });
      deleteRows.forEach(function (d) {
        statements.push({ sql: "DELETE FROM nilai WHERE id = ?", args: [d.id] });
        appendLog("guru", "DELETE", "nilai", d.id || d.siswa_id, { siswa_id: d.siswa_id, skor: d.skor, catatan: d.catatan || "" }, null);
      });

      await db.batch(statements);
      return { inserted: insertRows.length, updated: updateRows.length, deleted: deleteRows.length, skipped: skipped };
    }

    async function actionRekapGet(p) {
      var kelas = String((p && p.kelas) || "").trim();
      if (!kelas) throwApp("INVALID_KELAS", "Kelas wajib dipilih.");
      if (!(await konfigEntry("kelas", kelas))) throwApp("INVALID_KELAS", "Kelas tidak dikenal.");

      var k = await readKonfig();
      var byUrut = function (a, b) { return (a.urut || 0) - (b.urut || 0) || String(a.key).localeCompare(String(b.key)); };
      var jenisList = (k.byGroup["jenis"] || []).slice().sort(byUrut);
      var kodeList = (k.byGroup["kode"] || []).slice().sort(byUrut);
      var jenisByKey = {}, kodeByKey = {};
      jenisList.forEach(function (e) { jenisByKey[e.key] = e; });
      kodeList.forEach(function (e) { kodeByKey[e.key] = e; });

      var allSiswa = (await readSiswa()).list;
      var siswa = allSiswa.filter(function (s) { return s.kelas === kelas; });
      var nilai = await readNilai(kelas);

      var colKeys = [], colSeen = {};
      nilai.forEach(function (n) {
        var ck = n.jenis + "|" + n.kode;
        if (!colSeen[ck]) { colSeen[ck] = true; colKeys.push(ck); }
      });
      var idx = function (list, key) { for (var i = 0; i < list.length; i++) if (list[i].key === key) return i; return 9999; };
      colKeys.sort(function (a, b) {
        var aj = a.split("|")[0], ak = a.split("|")[1];
        var bj = b.split("|")[0], bk = b.split("|")[1];
        var d = idx(jenisList, aj) - idx(jenisList, bj);
        return d !== 0 ? d : idx(kodeList, ak) - idx(kodeList, bk);
      });

      var columns = colKeys.map(function (ck) {
        var parts = ck.split("|");
        var j = jenisByKey[parts[0]], kk = kodeByKey[parts[1]];
        return { jenis: parts[0], jenisLabel: (j && j.label) || parts[0],
          kode: parts[1], kodeLabel: (kk && kk.label) || parts[1],
          archived: !!(j && j.aktif === false) || !!(kk && kk.aktif === false) };
      });

      var valueBySiswa = {};
      nilai.forEach(function (n) {
        (valueBySiswa[n.siswa_id] = valueBySiswa[n.siswa_id] || {})[n.jenis + "|" + n.kode] = n.skor;
      });
      var rows = [];
      siswa.forEach(function (s) {
        var has = valueBySiswa[s.id];
        if (s.status === "nonaktif" && !has) return;
        rows.push({ id: s.id, nis: s.nis || "", nama: s.nama, status: s.status, cells: has || {} });
      });
      rows.sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama), "id"); });

      var aktifCount = siswa.filter(function (s) { return s.status !== "nonaktif"; }).length;
      var stats = columns.map(function (c) {
        var terisi = 0;
        nilai.forEach(function (n) {
          if (n.jenis === c.jenis && n.kode === c.kode && n.skor !== "" && n.skor !== null && n.skor !== undefined) terisi++;
        });
        return { terisi: terisi, total: aktifCount };
      });

      return { kelas: kelas, columns: columns, rows: rows, stats: stats, totalSiswa: siswa.length };
    }

    async function actionKonfigList(p) {
      var group = String((p && p.group) || "").trim();
      var k = await readKonfig();
      var entries = [];
      (group ? [group] : KONFIG_GROUPS).forEach(function (g) {
        (k.byGroup[g] || []).slice().sort(function (a, b) {
          return (a.urut || 0) - (b.urut || 0) || String(a.key).localeCompare(String(b.key));
        }).forEach(function (e) {
          entries.push({ group: g, key: e.key, label: e.label, aktif: !(e.aktif === false), urut: e.urut || 0, parent: e.parent || "", updated_at: e.updated_at });
        });
      });
      return { entries: entries };
    }

    async function actionKonfigSave(p) {
      var entries = Array.isArray(p && p.entries) ? p.entries : [];
      if (!entries.length) return { saved: 0, skipped: [{ key: "", reason: "EMPTY_BATCH", message: "Tidak ada entri." }] };

      var k = await readKonfig(true);
      var data = k.list;
      var index = {};
      data.forEach(function (e) { index[e.group + "\t" + e.key] = e; });

      var skipped = [], statements = [];
      entries.forEach(function (e) {
        var group = String(e.group || "").trim();
        var key = String(e.key || "").trim();
        if (KONFIG_GROUPS.indexOf(group) === -1) { skipped.push({ key: key, reason: "GROUP_INVALID", message: "Group tidak dikenal." }); return; }
        if (!key || key.length > 40) { skipped.push({ key: key, reason: "KEY_INVALID", message: "Key 1–40 karakter." }); return; }
        var label = String(e.label === undefined ? key : e.label).trim();
        if (!label || label.length > 40) { skipped.push({ key: key, reason: "LABEL_INVALID", message: "Label 1–40 karakter." }); return; }

        var prev = index[group + "\t" + key];
        var updatedAt = nowIso();
        var parent = String(e.parent || (prev && prev.parent) || "");
        if (prev) {
          statements.push({ sql: "UPDATE konfig SET label = ?, parent = ?, aktif = 1, updated_at = ? WHERE grp = ? AND k = ?",
            args: [label, parent, updatedAt, group, key] });
          appendLog("guru", "UPDATE", "konfig", group + "/" + key, prev, { group: group, key: key, label: label, parent: parent, aktif: true });
        } else {
          var urut = data.length + statements.length + 1;
          statements.push({ sql: "INSERT INTO konfig (grp, k, label, aktif, urut, parent, updated_at) VALUES (?,?,?,?,?,?,?)",
            args: [group, key, label, 1, urut, parent, updatedAt] });
          appendLog("guru", "INSERT", "konfig", group + "/" + key, null, { group: group, key: key, label: label, parent: parent, aktif: true });
        }
      });

      await db.batch(statements);
      invalidateKonfig();
      return { saved: statements.length, skipped: skipped };
    }

    async function konfigUsage(group, key) {
      if (group === "kelas") return countOf("SELECT COUNT(*) AS n FROM siswa WHERE kelas = ?", [key]);
      if (group === "jenis") {
        var n = await countOf("SELECT COUNT(*) AS n FROM nilai WHERE jenis = ?", [key]);
        if (n > 0) return n;
        return countOf("SELECT COUNT(*) AS n FROM konfig WHERE grp = 'kode' AND parent = ?", [key]);
      }
      if (group === "kode") return countOf("SELECT COUNT(*) AS n FROM nilai WHERE kode = ?", [key]);
      return 0;
    }
    async function countOf(sql, args) {
      var rows = await db.all(sql, args);
      return rows.length ? Number(rows[0].n) : 0;
    }

    async function actionKonfigRemove(p) {
      var group = String((p && p.group) || "").trim();
      var key = String((p && p.key) || "").trim();
      var prev = await konfigEntry(group, key);
      if (!prev) throwApp("NOT_FOUND", "Entri tidak ditemukan.");
      var usage = await konfigUsage(group, key);
      if (usage > 0) throwApp("CONFIG_IN_USE", '"' + key + '" sudah dipakai ' + usage + " data.", { details: String(usage) });
      await db.run("DELETE FROM konfig WHERE grp = ? AND k = ?", [group, key]);
      appendLog("guru", "DELETE", "konfig", group + "/" + key, prev, null);
      invalidateKonfig();
      return { removed: true };
    }

    async function actionKonfigDeactivate(p) {
      var group = String((p && p.group) || "").trim();
      var key = String((p && p.key) || "").trim();
      var prev = await konfigEntry(group, key);
      if (!prev) throwApp("NOT_FOUND", "Entri tidak ditemukan.");
      await db.run("UPDATE konfig SET aktif = 0, updated_at = ? WHERE grp = ? AND k = ?", [nowIso(), group, key]);
      appendLog("guru", "DEACTIVATE", "konfig", group + "/" + key, prev, { group: group, key: key, aktif: false });
      invalidateKonfig();
      return { deactivated: true };
    }

    async function actionLogList(p) {
      var limit = Math.min(parseInt((p && p.limit) || 200, 10) || 200, 200);
      if (limit < 1) limit = 1;
      var offset = Math.max(parseInt((p && p.offset) || 0, 10) || 0, 0);
      var totalRows = await db.all("SELECT COUNT(*) AS n FROM log", []);
      var total = totalRows && totalRows[0] ? Number(totalRows[0].n) || 0 : 0;
      var rows = await db.all("SELECT ts, actor, action, entity, entity_id, before, after, request_id FROM log ORDER BY id DESC LIMIT ? OFFSET ?", [limit, offset]);
      var entries = rows.map(function (o) {
        return { ts: o.ts, actor: o.actor, action: o.action, entity: o.entity, entity_id: o.entity_id,
          before: o.before || "", after: o.after || "", request_id: o.request_id || "" };
      });
      return { entries: entries, total: total, limit: limit, offset: offset };
    }

    async function actionChangePin(p, sess) {
      var oldHash = String((p && p.oldPin) || "").trim().toLowerCase();
      var newHash = String((p && p.newPin) || "").trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(oldHash) || !/^[0-9a-f]{64}$/.test(newHash)) throwApp("INVALID_ROW", "Parameter PIN tidak valid.");
      var neo = await hashHex(newHash);
      if (neo === (await hashHex(oldHash))) throwApp("WEAK_PIN", "PIN baru tidak boleh sama dengan PIN lama.");
      var stored = await getMeta("PIN_HASH");
      if (!stored) throwApp("PIN_NOT_CONFIGURED", "PIN belum diatur.");
      if ((await hashHex(oldHash)) !== stored) throwApp("INVALID_OLD_PIN", "PIN lama salah.");
      await setMeta("PIN_HASH", neo);
      appendLog(sess.actor, "PIN_CHANGE", "auth", sess.actor, null, { changed: true });
      return { changed: true };
    }

    /* ---------------- registrasi aksi ---------------- */
    register("ping", "read", actionPing);
    register("auth.verify", "auth.verify", actionVerify);
    register("auth.logout", "read", actionLogout);
    register("meta.get", "read", actionMetaGet);
    register("siswa.list", "read", actionSiswaList);
    register("siswa.save", "write", actionSiswaSave);
    register("nilai.list", "read", actionNilaiList);
    register("nilai.bulkSave", "write", actionNilaiBulkSave);
    register("rekap.get", "rekap", actionRekapGet);
    register("konfig.list", "read", actionKonfigList);
    register("konfig.save", "write", actionKonfigSave);
    register("konfig.remove", "write", actionKonfigRemove);
    register("konfig.deactivate", "write", actionKonfigDeactivate);
    register("log.list", "log", actionLogList);
    register("settings.changePin", "settings.changePin", actionChangePin);

    /* ---------------- entry point ---------------- */
    async function handle(payload) {
      CTX = { requestId: uuid(), warnings: [], logQueue: [] };
      try {
        var action = String((payload && (payload.a || payload.action)) || "").trim();
        if (!action) throwApp("BAD_REQUEST", "Action wajib diisi.");
        var entry = ACTIONS[action];
        if (!entry) throwApp("UNKNOWN_ACTION", "Aksi tidak dikenal: " + action);

        await ensureReady();

        var session = null;
        if (PUBLIC_ACTIONS.indexOf(action) === -1) session = await requireAuth(payload ? payload.token : "");
        rateLimit(entry.bucket, action, session);

        var data = await entry.fn(payload, session);
        if (ctx().warnings.length && data && typeof data === "object") data.warnings = ctx().warnings;
        return { ok: true, data: data, requestId: CTX.requestId };
      } catch (e) {
        if (e && e._app) {
          return { ok: false, error: { code: e.code, message: e.message, retryIn: e.retryIn || undefined, details: e.details || undefined }, requestId: CTX.requestId };
        }
        if (typeof console !== "undefined") console.error("FATAL requestId=" + CTX.requestId, e);
        return { ok: false, error: { code: "SERVER_ERROR", message: "Terjadi kesalahan pada sistem." }, requestId: CTX.requestId };
      } finally {
        try { await flushLogs(); } catch (e2) {}
      }
    }
    function ctx() { return CTX; }

    async function init() { await ensureReady(); return true; }

    async function setPin(pinPlain) {
      await ensureReady();
      var once = await hashHex(String(pinPlain).trim());
      var twice = await hashHex(once);
      await setMeta("PIN_HASH", twice);
      return twice;
    }
    async function hasPin() { await ensureReady(); return !!(await getMeta("PIN_HASH")); }

    return { handle: handle, init: init, setPin: setPin, hasPin: hasPin, _actions: ACTIONS, _rl: rl };
  }

  return { create: create, AppError: AppError };
})();
