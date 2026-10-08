/* ============================================================
 * config.js — satu-satunya tempat konfigurasi deploy.
 * ADR-001: tanpa bundler, tanpa env vars (GitHub Pages).
 * ============================================================ */
window.App = window.App || {};

/* Registry halaman — didefinisikan di sini (bukan di app.js) karena
 * js/pages/*.js dimuat SEBELUM js/app.js. Aturan modul §3.1:
 * menambah fitur = 1 file pages + 1 tag <script> + 1 baris di sini. */
App._pages = {};
App.registerPage = function (name, definition) {
  App._pages[name] = definition;
};

App.config = {
  /**
   * WAJIB DIGANTI setelah deploy Google Apps Script.
   * Format: https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
   * Cara mendapatkannya: lihat docs/deployment.md langkah 5.
   * Biarkan string kosong ("") bila belum di-deploy — aplikasi akan
   * menampilkan wizard setup, bukan error tak terbaca.
   */
  EXEC_URL: "https://script.google.com/macros/s/AKfycbyh1Z6IUPiH3DfijUL7Qjep8_C6o_8rEzX781GeA7VsFQIGlYMJWjwPzD-_UskpQW1G/exec",

  APP_NAME: "Entry Nilai",
  VERSION: "1.0.0",

  /** Batas record per request (FR-004 / EC-10). */
  BATCH_SIZE: 200,

  /** Timeout 1 request dalam ms. */
  TIMEOUT_MS: 15000,

  /**
   * TTL sesi token (jam). Dibatasi CacheService Google (maks 6 jam).
   * PRD §21 SEC-004 — didepresikan dari 8 jam → 6 jam oleh batasan platform.
   */
  TOKEN_TTL_HOURS: 6,

  /**
   * Transport cadangan JSONP (ADR-002). Aktif bila fetch POST gagal
   * dibaca karena kebijakan CORS. Matikan ("false") bila Anda ingin
   * menonaktifkan fallback yang menaruh token di query string.
   */
  ALLOW_JSONP_FALLBACK: true,

  /** Panjang maksimum payload JSONP (batas panjang URL). */
  JSONP_MAX_PAYLOAD: 8000,

  /** Retry otomatis sebelum fallback transport. */
  RETRY_TIMES: 3,

  /** Debounce penyimpanan draft (ms). */
  DRAFT_DEBOUNCE_MS: 300
};
