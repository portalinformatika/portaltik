/* =====================================================================
 * api.js — lapisan jaringan REST (gas-pro-api + gas-scale-turbo)
 *  - fetch POST text/plain (anti preflight CORS), token di body
 *  - baca (getSoal/getAbsensi/getJurnal): cache 90 dtk, deduplikasi in-flight,
 *    penggabungan otomatis (batch) dalam satu permintaan HTTP
 *  - tulis: membatalkan cache baca, retry aman saat server sibuk (BUSY)
 * Bergantung pada global dari app.js: S, progress(), doLogout() (dipanggil saat runtime).
 * ===================================================================== */
'use strict';
const READS = { getSoal: 1, getAbsensi: 1, getJurnal: 1 };
const READ_TTL = 90000, BATCH_MAX = 8, NET_TIMEOUT = 70000;
let _rc = {}, _inf = {}, _ep = 0, _q = [], _qt = null;

const sleep_ = ms => new Promise(r => setTimeout(r, ms));
const clone_ = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
function gasUrl_() {
  const u = (window.APP_CONFIG || {}).GAS_URL || '';
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(u)) throw new Error('URL backend belum diisi. Buka js/config.js lalu isi GAS_URL dengan URL /exec dari Deploy.');
  return u;
}
function clearReadCache() { _rc = {}; _inf = {}; _ep++; }

async function fetchJson_(url, init, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, Object.assign({ signal: c.signal }, init)), txt = await r.text();
    try { return JSON.parse(txt); } catch (e) { throw new Error('Respons server tidak valid. Pastikan Deploy Web App: Jalankan sebagai "Saya", akses "Siapa saja", dan sudah memakai versi terbaru.'); }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Server terlalu lama merespons. Coba lagi.');
    if (e instanceof TypeError) throw new Error('Koneksi ke server gagal. Periksa internet Anda.');
    throw e;
  } finally { clearTimeout(t); }
}

/** GET publik (tanpa token): publicBoot, ping. */
async function pubGet(action) {
  const r = await fetchJson_(gasUrl_() + '?action=' + encodeURIComponent(action), {}, 30000);
  if (!r || !r.ok) throw new Error((r && r.msg) || 'Server tidak merespons.');
  return r.data;
}

/** Kirim satu aksi; mengembalikan objek respons penuh ({ok,data,...}). */
async function send_(action, payload, opt) {
  opt = opt || {}; const url = gasUrl_(); if (!opt.quiet) progress(true);
  try {
    let n = 0, busy = 0;
    for (;;) {
      try {
        const r = await fetchJson_(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, token: S.token, payload: payload || {} }) }, NET_TIMEOUT);
        if (r && r.t) S.clockSkew = r.t - Date.now();
        if (r && r.ok) return r;
        if (r && r.code === 'AUTH') doLogout(true, r.msg);
        if (r && r.code === 'BUSY' && busy < 3) { busy++; await sleep_(700 * busy); continue; }   // kunci tulis tidak didapat: aksi belum dijalankan, aman diulang
        const er = new Error((r && r.msg) || 'Terjadi kesalahan.'); er.server = true; throw er;
      } catch (e) {
        if (e.server || n >= (opt.retry || 0)) throw e;
        n++; await sleep_(900 * n);
      }
    }
  } finally { if (!opt.quiet) progress(false); }
}

function enqueue_(action, payload, opt) {
  return new Promise((res, rej) => { _q.push({ action: action, payload: payload, opt: opt, res: res, rej: rej }); if (!_qt) _qt = setTimeout(flush_, 0); });
}
async function flush_() {
  const q = _q.splice(0, BATCH_MAX); _qt = _q.length ? setTimeout(flush_, 0) : null;
  if (!q.length) return;
  const quiet = q.every(x => x.opt.quiet);
  if (q.length === 1) { try { q[0].res((await send_(q[0].action, q[0].payload, { quiet: quiet, retry: 1 })).data); } catch (e) { q[0].rej(e); } return; }
  try {
    const r = await send_('batch', { calls: q.map(x => ({ action: x.action, payload: x.payload })) }, { quiet: quiet, retry: 1 });
    q.forEach((x, i) => { const it = r.data[i]; if (it && it.ok) x.res(it.data); else x.rej(new Error((it && it.msg) || 'Gagal memuat data.')); });
  } catch (e) { q.forEach(x => x.rej(e)); }
}

/** Pintu tunggal untuk seluruh aplikasi: rpc('aksi', payload, {retry, quiet, fresh}) -> Promise(data). */
function rpc(action, payload, opt) {
  opt = opt || {};
  if (!READS[action]) {
    clearReadCache();
    return send_(action, payload, opt).then(r => { clearReadCache(); return r.data; }, e => { clearReadCache(); throw e; });
  }
  const k = action + '|' + JSON.stringify(payload || {});
  const hit = _rc[k];
  if (!opt.fresh && hit && Date.now() - hit.t < READ_TTL) return Promise.resolve(clone_(hit.v));
  if (!opt.fresh && _inf[k]) return _inf[k].then(clone_);
  const ep = _ep;
  const p = enqueue_(action, payload || {}, opt).then(v => { if (ep === _ep) _rc[k] = { t: Date.now(), v: v }; return v; });
  _inf[k] = p;
  const done = () => { if (_inf[k] === p) delete _inf[k]; };
  p.then(done, done);
  return p.then(clone_);
}
