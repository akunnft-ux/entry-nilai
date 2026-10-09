/* ============================================================
 * ui.js — komponen reusable. Sumber acuan: docs/ui-spec.md §5.
 * Tanpa framework; semua halaman WAJIB memakai modul ini.
 * ============================================================ */
window.App = window.App || {};

App.ui = (function () {
  "use strict";

  function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  }

  /* ---------------- nilai ---------------- */
  var NILAI_RE = /^\d{1,3}([.,]\d)?$/;

  function parseNilai(raw) {
    if (raw === null || raw === undefined) return { empty: true };
    var s = String(raw).trim();
    if (s === "") return { empty: true };
    if (!NILAI_RE.test(s)) return { invalid: "Gunakan angka 0–100 (maks 1 desimal)" };
    var n = parseFloat(s.replace(",", "."));
    if (isNaN(n) || n < 0 || n > 100) return { invalid: "Nilai harus 0–100" };
    return { value: n };
  }

  function fmtNilai(n) {
    if (n === null || n === undefined || n === "") return "—";
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 1 });
  }

  /* ---------------- toast ---------------- */
  function toast(message, type) {
    var root = document.getElementById("toastRoot");
    if (!root) return;
    type = type || "info";
    var node = el(
      '<div class="toast toast-' + type + '">' +
        '<div class="toast-msg">' + esc(message) + "</div>" +
        '<button class="toast-close" type="button" aria-label="Tutup">&times;</button>' +
      "</div>"
    );
    var close = function () { if (node.parentNode) node.parentNode.removeChild(node); };
    node.querySelector(".toast-close").addEventListener("click", close);
    root.appendChild(node);
    setTimeout(close, 4000);
  }

  /* ---------------- modal konfirmasi ---------------- */
  function confirm(opts) {
    opts = opts || {};
    var root = document.getElementById("modalRoot");
    var previous = document.activeElement;
    root.innerHTML = "";

    var backdrop = el(
      '<div class="modal-backdrop">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mdTitle">' +
          '<div class="modal-head"><div class="modal-title" id="mdTitle"></div></div>' +
          '<div class="modal-body"></div>' +
          '<div class="modal-foot">' +
            '<button class="btn btn-secondary" data-act="cancel" type="button">Batal</button>' +
            '<button class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" data-act="ok" type="button"></button>' +
          "</div>" +
        "</div>" +
      "</div>"
    );
    backdrop.querySelector("#mdTitle").textContent = opts.title || "Konfirmasi";
    backdrop.querySelector(".modal-body").textContent = opts.body || "";
    var okBtn = backdrop.querySelector('[data-act="ok"]');
    okBtn.textContent = opts.okLabel || "Lanjutkan";

    function close(result) {
      document.removeEventListener("keydown", onKey, true);
      root.innerHTML = "";
      if (previous && previous.focus) previous.focus();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
      if (e.key === "Tab") {
        var f = backdrop.querySelectorAll("button");
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    var resolve;
    var promise = new Promise(function (r) { resolve = r; });

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close(false);
      var act = e.target.getAttribute && e.target.getAttribute("data-act");
      if (act === "ok") close(true);
      if (act === "cancel") close(false);
    });
    document.addEventListener("keydown", onKey, true);

    root.appendChild(backdrop);
    okBtn.focus();
    return promise;
  }

  /* ---------------- field ---------------- */
  function field(opts) {
    var id = "f_" + opts.name;
    var errId = id + "_err";
    var hintId = id + "_hint";
    var described = [];
    if (opts.hint) described.push(hintId);
    if (opts.error) described.push(errId);

    var input;
    if (opts.type === "select") {
      var options = (opts.options || [])
        .map(function (o) {
          return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(opts.value) ? " selected" : "") + ">" + esc(o.label) + "</option>";
        })
        .join("");
      input = '<select class="select" id="' + id + '" name="' + esc(opts.name) + '"' +
        (described.length ? ' aria-describedby="' + described.join(" ") + '"' : "") +
        (opts.disabled ? " disabled" : "") + ">" + options + "</select>";
    } else {
      input = '<input class="input' + (opts.inputClass ? " " + opts.inputClass : "") + '" id="' + id + '" name="' + esc(opts.name) + '"' +
        ' type="' + esc(opts.type || "text") + '"' +
        (opts.value !== undefined && opts.value !== null ? ' value="' + esc(opts.value) + '"' : "") +
        (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") +
        (opts.maxLength ? ' maxlength="' + opts.maxLength + '"' : "") +
        (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : "") +
        (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : " autocomplete=\"off\"") +
        (opts.required ? " required" : "") +
        (opts.disabled ? " disabled" : "") +
        (opts.error ? ' aria-invalid="true"' : "") +
        (described.length ? ' aria-describedby="' + described.join(" ") + '"' : "") +
        ">";
    }

    return '<div class="field">' +
      '<label class="label" for="' + id + '">' + esc(opts.label) +
        (opts.required ? '<span class="req" aria-hidden="true">*</span>' : "") + "</label>" +
      input +
      (opts.hint ? '<div class="hint" id="' + hintId + '">' + esc(opts.hint) + "</div>" : "") +
      (opts.error ? '<div class="error-text" id="' + errId + '" role="alert">' + esc(opts.error) + "</div>" : "") +
    "</div>";
  }

  /* ---------------- banner ---------------- */
  function banner(type, title, body, actionHtml) {
    return '<div class="banner banner-' + type + '" role="' + (type === "error" ? "alert" : "status") + '">' +
      '<div class="banner-body">' +
        (title ? '<div class="banner-title">' + title + "</div>" : "") +
        (body ? "<div>" + body + "</div>" : "") +
        (actionHtml ? '<div class="row" style="margin-top:8px">' + actionHtml + "</div>" : "") +
      "</div>" +
    "</div>";
  }

  /* ---------------- skeleton ---------------- */
  function skeleton(rows, widths) {
    rows = rows || 6;
    widths = widths || [40, 120, 220, 90];
    var out = '<div aria-hidden="true">';
    for (var i = 0; i < rows; i++) {
      out += '<div class="skeleton-row">';
      for (var j = 0; j < widths.length; j++) {
        out += '<div class="sk" style="width:' + widths[j] + 'px"></div>';
      }
      out += "</div>";
    }
    return out + "</div>";
  }

  /* ---------------- empty state ---------------- */
  function emptyState(opts) {
    var icon = opts.icon ||
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';
    return '<div class="empty">' +
      '<div class="empty-icon" aria-hidden="true">' + icon + "</div>" +
      '<div class="empty-title">' + esc(opts.title) + "</div>" +
      (opts.body ? '<div class="empty-body">' + esc(opts.body) + "</div>" : "") +
      (opts.cta ? opts.cta : "") +
    "</div>";
  }

  /* ---------------- table ---------------- */
  /**
   * cols: [{key,label,cls,width}]  rows: [{id,data,cls}]
   * cell(col,row) opsional untuk render HTML sel.
   */
  function table(opts) {
    var cols = opts.cols || [];
    var rows = opts.rows || [];
    var html = '<div class="table-scroll nice"><table class="data' + (opts.tableClass ? " " + opts.tableClass : "") + '">';
    html += "<thead><tr>";
    cols.forEach(function (c) {
      html += '<th scope="col" class="' + esc(c.cls || "") + '"' + (c.width ? ' style="width:' + c.width + '"' : "") + ">" + esc(c.label) + "</th>";
    });
    html += "</tr></thead><tbody>";

    if (!rows.length) {
      html += '<tr><td colspan="' + cols.length + '" style="height:auto;padding:0;white-space:normal">' +
        emptyState(opts.empty || { title: "Belum ada data" }) + "</td></tr>";
    }

    rows.forEach(function (r) {
      html += "<tr" + (r.id ? ' data-id="' + esc(r.id) + '"' : "") + (r.cls ? ' class="' + esc(r.cls) + '"' : "") + ">";
      cols.forEach(function (c) {
        var content = opts.cell ? opts.cell(c, r) : (r.data ? r.data[c.key] : "");
        html += '<td class="' + esc(c.cls || "") + '">' + (content === undefined || content === null ? "" : content) + "</td>";
      });
      html += "</tr>";
    });

    return html + "</tbody></table></div>";
  }

  /* ---------------- CSV ---------------- */
  function csvCell(v) {
    var s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;           /* SEC-008: CSV/formula injection guard */
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
  }

  function downloadCsv(filename, rows) {
    var csv = toCsv(rows);
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- error message ramah ---------------- */
  function friendlyError(err) {
    var code = err && err.code;
    var map = {
      OFFLINE: "Koneksi internet terputus. Periksa jaringan lalu coba lagi.",
      TIMEOUT: "Database terlalu lama merespons. Coba lagi dalam beberapa saat.",
      NETWORK: "Gagal menghubungi database. Periksa koneksi lalu coba lagi.",
      BAD_RESPONSE: "Respons tidak terbaca. Pastikan TURSO_URL di js/config.js benar.",
      DB_ERROR: "Kesalahan pada database. Coba lagi atau hubungi operator.",
      INVALID_TOKEN: "Sesi Anda berakhir. Silakan masuk kembali.",
      RATE_LIMITED: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
      PIN_NOT_CONFIGURED: "PIN belum dibuat. Buat PIN terlebih dahulu.",
      INVALID_PIN: "PIN salah. Periksa kembali PIN Anda.",
      CONFIG_IN_USE: "Entri ini sudah dipakai data dan tidak bisa dihapus.",
      NOT_CONFIGURED: "Aplikasi belum terhubung ke database.",
      INTERNAL: "Terjadi kesalahan pada sistem. Coba lagi."
    };
    if (map[code]) return map[code];
    if (err && err.message) return err.message;
    return "Terjadi kesalahan yang tidak diketahui.";
  }

  function busy(button, state, label) {
    if (!button) return;
    if (state) {
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + esc(label || "Menyimpan…");
    } else {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
  }

  /* ---------------- pager ---------------- */
  function pager(opts) {
    opts = opts || {};
    var pageSize = opts.pageSize || 25;
    var total = opts.total || 0;
    var pages = Math.max(1, Math.ceil(total / pageSize));
    var page = Math.min(Math.max(1, opts.page || 1), pages);
    if (total <= pageSize) return "";
    var from = (page - 1) * pageSize + 1;
    var to = Math.min(page * pageSize, total);
    return '<nav class="pager" aria-label="Navigasi halaman">' +
      '<span class="pager-info">' + from + "–" + to + " dari " + total + "</span>" +
      '<div class="pager-btns">' +
        '<button class="btn btn-secondary btn-sm" type="button" data-page="' + (page - 1) + '"' +
          (page > 1 ? "" : " disabled") + ">‹ Sebelumnya</button>" +
        '<span class="pager-page">Halaman ' + page + " / " + pages + "</span>" +
        '<button class="btn btn-secondary btn-sm" type="button" data-page="' + (page + 1) + '"' +
          (page < pages ? "" : " disabled") + ">Berikutnya ›</button>" +
      "</div>" +
    "</nav>";
  }

  return {
    esc: esc, el: el,
    parseNilai: parseNilai, fmtNilai: fmtNilai,
    toast: toast, confirm: confirm, field: field, banner: banner,
    skeleton: skeleton, emptyState: emptyState, table: table, pager: pager,
    toCsv: toCsv, downloadCsv: downloadCsv,
    friendlyError: friendlyError, busy: busy
  };
})();
