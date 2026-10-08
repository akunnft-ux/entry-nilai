/* ============================================================
 * api.js — transport terpusat ke Google Apps Script.
 *
 * ADR-002 (wajib dibaca sebelum mengubah file ini):
 *   PRIMARY  : POST text/plain  (CORS "simple request" → tanpa preflight OPTIONS,
 *                                yang tidak didukung Google Apps Script)
 *   FALLBACK : GET  JSONP       (script tag selalu lolos CORS)
 *   Server   : doGet & doPost memanggil handler yang sama.
 *
 * Aturan modul: halaman TIDAK BOLEH memanggil fetch langsung.
 * ============================================================ */
window.App = window.App || {};

App.debug = { lastRequestId: null, lastTransport: null, lastError: null };

App.api = (function () {
  "use strict";

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
    var u = App.config.EXEC_URL;
    return typeof u === "string" && /^https:\/\/script\.google\.com\/.+\/exec\/?$/.test(u.trim());
  }

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

  function envelope(env, action) {
    if (!env || typeof env !== "object") {
      throw err("BAD_RESPONSE", "Respons server tidak terbaca.");
    }
    if (env.ok === false) {
      var e = env.error || {};
      var ex = err(e.code || "UNKNOWN", e.message || "Terjadi kesalahan.", env.requestId);
      if (e.retryIn) ex.retryIn = e.retryIn;
      if (e.details) ex.details = e.details;
      throw ex;
    }
    App.debug.lastRequestId = env.requestId || null;
    if (env.requestId === undefined || env.requestId === null) env.requestId = null;
    return env.data;
  }

  /* ---------------- PRIMARY: POST text/plain ---------------- */
  function post(body) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, App.config.TIMEOUT_MS);

    return fetch(App.config.EXEC_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.text();
    }).then(function (text) {
      if (!text || !text.trim()) throw err("BAD_RESPONSE", "Server mengembalikan respons kosong.");
      try { return JSON.parse(text); }
      catch (e) { throw err("BAD_RESPONSE", "Respons server bukan JSON yang valid."); }
    }).catch(function (e) {
      if (e && e.name === "AbortError") throw err("TIMEOUT", "Server terlalu lama merespons.");
      if (e instanceof ApiError) throw e;
      throw err("NETWORK", "Gagal menghubungi server.");
    }).finally(function () { clearTimeout(timer); });
  }

  /* ---------------- FALLBACK: JSONP ---------------- */
  function jsonp(body) {
    var payload = JSON.stringify(body);
    if (payload.length > App.config.JSONP_MAX_PAYLOAD) {
      return Promise.reject(err("PAYLOAD_TOO_LARGE", "Data terlalu besar untuk transport cadangan."));
    }
    return new Promise(function (resolve, reject) {
      var name = "__en_cb_" + Math.random().toString(36).slice(2, 10);
      var url;
      try {
        url = new URL(App.config.EXEC_URL);
      } catch (e) { return reject(err("NOT_CONFIGURED", "URL Apps Script belum diatur.")); }
      url.searchParams.set("cb", name);
      url.searchParams.set("p", payload);

      var script = document.createElement("script");
      var done = false;

      function cleanup() {
        clearTimeout(timer);
        try { delete window[name]; } catch (e) { window[name] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      function fail(e) {
        if (done) return;
        done = true;
        cleanup();
        reject(e);
      }

      var timer = setTimeout(function () {
        fail(err("TIMEOUT", "Server terlalu lama merespons."));
      }, App.config.TIMEOUT_MS);

      window[name] = function (env) {
        if (done) return;
        done = true;
        cleanup();
        resolve(env);
      };
      script.onerror = function () { fail(err("NETWORK", "Transport cadangan gagal.")); };
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  function normalizedTransportError(e) {
    if (e instanceof ApiError) return e;
    return err("NETWORK", (e && e.message) || "Gagal menghubungi server.");
  }

  /* ---------------- public ---------------- */
  /**
   * App.api.call(action, payload) → Promise<data>
   * Melempar ApiError dengan .code bila gagal.
   */
  function call(action, payload) {
    if (!configured()) {
      return Promise.reject(err("NOT_CONFIGURED", "URL Apps Script belum diatur."));
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return Promise.reject(err("OFFLINE", "Koneksi internet terputus."));
    }

    var body = withToken(buildBody(Object.assign({ a: action }, payload || {})));
    App.debug.lastError = null;

    var attempt = 0;

    function tryPost() {
      return post(body).then(
        function (env) { App.debug.lastTransport = "post"; return env; },
        function (e) {
          var ne = normalizedTransportError(e);
          attempt++;
          /* Hanya retry untuk masalah jaringan/transport — bukan error logika. */
          var retriable = ["NETWORK", "TIMEOUT", "BAD_RESPONSE"].indexOf(ne.code) !== -1;
          if (retriable && attempt < App.config.RETRY_TIMES) {
            return sleep(300 * Math.pow(2, attempt - 1)).then(tryPost);
          }
          throw ne;
        }
      );
    }

    return tryPost().catch(function (postError) {
      var canFallback = App.config.ALLOW_JSONP_FALLBACK &&
        ["NETWORK", "TIMEOUT", "BAD_RESPONSE", "OFFLINE"].indexOf(postError.code) !== -1;
      if (!canFallback) { App.debug.lastError = postError; throw postError; }

      return jsonp(body).then(
        function (env) {
          App.debug.lastTransport = "jsonp";
          return env;
        },
        function (fallbackError) {
          var e = normalizedTransportError(fallbackError);
          App.debug.lastError = e;
          throw e;
        }
      );
    }).then(function (env) {
      try { return envelope(env, action); }
      catch (e) { App.debug.lastError = e; throw e; }
    }).catch(function (e) {
      App.debug.lastError = e;
      /* Sesi kedaluwarsa → minta login ulang (guard UX; server tetap otoritatif). */
      if (e.code === "INVALID_TOKEN") {
        App.store.clearSession();
        App.store.clearMeta();
        if (location.hash !== "#/login") location.hash = "#/login";
      }
      throw e;
    });
  }

  /** Health check ringan saat boot. */
  function ping() {
    return call("ping", {});
  }

  return { call: call, ping: ping, ApiError: ApiError, configured: configured };
})();
