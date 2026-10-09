/* ============================================================
 * config.js — satu-satunya tempat konfigurasi deploy.
 * ADR-001: tanpa bundler, tanpa env vars (GitHub Pages).
 * Arsitektur: browser langsung ke Turso (libSQL) via HTTP pipeline.
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
  /** Endpoint database Turso (hostname tanpa skema path). */
  TURSO_URL: "https://entry-nilai-akunnft-ux.aws-ap-southeast-2.turso.io",

  /**
   * Token database Turso (permission: full-access, non-expiring).
   * CATATAN KEAMANAN: token ini PUBLIK — siapa pun yang memiliki halaman
   * ini dapat membaca/menulis database. Aplikasi ini dirancang untuk
   * pemakaian pribadi satu pengguna.
   */
  TURSO_TOKEN: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE1NDQxODMsImlkIjoiMDFhMTIwNWEtYzAwMS03MjQxLWFlNzMtMDY1ZGIzZWI0ZTI5Iiwia2lkIjoiOHF1N01mYnhjSnZxdVFpYXlJZEd5U2k1MEViOWNUX1IwNFVzbWZUQlY3MCIsInJpZCI6IjdkOGQ5ZGI0LWQ0OGYtNGU3Mi05MWExLWYxYTRjNzZmY2EyMiJ9.OStxCWvZ2b_MHpZQiBiL7U5PFX_WpXzVdHVOH3L1WZWe_an5ykPmR1AVtHKITpp1T9feLSi-N5enw43fVgeMAg",

  APP_NAME: "Entry Nilai",
  VERSION: "2.0.0",

  /** Batas record per request (FR-004 / EC-10). */
  BATCH_SIZE: 200,

  /** Timeout 1 request HTTP ke Turso (ms). */
  TIMEOUT_MS: 15000,

  /** TTL sesi token (jam). Tanpa batas platform — dijaga oleh klien + tabel. */
  TOKEN_TTL_HOURS: 6,

  /** Retry otomatis untuk error jaringan/timeout. */
  RETRY_TIMES: 3,

  /** Debounce penyimpanan draft (ms). */
  DRAFT_DEBOUNCE_MS: 300
};
