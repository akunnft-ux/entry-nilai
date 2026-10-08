/* ============================================================
 * store.js — cache meta, draft lokal, penanda "belum tersimpan".
 * Semua akses localStorage lewat modul ini (aturan §3.1 arsitektur).
 * ============================================================ */
window.App = window.App || {};

App.store = (function () {
  "use strict";

  var K = {
    META: "en.meta",
    META_AT: "en.metaAt",
    TOKEN: "en.token",
    TOKEN_EXP: "en.tokenExp",
    KONFIG: "en.konfig",
    KONFIG_AT: "en.konfigAt"
  };

  var META_TTL_MS = 30 * 60 * 1000; /* 30 menit */
  var KONFIG_TTL_MS = 60 * 1000;    /* 60 detik: cukup utk navigasi; dimatikan saat mutasi */

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function safeDel(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  /* ---------------- meta (kelas / jenis / kode) ---------------- */
  function getMeta() {
    var raw = safeGet(K.META);
    var at = parseInt(safeGet(K.META_AT) || "0", 10);
    if (!raw || !at || Date.now() - at > META_TTL_MS) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function setMeta(meta) {
    safeSet(K.META, JSON.stringify(meta));
    safeSet(K.META_AT, String(Date.now()));
  }

  function clearMeta() { safeDel(K.META); safeDel(K.META_AT); }

  /* ---------------- konfig (kelas/jenis/kode, urut, aktif) ---------------- */
  function getKonfig() {
    var raw = safeGet(K.KONFIG);
    var at = parseInt(safeGet(K.KONFIG_AT) || "0", 10);
    if (!raw || !at || Date.now() - at > KONFIG_TTL_MS) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function setKonfig(entries) {
    safeSet(K.KONFIG, JSON.stringify(entries));
    safeSet(K.KONFIG_AT, String(Date.now()));
  }

  function clearKonfig() { safeDel(K.KONFIG); safeDel(K.KONFIG_AT); }

  /* ---------------- sesi ---------------- */
  function getSession() {
    var token = safeGet(K.TOKEN);
    var exp = parseInt(safeGet(K.TOKEN_EXP) || "0", 10);
    if (!token || !exp || Date.now() >= exp) return null;
    return { token: token, expiresAt: exp };
  }

  function setSession(token, expiresAt) {
    safeSet(K.TOKEN, token);
    safeSet(K.TOKEN_EXP, String(expiresAt));
  }

  function clearSession() { safeDel(K.TOKEN); safeDel(K.TOKEN_EXP); }

  /* ---------------- draft ---------------- */
  function draftKey(kelas, jenis, kode) {
    return "en.draft." + [kelas, jenis, kode].join("|");
  }

  function getDraft(kelas, jenis, kode) {
    var raw = safeGet(draftKey(kelas, jenis, kode));
    if (!raw) return null;
    try {
      var d = JSON.parse(raw);
      if (!d || typeof d !== "object" || !d.rows) return null;
      /* draft kadaluarsa 24 jam */
      if (!d.at || Date.now() - d.at > 24 * 3600 * 1000) {
        clearDraft(kelas, jenis, kode);
        return null;
      }
      return d;
    } catch (e) { return null; }
  }

  function setDraft(kelas, jenis, kode, rows) {
    return safeSet(draftKey(kelas, jenis, kode), JSON.stringify({ at: Date.now(), rows: rows }));
  }

  function clearDraft(kelas, jenis, kode) { safeDel(draftKey(kelas, jenis, kode)); }

  function hasAnyDraft() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("en.draft.") === 0) return true;
      }
    } catch (e) {}
    return false;
  }

  function clearAllDrafts() {
    try {
      var doomed = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("en.draft.") === 0) doomed.push(k);
      }
      doomed.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  return {
    getMeta: getMeta, setMeta: setMeta, clearMeta: clearMeta,
    getSession: getSession, setSession: setSession, clearSession: clearSession,
    getDraft: getDraft, setDraft: setDraft, clearDraft: clearDraft,
    hasAnyDraft: hasAnyDraft, clearAllDrafts: clearAllDrafts,
    getKonfig: getKonfig, setKonfig: setKonfig, clearKonfig: clearKonfig
  };
})();
