/* ============================================================
 * turso/client.js — klien Turso (libSQL) via HTTP pipeline.
 *
 * Satu request API = satu POST ke /v2/pipeline; beberapa statement
 * dikirim sekaligus (1 round-trip). Nilai dikodekan sebagai tagged
 * value: {type:'integer'|'float'|'text'|'null', value}.
 *
 * Antarmuka db (dipakai backend/engine.js):
 *   all(sql, args)    → Promise<row[]>
 *   run(sql, args)    → Promise<{changes, lastInsertRowid}>
 *   batch(statements) → Promise<result[]>   statements = [{sql,args}]
 *   exec(sqlList)     → Promise<void>       sqlList = string[]
 * ============================================================ */
window.App = window.App || {};

App.turso = (function () {
  "use strict";

  /* ---------------- tagged value ↔ JS ---------------- */
  function enc(v) {
    if (v === null || v === undefined) return { type: "null" };
    if (typeof v === "number") {
      return Number.isInteger(v)
        ? { type: "integer", value: String(v) }
        : { type: "float", value: v };
    }
    if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
    return { type: "text", value: String(v) };
  }

  function dec(val) {
    if (!val || typeof val !== "object") return val;
    switch (val.type) {
      case "null": return null;
      case "integer": return Number(val.value);
      case "float": return val.value;
      case "text": return val.value;
      case "blob": return val.base64;
      default: return val.value;
    }
  }

  function decodeRows(result) {
    var cols = result.cols || [];
    return (result.rows || []).map(function (row) {
      var o = {};
      for (var i = 0; i < cols.length; i++) o[cols[i].name] = dec(row[i]);
      return o;
    });
  }

  function create(opts) {
    var base = String(opts.url || "").replace(/\/+$/, "") + "/v2/pipeline";
    var auth = "Bearer " + opts.token;
    var timeout = opts.timeout || 15000;

    async function pipeline(requests) {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeout);
      var res;
      try {
        res = await fetch(base, {
          method: "POST",
          headers: { "Authorization": auth, "Content-Type": "application/json" },
          body: JSON.stringify({ requests: requests.concat([{ type: "close" }]) }),
          signal: ctrl ? ctrl.signal : undefined
        });
      } catch (e) {
        throw dbError(e && e.name === "AbortError" ? "TIMEOUT" : "NETWORK",
          e && e.name === "AbortError" ? "Database terlalu lama merespons." : "Gagal menghubungi database.");
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        var body = "";
        try { body = await res.text(); } catch (e2) {}
        throw dbError("HTTP_" + res.status, "Database menolak permintaan (" + res.status + "). " + body);
      }
      var json = await res.json();
      if (json && json.error) throw dbError("DB_ERROR", json.error);
      return (json.results || []).slice(0, requests.length);
    }

    function stmt(sql, args) {
      return { type: "execute", stmt: { sql: sql, args: (args || []).map(enc) } };
    }

    function assertOk(r) {
      if (r && r.type === "error") {
        var msg = (r.error && r.error.message) || "Kesalahan database.";
        throw dbError("DB_ERROR", msg);
      }
      return r.response.result;
    }

    async function all(sql, args) {
      var results = await pipeline([stmt(sql, args)]);
      return decodeRows(assertOk(results[0]));
    }

    async function run(sql, args) {
      var results = await pipeline([stmt(sql, args)]);
      var r = assertOk(results[0]);
      return { changes: r.affected_row_count || 0, lastInsertRowid: r.last_insert_rowid };
    }

    async function batch(statements) {
      if (!statements.length) return [];
      var results = await pipeline(statements.map(function (s) { return stmt(s.sql, s.args); }));
      return results.map(function (r) {
        var res = assertOk(r);
        return { changes: res.affected_row_count || 0, rows: decodeRows(res) };
      });
    }

    async function exec(sqlList) {
      await batch(sqlList.map(function (sql) { return { sql: sql }; }));
    }

    return { all: all, run: run, batch: batch, exec: exec };
  }

  function dbError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  return { create: create, enc: enc, dec: dec };
})();
