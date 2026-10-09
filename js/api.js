/* ============================================================
 * api.js — transport terpusat.
 *
 * ARSITEKTUR (v2): tidak ada server aplikasi. Logika backend berjalan
 * di browser (js/backend/engine.js) di atas database Turso (libSQL).
 * Halaman tetap memanggil App.api.call(action, payload) — kontrak envelope
 * {ok,data,error,requestId} dan registry aksi tidak berubah.
 *
 * Aturan modul: halaman TIDAK BOLEH menyentuh engine/db secara langsung.
 * ============================================================ */
window.App = window.App || {};

App.debug = { lastRequestId: null, lastTransport: null, lastError: null };

App.api = (function () {
  "use strict";

  var READ_ACTIONS = ["ping", "meta.get", "siswa.list", "nilai.list", "rekap.get", "konfig.list", "log.list"];
  var backend = null;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function ApiError(code, message, requestId) {
    this.name = "ApiError";
    this.code = code || "UNKNOWN";
    this.message = message || "Terjadi kesalahan";
    this.requestId = requestId || null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function err(code, message, requestId) { return new ApiError(code, message, requestId); }

  function configured() {
    return typeof App.config.TURSO_URL === "string" && App.config.TURSO_URL.trim() !== "" &&
           typeof App.config.TURSO_TOKEN === "string" && App.config.TURSO_TOKEN.trim() !== "";
  }

  function getBackend() {
    if (backend) return backend;
    var db = App.turso.create({ url: App.config.TURSO_URL, token: App.config.TURSO_TOKEN, timeout: App.config.TIMEOUT_MS });
    backend = App.backend.create(db, { sha256: App.auth.sha256Hex });
    return backend;
  }

  function initialized() { return getBackend().init(); }

  function buildBody(payload) {
    var body = {};
    if (payload) { for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) body[k] = payload[k]; }
    body.a = payload && payload.action ? payload.action : (payload && payload.a) || "";
    delete body.action;
    return body;
  }

  function withToken(body) {
    var s = App.store.getSession();
    if (s) body.token = s.token;
    return body;
  }

  function envelope(env) {
    if (!env || typeof env !== "object") throw err("BAD_RESPONSE", "Respons tidak terbaca.");
    if (env.ok === false) {
      var e = env.error || {};
      var ex = err(e.code || "UNKNOWN", e.message || "Terjadi kesalahan.", env.requestId);
      if (e.retryIn) ex.retryIn = e.retryIn;
      if (e.details) ex.details = e.details;
      throw ex;
    }
    App.debug.lastRequestId = env.requestId || null;
    return env.data;
  }

  function normalize(e) {
    if (e instanceof ApiError) return e;
    var code = (e && e.code) || "NETWORK";
    var msg = (e && e.message) || "Gagal menghubungi database.";
    return err(code, msg);
  }

  function run(body) {
    return getBackend().handle(body).then(function (env) {
      App.debug.lastTransport = "engine";
      return env;
    });
  }

  function call(action, payload) {
    if (!configured()) return Promise.reject(err("NOT_CONFIGURED", "Database Turso belum diatur."));
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return Promise.reject(err("OFFLINE", "Koneksi internet terputus."));
    }

    var body = withToken(buildBody(Object.assign({ a: action }, payload || {})));
    App.debug.lastError = null;
    var retriable = READ_ACTIONS.indexOf(action) !== -1;
    var attempt = 0;

    function tryOnce() {
      return initialized().then(function () {
        return run(body);
      }).catch(function (e) {
        var ne = normalize(e);
        attempt++;
        if (retriable && ["NETWORK", "TIMEOUT"].indexOf(ne.code) !== -1 && attempt < App.config.RETRY_TIMES) {
          return sleep(300 * Math.pow(2, attempt - 1)).then(tryOnce);
        }
        throw ne;
      });
    }

    return tryOnce().then(function (env) {
      try { return envelope(env); }
      catch (e) { App.debug.lastError = e; throw e; }
    }).catch(function (e) {
      App.debug.lastError = e;
      if (e.code === "INVALID_TOKEN") {
        App.store.clearSession();
        App.store.clearMeta();
        if (location.hash !== "#/login") location.hash = "#/login";
      }
      throw e;
    });
  }

  function ping() { return call("ping", {}); }

  /** First-run: buat PIN (double SHA-256 disimpan di tabel meta). */
  function setPin(pinPlain) { return Promise.resolve(getBackend().setPin(pinPlain)); }
  function hasPin() { return Promise.resolve(getBackend().hasPin()); }

  return { call: call, ping: ping, setPin: setPin, hasPin: hasPin, ApiError: ApiError, configured: configured };
})();
