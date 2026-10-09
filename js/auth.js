/* ============================================================
 * auth.js — PIN (SHA-256), sesi token, guard halaman.
 * Alur & aturan keamanan: PRD §8 FR-001, §21 SEC-001..004.
 * ============================================================ */
window.App = window.App || {};

App.auth = (function () {
  "use strict";

  /* ---------------- SHA-256 ----------------
   * Utamakan Web Crypto (akurat, bawaan platform).
   * Fallback murni-JS hanya untuk konteks non-secure (mis. membuka
   * index.html via file://) agar aplikasi tetap bisa dipakai.
   * Algoritma di bawah adalah implementasi SHA-256 standar (FIPS 180-4).
   */
  function bytesToHex(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
    return out;
  }

  function utf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 128) out.push(c);
      else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63));
      else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
    return new Uint8Array(out);
  }

  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function sha256Bytes(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = bytes.length;
    var total = (((len + 8) >> 6) + 1) * 64;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    var bitLen = len * 8;
    var hi = Math.floor(bitLen / 4294967296);
    var lo = bitLen >>> 0;
    buf[total - 8] = (hi >>> 24) & 255;
    buf[total - 7] = (hi >>> 16) & 255;
    buf[total - 6] = (hi >>> 8) & 255;
    buf[total - 5] = hi & 255;
    buf[total - 4] = (lo >>> 24) & 255;
    buf[total - 3] = (lo >>> 16) & 255;
    buf[total - 2] = (lo >>> 8) & 255;
    buf[total - 1] = lo & 255;

    var w = new Uint32Array(64);
    function rr(x, n) { return (x >>> n) | (x << (32 - n)); }

    for (var off = 0; off < total; off += 64) {
      for (var t = 0; t < 16; t++) {
        var i4 = off + t * 4;
        w[t] = ((buf[i4] << 24) | (buf[i4 + 1] << 16) | (buf[i4 + 2] << 8) | buf[i4 + 3]) >>> 0;
      }
      for (t = 16; t < 64; t++) {
        var s0 = (rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
        var s1 = (rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var temp1 = (h + S1 + ch + K256[t] + w[t]) >>> 0;
        var S0 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var temp2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var out = new Uint8Array(32);
    for (var j = 0; j < 8; j++) {
      out[j * 4] = (H[j] >>> 24) & 255;
      out[j * 4 + 1] = (H[j] >>> 16) & 255;
      out[j * 4 + 2] = (H[j] >>> 8) & 255;
      out[j * 4 + 3] = H[j] & 255;
    }
    return out;
  }

  function sha256Hex(str) {
    if (window.isSecureContext && window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest("SHA-256", utf8Bytes(str)).then(function (buf) {
        return bytesToHex(new Uint8Array(buf));
      });
    }
    try {
      return Promise.resolve(bytesToHex(sha256Bytes(utf8Bytes(str))));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /* ---------------- sesi ---------------- */
  function session() { return App.store.getSession(); }
  function token() { var s = session(); return s ? s.token : null; }
  function isLoggedIn() { return !!session(); }

  function pinValid(pin) { return /^\d{4,8}$/.test(String(pin || "").trim()); }

  function hasPin() { return App.api.hasPin(); }

  /** First-run: buat PIN pertama kali lalu langsung masuk. */
  function setupPin(pin) {
    if (!pinValid(pin)) {
      return Promise.reject({ code: "WEAK_PIN", message: "PIN harus 4–8 digit angka." });
    }
    return App.api.setPin(String(pin).trim()).then(function () {
      return login(pin);
    });
  }

  function login(pin) {
    if (!pinValid(pin)) {
      return Promise.reject({ code: "WEAK_PIN", message: "PIN harus 4–8 digit angka." });
    }
    return sha256Hex(String(pin).trim()).then(function (hash) {
      return App.api.call("auth.verify", { pin: hash });
    }).then(function (data) {
      App.store.setSession(data.token, data.expiresAt);
      return data;
    });
  }

  function logout(remote) {
    var t = token();
    var finish = function () {
      App.store.clearSession();
      App.store.clearMeta();
      if (location.hash !== "#/login") location.hash = "#/login";
    };
    if (remote !== false && t) {
      return App.api.call("auth.logout", {}).then(finish, finish);
    }
    finish();
    return Promise.resolve();
  }

  function changePin(oldPin, newPin) {
    if (!pinValid(newPin)) {
      return Promise.reject({ code: "WEAK_PIN", message: "PIN baru harus 4–8 digit angka." });
    }
    if (String(oldPin).trim() === String(newPin).trim()) {
      return Promise.reject({ code: "WEAK_PIN", message: "PIN baru tidak boleh sama dengan PIN lama." });
    }
    return Promise.all([sha256Hex(String(oldPin).trim()), sha256Hex(String(newPin).trim())])
      .then(function (hashes) {
        return App.api.call("settings.changePin", { oldPin: hashes[0], newPin: hashes[1] });
      });
  }

  /** Dipanggil router: melempar bila sesi tidak valid. */
  function requireSession() {
    if (!isLoggedIn()) throw { code: "INVALID_TOKEN", message: "Sesi berakhir." };
  }

  return {
    sha256Hex: sha256Hex,
    pinValid: pinValid,
    session: session, token: token, isLoggedIn: isLoggedIn,
    login: login, setupPin: setupPin, hasPin: hasPin,
    logout: logout, changePin: changePin,
    requireSession: requireSession
  };
})();
