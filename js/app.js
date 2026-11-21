'use strict';
/* =====================================================================
 * PORTAL INFORMATIKA — JavaScript.html
 * SPA murni (tanpa reload / redirect, aman di iframe) + Instant UX:
 *  - Seluruh data awal 1x panggilan (boot) + cache localStorage (SWR)
 *  - Navigasi & filter 100% lokal (0 ms), UI optimistik, sinkron latar
 * Hak cipta: Ufi Syaiful Ulum, Gr.
 * ===================================================================== */
let BOOT = {};   // diisi dari GET publicBoot (cache localStorage 'pj_pub')
const S = { token: null, d: null, cfg: BOOT.cfg || {}, route: '', hist: [], ui: { pg: {}, f: {} }, charts: {}, dirty: {}, pending: 0, clockSkew: 0 };
const R = {}, AFTER = {}, ACT = {}, IN = {}, CH = {};
let T = null;   // sesi tes aktif (diisi di bagian B)
const MADRASAH = "MA TAHFIDH PUTRI YANBU'UL QUR'AN 2 MURIA";

/* ---------- Util ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = n => '<i class="bi bi-' + n + '"></i>';
const avg = a => { a = a.filter(x => x != null && !isNaN(x)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
const num = (v, d) => v == null || isNaN(v) ? '–' : (Math.round(v * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d)).toString().replace('.', ',');
const fD = t => t ? new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
const fDT = t => t ? new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
const ago = t => { if (!t) return '–'; const s = Math.max(0, (Date.now() - t) / 1000); if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt lalu'; if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'; if (s < 604800) return Math.floor(s / 86400) + ' hari lalu'; return fD(t); };
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const debounce = (f, w) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), w || 250); }; };
const store = { m: {}, get(k) { try { return localStorage.getItem(k); } catch (e) { return this.m[k] || null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { this.m[k] = v; } }, del(k) { try { localStorage.removeItem(k); } catch (e) { delete this.m[k]; } } };
const jp = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const nowS = () => Date.now() + S.clockSkew;
const kls = id => { const k = S.d && S.d.kelas ? S.d.kelas.find(x => x.id === id) : null; return k ? k.nama : (id ? '?' : 'Semua kelas'); };
const shortM = (m, i) => { const x = /modul\s*0*(\d+)/i.exec(m.judul); return x ? 'Modul ' + String(x[1]).padStart(2, '0') : 'M' + (i + 1); };
const scCls = (v, kkm) => v == null ? 'n' : (v >= (kkm || 75) ? 'b' : 'c');

function toast(msg, type) {
  const el = document.createElement('div'); el.className = 'toast ' + (type || 'ok');
  el.innerHTML = ic(type === 'er' ? 'exclamation-octagon-fill' : 'check-circle-fill') + '<span>' + esc(msg) + '</span>';
  $('#toasts').appendChild(el); setTimeout(() => { el.style.opacity = 0; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, type === 'er' ? 5200 : 2800);
}
function busy(btn, on, txt) {
  if (!btn) return; if (on) { btn._h = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span><span>' + (txt || 'Memproses…') + '</span>'; }
  else { btn.disabled = false; if (btn._h != null) btn.innerHTML = btn._h; }
}

/* ---------- Progress bar (non-blocking). rpc() ada di js/api.js ---------- */
function progress(on) {
  S.pending += on ? 1 : -1; const b = $('#topbar-progress');
  if (S.pending > 0) { b.className = ''; void b.offsetWidth; b.className = 'on'; } else { S.pending = 0; b.className = 'done'; }
}

/* ---------- Tema ---------- */
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t); store.set('pj_theme', t);
  const b = $('#btnTheme'); if (b) b.innerHTML = ic(t === 'dark' ? 'sun' : 'moon-stars') + '<span>' + (t === 'dark' ? 'Mode Terang' : 'Mode Gelap') + '</span>';
  const mc = document.querySelector('meta[name=theme-color]'); if (mc) mc.content = t === 'dark' ? '#1B1450' : '#3B1FA3';
  Object.keys(S.charts).forEach(k => { try { S.charts[k].destroy(); } catch (e) { } delete S.charts[k]; });
  if (S.d) renderRoute(true);
}

/* ---------- Modal bertumpuk ---------- */
function modal(o) {
  const root = $('#modalRoot'), w = document.createElement('div'); w.className = 'mwrap'; w._o = o;
  w.innerHTML = '<div class="mback" ' + (o.noClose ? '' : 'data-close') + '></div><div class="modal ' + (o.size || '') + ' ' + (o.cls || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title || 'Dialog') + '">' +
    '<div class="mh">' + (o.head || '<h3>' + esc(o.title || '') + '</h3>') + (o.noClose ? '' : '<button class="ibtn" data-close aria-label="Tutup">' + ic('x-lg') + '</button>') + '</div>' +
    '<div class="mb">' + (o.body || '') + '</div>' + (o.foot ? '<div class="mf">' + o.foot + '</div>' : '') + '</div>';
  root.appendChild(w); root.classList.add('on');
  w.addEventListener('click', e => { if (e.target.closest('[data-close]')) { e.stopPropagation(); closeM(w, 'x'); } });
  const f = w.querySelector('[autofocus],input:not([type=hidden]),textarea,select'); if (f && !o.noFocus) setTimeout(() => f.focus({ preventScroll: true }), 60);
  return w;
}
function closeM(w, why) {
  if (!w || !w.isConnected) return;
  if (w._o && w._o.onClose && why !== 'force' && w._o.onClose(why) === false) return;
  w.remove(); const root = $('#modalRoot'); if (!root.children.length) root.classList.remove('on');
}
const topM = () => { const c = $('#modalRoot').children; return c.length ? c[c.length - 1] : null; };
function confirmBox(msg, o) {
  o = o || {};
  return new Promise(res => {
    const w = modal({ size: 'sm', title: o.title || 'Konfirmasi', body: '<p style="margin:0;font-size:14px">' + msg + '</p>', noFocus: true,
      foot: '<button class="btn btn-s" data-c="0">' + esc(o.no || 'Batal') + '</button><button class="btn ' + (o.danger ? 'btn-d' : 'btn-p') + '" data-c="1" autofocus>' + esc(o.ok || 'Ya, lanjutkan') + '</button>',
      onClose: () => { res(false); } });
    w.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { const v = b.dataset.c === '1'; w._o.onClose = null; closeM(w, 'force'); res(v); } });
    setTimeout(() => { const b = w.querySelector('[data-c="1"]'); if (b) b.focus(); }, 60);
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = topM(); if (m && !m._o.noClose) closeM(m, 'x'); } });

/* ---------- Delegasi event ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const fn = ACT[t.dataset.act]; if (fn) { e.preventDefault(); fn(t, e); }
  const pop = $('#pop'); if (pop && pop.classList.contains('on') && !t.closest('#pop')) pop.classList.remove('on');
});
document.addEventListener('input', e => { const t = e.target.closest('[data-in]'); if (t && IN[t.dataset.in]) IN[t.dataset.in](t, e); });
document.addEventListener('change', e => { const t = e.target.closest('[data-ch]'); if (t && CH[t.dataset.ch]) CH[t.dataset.ch](t, e); });
document.addEventListener('click', e => { const p = $('#pop'); if (p && p.classList.contains('on') && !e.target.closest('#pop,#btnBell,#btnUser')) p.classList.remove('on'); });

/* ---------- Pager lokal ---------- */
function paginate(key, arr, per) {
  per = per || 10; const pages = Math.max(1, Math.ceil(arr.length / per));
  let p = Math.min(S.ui.pg[key] || 1, pages); S.ui.pg[key] = p;
  const from = (p - 1) * per;
  let nums = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - p) <= 1) nums.push(i);
  let btn = '<button data-act="pg" data-k="' + key + '" data-p="' + (p - 1) + '" ' + (p <= 1 ? 'disabled' : '') + ' aria-label="Sebelumnya">' + ic('chevron-left') + '</button>', last = 0;
  nums.forEach(n => { if (n - last > 1) btn += '<span style="align-self:center">…</span>'; btn += '<button data-act="pg" data-k="' + key + '" data-p="' + n + '" class="' + (n === p ? 'on' : '') + '">' + n + '</button>'; last = n; });
  btn += '<button data-act="pg" data-k="' + key + '" data-p="' + (p + 1) + '" ' + (p >= pages ? 'disabled' : '') + ' aria-label="Berikutnya">' + ic('chevron-right') + '</button>';
  return { rows: arr.slice(from, from + per), html: '<div class="pager"><span>Menampilkan <b>' + (arr.length ? from + 1 : 0) + '–' + Math.min(arr.length, from + per) + '</b> dari <b>' + arr.length + '</b></span>' + (pages > 1 ? '<div class="pg">' + btn + '</div>' : '') + '</div>' };
}
ACT.pg = el => { S.ui.pg[el.dataset.k] = +el.dataset.p; renderRoute(true); };
const setF = (k, v) => { S.ui.f[k] = v; S.ui.pg = {}; };

/* ---------- Router SPA (client-side, 0 ms) ---------- */
const NAV = {
  murid: [['dashboard', 'Dashboard', 'grid-1x2'], ['materi', 'Materi', 'journal-bookmark'], ['tugas', 'Tugas', 'card-checklist'], ['absensi', 'Kehadiran', 'calendar-check'], ['nilai', 'Nilai', 'bar-chart-line']],
  guru: [['dashboard', 'Dashboard', 'grid-1x2'], ['materi', 'Materi', 'journal-bookmark'], ['pengumpulan', 'Tugas & Penilaian', 'inbox'], ['absensi', 'Absensi', 'calendar-check'], ['jurnal', 'Jurnal Harian', 'journal-text'], ['pengumuman', 'Pengumuman', 'megaphone'], ['nilai', 'Nilai & Laporan', 'bar-chart-line'], ['pengguna', 'Kelola Pengguna', 'people'], ['logtes', 'Log Keamanan Tes', 'shield-exclamation'], ['pengaturan', 'Pengaturan', 'gear']]
};
const TITLES = { dashboard: 'Dashboard', materi: 'Materi', materiDetail: 'Detail Materi', materiEditor: 'Editor Materi', tugas: 'Tugas', nilai: 'Nilai', absensi: 'Kehadiran', pengumuman: 'Pengumuman', jurnal: 'Jurnal Harian', pengumpulan: 'Tugas & Penilaian', pengguna: 'Kelola Pengguna', logtes: 'Log Keamanan Tes', pengaturan: 'Pengaturan' };
const PARENT = { materiDetail: 'materi', materiEditor: 'materi' };
const role = () => S.d ? S.d.role : null;

function buildShell() {
  const rts = NAV[role()].map(r => r[0]).concat(role() === 'murid' ? ['materiDetail'] : ['materiEditor']);
  $('#app-container').innerHTML = rts.map(r => '<section id="sec-' + r + '" class="sec" aria-label="' + TITLES[r] + '"></section>').join('');
  $('#nav').innerHTML = NAV[role()].map(r => '<a data-act="go" data-r="' + r[0] + '" data-nav="' + r[0] + '" role="link" tabindex="0" aria-label="' + r[1] + '">' + ic(r[2]) + '<span>' + r[1] + '</span><b class="bdg hide" id="bdg-' + r[0] + '"></b></a>').join('');
  $('#nav').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.act === 'go') { e.preventDefault(); e.target.click(); } };
}
ACT.go = el => go(el.dataset.r);
function go(route, params, noHist) {
  if (!S.d) return;
  if (params !== undefined) S.ui.params = params;
  if (!noHist && S.route && S.route !== route) S.hist.push(S.route);
  S.route = route;
  $$('.sec').forEach(s => s.classList.toggle('on', s.id === 'sec-' + route));
  const nav = PARENT[route] || route;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === nav));
  $('#pageTitle').textContent = TITLES[route] || '';
  renderRoute(true);
  closeDrawer(); window.scrollTo(0, 0); const c = $('#app-container'); if (c) c.scrollTop = 0;
}
function goBack() { const p = S.hist.pop() || 'dashboard'; go(p, undefined, true); }
ACT.back = () => goBack();
function renderRoute(force) {
  const r = S.route; if (!r || !R[r] || !S.d) return;
  const sec = $('#sec-' + r); if (!sec) return;
  const y = window.scrollY;
  try { sec.innerHTML = R[r](); if (AFTER[r]) AFTER[r](); } catch (e) { console.error(e); sec.innerHTML = '<div class="empty">' + ic('bug') + 'Gagal menampilkan halaman: ' + esc(e.message) + '</div>'; }
  if (!force) window.scrollTo(0, y);
  S.dirty = {};
}
function refreshUI() { renderRoute(false); updateBadges(); }

function openDrawer() { $('#sidebar').classList.add('open'); $('#scrim').classList.add('on'); }
function closeDrawer() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('on'); }

/* ---------- Badge & notifikasi ---------- */
function notifs() {
  const d = S.d, out = [];
  if (d.role === 'murid') {
    d.materi.forEach(m => { const st = stg(m);
      if (st.red) out.push({ ic: 'exclamation-triangle', c: 'r', t: 'Materi belum dibaca tuntas', s: m.judul, r: 'materiDetail', id: m.id, k: 'materi' });
      if (m.tugas && st.vis.tugas && !st.done.tugas && !st.lock.tugas) out.push({ ic: 'card-checklist', c: 'p', t: 'Tugas belum dikumpulkan', s: m.judul + (m.tugas.batas ? ' · batas ' + fD(m.tugas.batas) : ''), r: 'materiDetail', id: m.id, k: 'tugas' });
      const sb = d._s[m.tugas && m.tugas.id]; if (sb && sb.nilai != null) out.push({ ic: 'patch-check', c: 'g', t: 'Tugas sudah dinilai: ' + num(sb.nilai, 0), s: m.judul, r: 'materiDetail', id: m.id, k: 'tugas' });
    });
    tkPending().forEach(m => out.push({ ic: 'people', c: 'p', t: 'Tugas kelompok perlu dikirim (Anda ketua)', s: m.judul, r: 'tugas' }));
    (d.pengumuman || []).slice(0, 3).forEach(p => out.push({ ic: 'megaphone', c: p.penting ? 'r' : 'p', t: p.judul, s: 'Pengumuman', r: 'dashboard' }));
  } else {
    const nk = (d.submitK || []).filter(s => s.nilai == null).length; if (nk) out.push({ ic: 'people', c: 'p', t: nk + ' tugas kelompok perlu dinilai', s: 'Buka daftar penilaian', r: 'pengumpulan' });
    const n = d.submit.filter(s => s.nilai == null).length; if (n) out.push({ ic: 'inbox', c: 'p', t: n + ' tugas perlu dinilai', s: 'Buka daftar penilaian', r: 'pengumpulan' });
    const k = d.hasil.filter(h => h.status === 'keluar aplikasi').length; if (k) out.push({ ic: 'shield-exclamation', c: 'r', t: k + ' murid keluar aplikasi saat tes', s: 'Tinjau log keamanan', r: 'logtes' });
  }
  return out;
}
function updateBadges() {
  const d = S.d; if (!d) return;
  const n = notifs().length, b = $('#bellN'); b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hide', !n);
  const set = (id, v, red) => { const e = $('#bdg-' + id); if (!e) return; e.textContent = v; e.classList.toggle('hide', !v); e.classList.toggle('r', !!red); };
  if (d.role === 'murid') { set('materi', d.materi.filter(m => { const s = stg(m); return s.state === 'belum'; }).length ? d.materi.filter(m => stg(m).state === 'belum').length + ' Baru' : ''); set('tugas', (d.materi.filter(m => { const s = stg(m); return m.tugas && s.vis.tugas && !s.done.tugas; }).length + tkPending().length) || '', true); }
  else { set('pengumpulan', (d.submit.filter(s => s.nilai == null).length + (d.submitK || []).filter(s => s.nilai == null).length) || '', true); set('logtes', d.hasil.filter(h => h.status === 'keluar aplikasi').length || '', true); }
}
function showPop(html) { const p = $('#pop'); p.innerHTML = html; p.classList.add('on'); }
$('#btnBell').addEventListener('click', e => {
  e.stopPropagation(); const p = $('#pop'); if (p.classList.contains('on') && p.dataset.k === 'bell') return p.classList.remove('on');
  const l = notifs(); p.dataset.k = 'bell';
  showPop('<h6>Notifikasi</h6>' + (l.length ? l.map(n => '<div class="it" data-act="notif" data-r="' + n.r + '" data-id="' + esc(n.id || '') + '" data-k="' + (n.k || '') + '"><span class="act"><span class="ai" style="' + (n.c === 'r' ? 'background:var(--danger-bg);color:var(--danger)' : n.c === 'g' ? 'background:var(--ok-bg);color:var(--ok-tx)' : '') + '">' + ic(n.ic) + '</span></span><div><b style="display:block">' + esc(n.t) + '</b><span class="muted">' + esc(n.s) + '</span></div></div>').join('') : '<div class="empty" style="padding:20px">' + ic('bell-slash') + 'Tidak ada notifikasi baru</div>'));
});
ACT.notif = el => { $('#pop').classList.remove('on'); if (el.dataset.r === 'materiDetail') openDetail(el.dataset.id, el.dataset.k || null); else go(el.dataset.r); };
$('#btnUser').addEventListener('click', e => {
  e.stopPropagation(); const p = $('#pop'); if (p.classList.contains('on') && p.dataset.k === 'user') return p.classList.remove('on'); p.dataset.k = 'user';
  const u = S.d.me;
  if (S.imp) return showPop('<div class="it" data-act="keluarImp">' + ic('arrow-left-circle') + '<b>Kembali ke akun guru</b></div>');
  showPop('<div style="padding:10px 12px 8px"><b style="display:block">' + esc(u.nama) + '</b><span class="muted" style="font-size:12px">@' + esc(u.username) + '</span></div><div class="it" data-act="gantiSandi">' + ic('key') + '<b>Ganti sandi</b></div><div class="it" data-act="toggleTheme">' + ic('circle-half') + '<b>Ganti tema</b></div><div class="it" data-act="logout" style="color:var(--danger)">' + ic('box-arrow-left') + '<b>Keluar</b></div>');
});
ACT.toggleTheme = () => { $('#pop').classList.remove('on'); setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); };
$('#btnTheme').onclick = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
$('#btnHamb').onclick = openDrawer; $('#scrim').onclick = closeDrawer;
$('#btnLogout').onclick = () => confirmBox('Keluar dari akun ini?', { ok: 'Keluar', danger: true }).then(y => y && doLogout());
ACT.logout = () => { $('#pop').classList.remove('on'); $('#btnLogout').click(); };
$('#gSearch').addEventListener('input', debounce(e => {
  const q = e.target.value.trim(); if (!S.d) return;
  setF('mq', q); if (S.route !== 'materi') go('materi'); else renderRoute(false);
}, 200));

ACT.gantiSandi = () => {
  $('#pop').classList.remove('on');
  const w = modal({ size: 'sm', title: 'Ganti Sandi', body: '<div class="field"><label>Sandi lama</label><input id="pwOld" type="password" class="inp" autocomplete="current-password"></div><div class="field"><label>Sandi baru (min. 6 karakter)</label><input id="pwNew" type="password" class="inp" autocomplete="new-password"><div class="pw-meter"><i id="pwM"></i></div></div><div class="field"><label>Ulangi sandi baru</label><input id="pwNew2" type="password" class="inp" autocomplete="new-password"></div><div id="pwErr" class="ferr hide"></div>', foot: '<button class="btn btn-s" data-close>Batal</button><button class="btn btn-p" id="pwSave">Simpan</button>' });
  $('#pwNew', w).addEventListener('input', e => { const v = e.target.value; let s = 0; if (v.length >= 6) s++; if (v.length >= 9) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/\d/.test(v) && /[^\w]/.test(v)) s++; const m = $('#pwM', w); m.style.width = (s * 25) + '%'; m.style.background = ['#E5484D', '#E5484D', '#F59E0B', '#1FC98A', '#1FC98A'][s]; });
  $('#pwSave', w).onclick = async e => {
    const a = $('#pwOld', w).value, b = $('#pwNew', w).value, c = $('#pwNew2', w).value, er = $('#pwErr', w);
    er.classList.add('hide'); if (b.length < 6) { er.textContent = 'Sandi baru minimal 6 karakter.'; return er.classList.remove('hide'); }
    if (b !== c) { er.textContent = 'Konfirmasi sandi tidak sama.'; return er.classList.remove('hide'); }
    busy(e.currentTarget, true);
    try { await rpc('gantiSandi', { lama: a, baru: b }); S.d.me.wajibGanti = false; closeM(w, 'force'); toast('Sandi berhasil diganti'); }
    catch (x) { er.textContent = x.message; er.classList.remove('hide'); busy(e.currentTarget, false); }
  };
};

/* ---------- Identitas madrasah ---------- */
function applyIdentity() {
  const c = S.cfg || {};
  $$('[data-cfg]').forEach(e => { const v = c[e.dataset.cfg]; if (v) e.textContent = v; });
  $$('.yr').forEach(e => e.textContent = new Date().getFullYear());
  const nm = (c.namaApp || 'Portal Informatika') + ' — ' + (c.namaMadrasah || MADRASAH); document.title = nm;
  const cs = $('#chipSem'); if (cs) cs.textContent = 'Semester ' + (c.semester || '') + ' ' + (c.tahunAjaran || '');
}

/* ---------- Auth & boot (stale-while-revalidate) ---------- */
function showView(v) { ['viewSplash', 'viewLogin', 'viewApp'].forEach(x => $('#' + x).classList.toggle('hide', x !== v)); }
function startApp(boot, fromCache) {
  S.d = boot; S.cfg = boot.cfg || S.cfg; S.clockSkew = boot.serverNow ? boot.serverNow - Date.now() : S.clockSkew;
  if (boot.role === 'murid') idx();
  document.documentElement.dataset.role = boot.role;
  applyIdentity(); buildShell();
  const u = boot.me; $('#uAv').textContent = initials(u.nama); $('#uNm').textContent = u.nama;
  const rb = $('#uRole'); rb.textContent = boot.role === 'guru' ? 'Guru' : 'Murid · ' + (boot.kelasNama || ''); rb.className = 'role-badge' + (boot.role === 'guru' ? ' g' : '');
  showView('viewApp'); updateBadges();
  document.body.classList.toggle('imp', !!S.imp); $('#impBar').classList.toggle('hide', !S.imp); if (S.imp) $('#impNama').textContent = S.imp;
  if (!S.route || !$('#sec-' + S.route)) { S.route = ''; go('dashboard', undefined, true); }
  else { $$('.sec').forEach(s => s.classList.toggle('on', s.id === 'sec-' + S.route)); const nv = PARENT[S.route] || S.route; $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === nv)); $('#pageTitle').textContent = TITLES[S.route] || ''; renderRoute(false); }
  if (!fromCache && u.wajibGanti) setTimeout(() => { toast('Sandi Anda masih sandi awal. Segera ganti sandi.', 'er'); ACT.gantiSandi(); }, 600);
  schedPrefetch();
}
function saveCacheNow() { if (S.imp || !S.d) return; try { store.set('pj_boot', JSON.stringify({ t: S.token, d: S.d, at: Date.now() }, (k, v) => k[0] === '_' ? undefined : v)); } catch (e) { } }
const saveCache = debounce(saveCacheNow, 400);   // tidak memblokir UI saat banyak perubahan beruntun
document.addEventListener('visibilitychange', () => { if (document.hidden) saveCacheNow(); });
async function refresh(quiet) {
  try {
    const b = await rpc('boot'); const ae = document.activeElement;
    if (S.route === 'materiEditor' || topM() || T || (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.closest('#app-container'))) {
      S.d = b; S.cfg = b.cfg || S.cfg; S.clockSkew = b.serverNow - Date.now(); if (b.role === 'murid') idx(); saveCache(); updateBadges(); return;   // jangan ganggu form yang sedang dipakai
    }
    startApp(b, true); saveCache();
  }
  catch (e) { if (!quiet) toast(e.message, 'er'); }
}
async function doLogin(un, pw, btn) {
  const r = await rpc('login', { username: un, password: pw }); S.token = r.token; startApp(r.boot, false); saveCache();
}
function doLogout(silent, msg) {
  store.del('pj_boot'); if (window.clearReadCache) clearReadCache(); S.imp = null; S.back = null; document.body.classList.remove('imp'); S.token = null; S.d = null; S.route = ''; S.hist = [];
  Object.keys(S.charts).forEach(k => { try { S.charts[k].destroy(); } catch (e) { } }); S.charts = {};
  closeTestSilently && closeTestSilently(); $('#modalRoot').innerHTML = ''; $('#modalRoot').classList.remove('on');
  showView('viewLogin'); $('#lgPass').value = ''; if (msg) { const e = $('#lgErr'); e.textContent = msg; e.classList.remove('hide'); }
  if (!silent) toast('Anda telah keluar');
}
$('#lgEye').onclick = () => { const i = $('#lgPass'); const s = i.type === 'password'; i.type = s ? 'text' : 'password'; $('#lgEye').innerHTML = ic(s ? 'eye-slash' : 'eye'); };
$('#formLogin').addEventListener('submit', async e => {
  e.preventDefault(); const er = $('#lgErr'), btn = $('#lgBtn'); er.classList.add('hide');
  const un = $('#lgUser').value, pw = $('#lgPass').value; if (!un.trim() || !pw) { er.textContent = 'Isi username dan sandi.'; return er.classList.remove('hide'); }
  busy(btn, true, 'Masuk…');
  try { await doLogin(un, pw); } catch (x) { er.textContent = x.message; er.classList.remove('hide'); } finally { busy(btn, false); }
});
$('#goSetup').onclick = () => { $('#formLogin').classList.add('hide'); $('#formSetup').classList.remove('hide'); };
$('#goLogin').onclick = () => { $('#formSetup').classList.add('hide'); $('#formLogin').classList.remove('hide'); };
$('#formSetup').addEventListener('submit', async e => {
  e.preventDefault(); const er = $('#suErr'), btn = $('#suBtn'); er.classList.add('hide'); busy(btn, true, 'Membuat akun…');
  try { const r = await rpc('adminSetup', { kode: $('#suKode').value, nama: $('#suNama').value, username: $('#suUser').value, password: $('#suPass').value }); S.token = r.token; startApp(r.boot, false); saveCache(); toast('Akun guru dibuat. Selamat datang!'); }
  catch (x) { er.textContent = x.message; er.classList.remove('hide'); } finally { busy(btn, false); }
});

function applyPub(pub) { BOOT = pub || {}; if (BOOT.cfg) S.cfg = Object.assign({}, S.cfg, BOOT.cfg); applyIdentity(); }
function showLoginState() {
  const setupOpen = !$('#formSetup').classList.contains('hide');
  $('#notSetup').classList.toggle('hide', !!BOOT.setup);
  if (!setupOpen) $('#formLogin').classList.toggle('hide', !BOOT.setup);
  $('#firstRun').classList.toggle('hide', !BOOT.needsAdmin);
}
async function loadPub() {   // sekaligus menjadi "pemanasan" server (lapis 1 warmup)
  try { const p = await pubGet('publicBoot'); store.set('pj_pub', JSON.stringify(p)); applyPub(p); return true; } catch (e) { S.pubErr = e.message; return false; }
}
function splashError(msg) {
  const m = $('#splashMsg'); if (!m) return;
  m.innerHTML = '<span style="display:block;max-width:300px;margin:6px auto 12px">' + esc(msg) + '</span><button class="btn btn-s btn-sm" type="button" id="splashRetry">Coba lagi</button>';
  $('#splashRetry').onclick = () => { m.textContent = 'Memuat aplikasi…'; init(); };
}
function init() {
  setTheme(store.get('pj_theme') || 'light'); applyIdentity(); pwaUi();
  const pub = jp(store.get('pj_pub'), null); if (pub) applyPub(pub);
  const c = jp(store.get('pj_boot'), null);
  if (c && c.t && c.d && Date.now() - c.at < 11 * 3600 * 1000) {
    S.token = c.t; startApp(c.d, true);        // tampil INSTAN dari cache
    refresh(true); loadPub();                  // lalu sinkron di latar belakang
  } else if (pub) { showView('viewLogin'); showLoginState(); loadPub().then(() => showLoginState()); }
  else loadPub().then(ok => { if (!ok) return splashError(S.pubErr || 'Tidak dapat terhubung ke server.'); showView('viewLogin'); showLoginState(); });
}
window.addEventListener('online', () => { if (S.d) refresh(true); });

/* =====================================================================
 * BAGIAN B — Pustaka, kalkulasi, tampilan & alur MURID
 * ===================================================================== */
const LIBS = { chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js' };
const _libs = {};
function lib(n) {
  if (_libs[n]) return _libs[n];
  return (_libs[n] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = LIBS[n]; s.onload = res; s.onerror = () => { delete _libs[n]; rej(new Error('Gagal memuat pustaka ' + n + '. Periksa koneksi internet.')); }; document.head.appendChild(s); }));
}
const cv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function mkChart(id, cfg) {
  return lib('chart').then(() => {
    const el = document.getElementById(id); if (!el) return null;
    if (S.charts[id]) { try { S.charts[id].destroy(); } catch (e) { } }
    Chart.defaults.font.family = "'Plus Jakarta Sans',system-ui,sans-serif"; Chart.defaults.color = cv('--tx2');
    return (S.charts[id] = new Chart(el, cfg));
  }).catch(e => { const el = document.getElementById(id); if (el && el.parentNode) el.parentNode.innerHTML = '<div class="empty">' + ic('wifi-off') + 'Grafik gagal dimuat</div>'; });
}
ACT.toggleSeries = el => { const c = S.charts[el.dataset.c]; if (!c) return; const i = +el.dataset.i; c.setDatasetVisibility(i, !c.isDatasetVisible(i)); c.update(); el.style.opacity = c.isDatasetVisible(i) ? 1 : .4; };

/* ---------- Indeks & kalkulasi murid ---------- */
function idx() {
  const d = S.d; d._h = {}; d._p = {}; d._s = {};
  d.hasil.forEach(h => d._h[h.materiId + '|' + h.jenis] = h);
  d.progres.forEach(p => d._p[p.materiId] = p);
  d.submit.forEach(s => d._s[s.tugasId] = s);
  d._k = {}; (d.kelompok || []).forEach(g => d._k[g.tugasKId] = g);
  d._sk = {}; (d.submitK || []).forEach(s => d._sk[s.tugasKId] = s);
}
const NAMA = { pretes: 'Pretes', materi: 'Materi', tugas: 'Tugas', postes: 'Postes' };
const KEYS = ['pretes', 'materi', 'tugas', 'postes'];
function stg(m) {
  const d = S.d, hp = d._h[m.id + '|pretes'], hq = d._h[m.id + '|postes'], p = d._p[m.id], s = m.tugas ? d._s[m.tugas.id] : null;
  const vis = { pretes: !!m.tampilPretes && m.nPre > 0, materi: !!m.tampilMateri && m.konten.length > 0, tugas: !!m.tampilTugas && !!m.tugas, postes: !!m.tampilPostes && m.nPost > 0 };
  const done = { pretes: !!hp && hp.status !== 'berjalan', materi: !!p && p.status === 'sudah dipelajari', tugas: !!s, postes: !!hq && hq.status !== 'berjalan' };
  const lock = { pretes: false, materi: vis.pretes && !done.pretes, tugas: vis.materi && !done.materi, postes: vis.materi && !done.materi };
  const keys = KEYS.filter(k => vis[k]), nDone = keys.filter(k => done[k]).length;
  const state = !keys.length ? 'kosong' : nDone === keys.length ? 'selesai' : (nDone > 0 || p || (hp && hp.status === 'berjalan')) ? 'proses' : 'belum';
  return { vis, done, lock, keys, nDone, nTot: keys.length, pct: keys.length ? Math.round(nDone / keys.length * 100) : 0, state, red: vis.materi && !done.materi && !!p, next: keys.find(k => !done[k] && !lock[k]) || null, hp, hq, p, s };
}
const predikat = v => v == null ? '–' : v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : v >= 60 ? 'D' : 'E';
const totalMenit = m => m.konten.reduce((a, k) => a + (k.durasi || 0), 0);
const MICON = ['braces', 'database', 'shield-lock', 'cpu', 'diagram-3', 'globe2', 'code-slash', 'pc-display'];
const MCOL = ['#4F3FE0', '#F59E0B', '#1FC98A', '#4BA6F5', '#E5484D', '#8DC63F'];
const stat = (c, i, lb, v, sub) => '<div class="stat s-' + c + '"><div class="ico">' + ic(i) + '</div><div><div class="lb">' + lb + '</div><div class="v">' + v + '</div><div class="sub">' + sub + '</div></div></div>';
const donut = (p, c, lb) => { const C = 2 * Math.PI * 26; return '<div><div class="donut"><svg viewBox="0 0 62 62" aria-hidden="true"><circle cx="31" cy="31" r="26" fill="none" stroke="var(--bd-l)" stroke-width="7"/><circle cx="31" cy="31" r="26" fill="none" stroke="' + c + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (C * p / 100).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg><b>' + Math.round(p) + '%</b></div><span>' + lb + '</span></div>'; };
const emptyBox = (i, t) => '<div class="empty">' + ic(i) + t + '</div>';

function mLabel(st) { return st.state === 'selesai' ? '<span class="bd grn">' + ic('check2') + ' Selesai</span>' : st.red ? '<span class="bd red">Belum Dibaca</span>' : st.state === 'proses' ? '<span class="bd amb">Sedang Dipelajari</span>' : st.state === 'kosong' ? '<span class="bd gry">Belum ada konten</span>' : '<span class="bd gry">Belum Dimulai</span>'; }
function flowChips(st) { return st.keys.map(k => '<span class="' + (st.done[k] ? 'd' : (k === 'materi' && st.red) ? 'r' : st.next === k ? 'a' : '') + '">' + NAMA[k] + (k === 'materi' && st.red ? ' (wajib)' : '') + '</span>').join('<i class="bi bi-chevron-right"></i>') || '<span>Menu disembunyikan guru</span>'; }
function mCard(m, i) {
  const st = stg(m), col = MCOL[i % 6], cls = st.state === 'selesai' ? 'g' : st.red ? 'r' : st.state === 'proses' ? 'o' : '';
  const nm = nilaiMateri(m);
  return '<article class="card hov mcard"><div class="top"><div class="mi" style="background:' + col + '1F;color:' + col + '">' + ic(MICON[i % MICON.length]) + '</div><div style="flex:1;min-width:0"><div class="kode">' + shortM(m, i) + '</div><h4>' + esc(m.judul) + '</h4></div>' + mLabel(st) + '</div>' +
    '<p>' + esc(m.deskripsi || 'Belum ada deskripsi.') + '</p>' +
    '<div class="meta"><span>Progres: ' + st.nDone + '/' + st.nTot + ' tahap</span><b style="color:' + (st.red ? 'var(--danger)' : 'inherit') + '">' + st.pct + '%</b></div><div class="pbar ' + cls + '"><i style="width:' + st.pct + '%"></i></div>' +
    '<div class="flow">' + flowChips(st) + '</div>' +
    '<div class="foot"><span class="muted" style="font-size:12px">' + ic('clock') + ' ' + (totalMenit(m) ? totalMenit(m) + ' menit belajar' : 'Tanpa timer') + (nm.akhir != null ? ' · Nilai ' + num(nm.akhir, 0) : '') + '</span>' +
    '<button class="btn btn-sm ' + (st.state === 'selesai' ? 'btn-s' : 'btn-p') + '" data-act="openDetail" data-id="' + m.id + '">' + (st.state === 'selesai' ? 'Tinjau' : st.state === 'proses' ? 'Lanjutkan' : 'Buka Modul') + ' ' + ic('arrow-right-short') + '</button></div></article>';
}
ACT.openDetail = el => openDetail(el.dataset.id, el.dataset.st);
function openDetail(id, stage) { S.ui.mid = id; S.ui.stage = stage || null; S.ui.editTugas = false; go('materiDetail'); }

/* ---------- DASHBOARD MURID ---------- */
function dashMurid() {
  const d = S.d, me = d.me, L = d.materi.map((m, i) => ({ m, i, st: stg(m) }));
  const selesai = L.filter(x => x.st.state === 'selesai').length, nilaiAll = avg(L.map(x => nilaiMateri(x.m).akhir));
  const belum = L.filter(x => x.st.vis.materi && !x.st.done.materi).length;
  const pc = k => { const v = L.filter(x => x.st.vis[k]); return v.length ? v.filter(x => x.st.done[k]).length / v.length * 100 : 0; };
  const ev = [];
  d.hasil.filter(h => h.status !== 'berjalan' && h.selesai).forEach(h => { const m = d.materi.find(x => x.id === h.materiId); if (m) ev.push({ t: h.selesai, ic: h.status === 'keluar aplikasi' ? 'shield-exclamation' : 'check2-circle', bad: h.status === 'keluar aplikasi', b: NAMA[h.jenis] + ' ' + m.judul, s: (h.status === 'keluar aplikasi' ? 'Tes berakhir: keluar aplikasi · ' : '') + 'Nilai ' + num(h.nilai, 0) }); });
  d.submit.forEach(s => { const m = d.materi.find(x => x.id === s.materiId); if (m) ev.push({ t: s.dinilaiPada || s.waktuKirim, ic: s.nilai != null ? 'patch-check' : 'cloud-arrow-up', b: s.nilai != null ? 'Tugas dinilai: ' + m.judul : 'Tugas dikirim: ' + m.judul, s: s.nilai != null ? 'Nilai ' + num(s.nilai, 0) : 'Menunggu penilaian' }); });
  d.progres.filter(p => p.status === 'sudah dipelajari').forEach(p => { const m = d.materi.find(x => x.id === p.materiId); if (m) ev.push({ t: p.selesai, ic: 'journal-check', b: 'Selesai belajar: ' + m.judul, s: 'Durasi belajar terpenuhi' }); });
  ev.sort((a, b) => b.t - a.t);
  const red = L.filter(x => x.st.red)[0];
  const prio = L.slice().sort((a, b) => { const o = x => x.st.red ? 0 : x.st.state === 'proses' ? 1 : x.st.state === 'belum' ? 2 : 3; return o(a) - o(b) || a.i - b.i; });
  return pengumumanHtml() + '<div class="grid g4">' +
    stat('indigo', 'journal-text', 'Materi Selesai', selesai, 'dari ' + L.length + ' modul aktif') +
    stat('sky', 'check2-square', 'Tugas Terkumpul', d.submit.length + (d.submitK || []).length, d.submit.filter(s => s.nilai != null).length + (d.submitK || []).filter(s => s.nilai != null).length + ' sudah dinilai') +
    stat('emerald', 'award', 'Rata-rata Nilai', num(nilaiAll), nilaiAll != null ? 'Predikat ' + predikat(nilaiAll) : 'Muncul setelah pretes, tugas & postes selesai') +
    (belum ? stat('red', 'exclamation-circle', 'Materi Belum Dibaca', belum, 'Wajib dipelajari segera!') : stat('lime', 'check2-all', 'Materi Belum Dibaca', 0, 'Semua materi sudah dipelajari')) + '</div>' +
    '<div class="grid gmain rev mt"><div class="card"><div class="prof"><div class="av"><div>' + esc(initials(me.nama)) + '</div></div><h3 style="font-size:18px">' + esc(me.nama) + '</h3><div class="muted" style="font-size:12.5px;margin:2px 0 8px">Kelas ' + esc(d.kelasNama) + '</div>' + (me.nisn ? '<span class="bd pur">' + ic('shield-check') + ' NISN: ' + esc(me.nisn) + '</span>' : '') + '</div>' +
    '<div class="donuts mt">' + donut(pc('pretes'), 'var(--indigo)', 'Pretes') + donut(pc('materi'), 'var(--emerald)', 'Materi') + donut(pc('postes'), 'var(--sky)', 'Postes') + '</div>' +
    '<div class="card-h mt" style="margin-bottom:8px"><h3 style="font-size:15px">Aktivitas Terbaru</h3></div><div class="act-list">' +
    (red ? '<div class="act bad"><span class="ai">' + ic('exclamation-triangle') + '</span><div><b style="color:var(--danger)">Materi Belum Dibaca Tuntas</b><small>' + esc(red.m.judul) + '</small></div></div>' : '') +
    (ev.slice(0, 4).map(e => '<div class="act ' + (e.bad ? 'bad' : '') + '"><span class="ai">' + ic(e.ic) + '</span><div><b>' + esc(e.b) + '</b><small>' + esc(e.s) + ' · ' + ago(e.t) + '</small></div></div>').join('') || (red ? '' : '<div class="muted" style="font-size:12.5px;padding:6px">Belum ada aktivitas. Mulai dari materi pertama!</div>')) + '</div></div>' +
    '<div class="card"><div class="card-h"><div><h3>Perkembangan Nilai</h3><p>Pretes vs Postes per modul</p></div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="bd pur" style="cursor:pointer" data-act="toggleSeries" data-c="chNilai" data-i="0" aria-label="Tampilkan/sembunyikan Pretes"><i style="width:9px;height:9px;border-radius:50%;background:var(--indigo)"></i>Pretes</button><button class="bd grn" style="cursor:pointer" data-act="toggleSeries" data-c="chNilai" data-i="1" aria-label="Tampilkan/sembunyikan Postes"><i style="width:9px;height:9px;border-radius:50%;background:var(--emerald)"></i>Postes</button>' +
    '<select class="sel" style="min-height:38px;width:auto" data-ch="period" aria-label="Periode"><option value="0"' + (!S.ui.f.period ? ' selected' : '') + '>Semua modul</option><option value="5"' + (S.ui.f.period == 5 ? ' selected' : '') + '>5 modul terakhir</option><option value="3"' + (S.ui.f.period == 3 ? ' selected' : '') + '>3 modul terakhir</option></select></div></div>' +
    (L.some(x => nilaiMateri(x.m).pre != null || nilaiMateri(x.m).pos != null) ? '<div class="chartbox"><canvas id="chNilai" role="img" aria-label="Grafik perkembangan nilai pretes dan postes"></canvas></div>' : emptyBox('graph-up', 'Grafik muncul setelah Anda menyelesaikan pretes atau postes.')) +
    '<div class="grid g3 mt">' + (() => { const pr = avg(L.map(x => nilaiMateri(x.m).pre)), po = avg(L.map(x => nilaiMateri(x.m).pos)); const gains = L.map(x => { const n = nilaiMateri(x.m); return n.pre != null && n.pos != null ? { g: n.pos - n.pre, k: shortM(x.m, x.i) } : null; }).filter(Boolean).sort((a, b) => b.g - a.g)[0]; return '<div class="mini">' + ic('bar-chart-fill') + '<div><small>Rata-rata Pretes</small><b>' + num(pr) + ' / 100</b></div></div><div class="mini">' + ic('graph-up-arrow') + '<div><small>Rata-rata Postes</small><b>' + num(po) + ' / 100</b></div></div><div class="mini">' + ic('rocket-takeoff') + '<div><small>Kenaikan Tertinggi</small><b>' + (gains ? '+' + num(gains.g, 0) + ' pt (' + gains.k + ')' : '–') + '</b></div></div>'; })() + '</div></div></div>' +
    '<div class="card-h mt" style="margin:24px 0 12px;align-items:center"><h3 style="display:flex;gap:8px;align-items:center">' + ic('mortarboard') + ' Materi untuk Dipelajari</h3><a data-act="go" data-r="materi" style="cursor:pointer;font-weight:600">Lihat Semua (' + L.length + ') ' + ic('arrow-right-short') + '</a></div>' +
    (L.length ? '<div class="grid g3">' + prio.slice(0, 3).map(x => mCard(x.m, x.i)).join('') + '</div>' : emptyBox('journal-x', 'Belum ada materi untuk kelas Anda.')) +
    '<div class="alert info mt" style="margin-top:20px;margin-bottom:0"><i class="bi bi-shield-lock"></i><div><b style="color:var(--tx)">Integritas Ujian Digital &amp; Timer Pembelajaran</b><span>Waktu belajar dan tes dihitung langsung oleh server. Berpindah tab saat Pretes/Postes akan mengakhiri sesi tes Anda.</span></div></div>';
}
CH.period = el => { setF('period', +el.value); renderRoute(false); };
function drawMuridChart() {
  const d = S.d; let L = d.materi.map((m, i) => ({ m, i, n: nilaiMateri(m) })); const p = S.ui.f.period; if (p) L = L.slice(-p);
  if (!document.getElementById('chNilai')) return;
  const mk = (lb, c, key) => ({ label: lb, data: L.map(x => x.n[key]), borderColor: cv(c), backgroundColor: cv(c) + '22', pointBackgroundColor: '#fff', pointBorderColor: cv(c), pointBorderWidth: 3, pointRadius: 5, pointHoverRadius: 7, tension: .42, fill: key === 'pos', spanGaps: true, borderWidth: 3 });
  mkChart('chNilai', { type: 'line', data: { labels: L.map(x => shortM(x.m, x.i)), datasets: [mk('Pretes', '--indigo', 'pre'), mk('Postes', '--emerald', 'pos')] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { min: 0, max: 100, grid: { color: cv('--bd-l') }, ticks: { stepSize: 20 } }, x: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { backgroundColor: cv('--card'), titleColor: cv('--tx'), bodyColor: cv('--tx2'), borderColor: cv('--bd'), borderWidth: 1, padding: 12, cornerRadius: 12, callbacks: { afterBody: it => { const a = it.find(i => i.datasetIndex === 0), b = it.find(i => i.datasetIndex === 1); return a && b && a.raw != null && b.raw != null ? 'Peningkatan: ' + (b.raw - a.raw >= 0 ? '+' : '') + num(b.raw - a.raw, 0) + ' poin' : ''; } } } } } });
}

/* ---------- MATERI (murid: daftar) ---------- */
function materiMurid() {
  const q = (S.ui.f.mq || '').toLowerCase(), f = S.ui.f.mf || 'semua';
  let L = S.d.materi.map((m, i) => ({ m, i, st: stg(m) }));
  const cnt = k => L.filter(x => k === 'semua' ? true : k === 'belum' ? x.st.red || x.st.state === 'belum' : k === 'proses' ? x.st.state === 'proses' : x.st.state === 'selesai').length;
  L = L.filter(x => (!q || (x.m.judul + ' ' + x.m.deskripsi).toLowerCase().includes(q)) && (f === 'semua' || (f === 'belum' ? (x.st.red || x.st.state === 'belum') : f === 'proses' ? x.st.state === 'proses' : x.st.state === 'selesai')));
  return '<div class="page-head"><div><h1>Materi Pembelajaran</h1><p class="muted" style="margin:4px 0 0">Ikuti alur Pretes → Materi → Tugas → Postes pada tiap modul.</p></div></div>' +
    '<div class="tabs" role="tablist">' + [['semua', 'Semua'], ['belum', 'Belum Dibaca'], ['proses', 'Sedang Dipelajari'], ['selesai', 'Selesai']].map(t => '<button class="tab ' + (f === t[0] ? 'on' : '') + '" data-act="mf" data-v="' + t[0] + '" role="tab">' + t[1] + ' (' + cnt(t[0]) + ')</button>').join('') + '</div>' +
    (q ? '<p class="muted">Hasil pencarian untuk “<b>' + esc(q) + '</b>” · <a data-act="clearQ" style="cursor:pointer">hapus</a></p>' : '') +
    (L.length ? '<div class="grid g3">' + L.map(x => mCard(x.m, x.i)).join('') + '</div>' : emptyBox('search', 'Tidak ada materi yang cocok.'));
}
ACT.mf = el => { setF('mf', el.dataset.v); renderRoute(false); };
ACT.clearQ = () => { setF('mq', ''); $('#gSearch').value = ''; renderRoute(false); };

/* ---------- DETAIL MATERI (alur pembelajaran) ---------- */
function detailMateri() {
  const m = S.d.materi.find(x => x.id === S.ui.mid); if (!m) return emptyBox('journal-x', 'Materi tidak ditemukan atau disembunyikan guru.');
  const i = S.d.materi.indexOf(m), st = stg(m); let sel = S.ui.stage; if (!sel || !st.vis[sel]) sel = st.next || st.keys[0] || null;
  const stageRow = (k, n) => {
    const h = k === 'pretes' ? st.hp : k === 'postes' ? st.hq : null, run = h && h.status === 'berjalan';
    let tag = '', cls = '';
    if (st.lock[k]) { cls = 'lock'; tag = '<span class="bd gry">' + ic('lock') + ' Terkunci</span>'; }
    else if (k === 'materi' && st.red) { cls = 'warn'; tag = '<span class="bd red">Belum Tuntas</span>'; }
    else if (st.done[k]) { cls = 'done'; tag = '<span class="bd grn">' + (h ? 'Nilai: ' + num(h.nilai, 0) : (k === 'tugas' && st.s && st.s.nilai != null ? 'Nilai: ' + num(st.s.nilai, 0) : 'Selesai')) + '</span>'; }
    else if (run) tag = '<span class="bd amb">Sedang berjalan</span>';
    const sub = { pretes: m.nPre + ' soal pilihan ganda', materi: totalMenit(m) ? 'Wajib belajar ' + totalMenit(m) + ' menit' : 'Tanpa timer', tugas: m.tugas && m.tugas.batas ? 'Batas ' + fD(m.tugas.batas) : 'Kirim jawaban', postes: m.nPost + ' soal evaluasi' }[k];
    const icn = { pretes: 'clipboard2-check', materi: 'play-btn', tugas: 'journal-code', postes: 'patch-check' }[k];
    return '<button class="stage ' + cls + ' ' + (sel === k ? 'sel' : '') + '" data-act="stage" data-k="' + k + '"><span class="si">' + ic(st.done[k] ? 'check-lg' : st.lock[k] ? 'lock' : icn) + '</span><span style="flex:1;min-width:0"><small>Tahap ' + n + (st.next === k ? ' (Aktif)' : '') + '</small><b>' + { pretes: 'Pretes: Diagnostik Awal', materi: 'Materi: ' + esc(m.judul.replace(/^modul\s*\d+\s*:?\s*/i, '')), tugas: 'Tugas Praktik', postes: 'Postes: Uji Pemahaman' }[k] + '</b><em>' + sub + '</em></span>' + tag + '</button>';
  };
  let pane = emptyBox('eye-slash', 'Guru belum membuka tahap apa pun untuk modul ini.');
  if (sel === 'pretes' || sel === 'postes') pane = paneTes(m, st, sel); else if (sel === 'materi') pane = paneMateri(m, st); else if (sel === 'tugas') pane = paneTugas(m, st);
  return '<nav class="crumb"><a data-act="go" data-r="dashboard">' + ic('house') + ' Dashboard</a>/<a data-act="go" data-r="materi">Materi</a>/<b>' + esc(shortM(m, i)) + '</b></nav>' +
    (st.red ? '<div class="alert"><i class="bi bi-exclamation-triangle"></i><div><b>Peringatan: Materi Belum Dibaca Sesuai Ketentuan! <span class="bd red" style="margin-left:6px">Status: Belum Dibaca</span></b><span>Anda menutup materi sebelum durasi belajar minimum selesai. Selesaikan pemutaran materi minimal <b>' + totalMenit(m) + ' menit</b> secara penuh agar Tugas dan Postes terbuka.</span></div></div>' : '') +
    '<div class="card" style="margin-bottom:16px"><div class="grid gmain" style="align-items:center"><div><div class="flow" style="margin-bottom:8px"><span class="a">' + ic('people') + ' Kelas ' + esc(S.d.kelasNama) + '</span><span>' + ic('layers') + ' ' + st.nTot + ' tahap</span></div><h1 style="font-size:24px;line-height:1.25">' + esc(m.judul) + '</h1><p class="muted" style="margin:8px 0 0;max-width:720px">' + esc(m.deskripsi) + '</p></div><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px"><div class="mini"><div style="color:var(--ok-tx);font-size:20px">' + ic('check-circle') + '</div><div><small>Progres Alur</small><b>' + st.nDone + ' / ' + st.nTot + ' Selesai</b></div></div><div class="mini"><div style="color:var(--sky-tx);font-size:20px">' + ic('stopwatch') + '</div><div><small>Waktu Belajar</small><b>' + String(totalMenit(m)).padStart(2, '0') + ':00 Menit</b></div></div></div></div></div>' +
    '<div class="grid gdet"><div class="card"><div class="card-h"><h3>' + ic('diagram-3') + ' Alur Pembelajaran</h3><span class="bd pur">' + st.nDone + ' dari ' + st.nTot + '</span></div><div style="display:flex;flex-direction:column;gap:10px">' + st.keys.map((k, n) => stageRow(k, n + 1)).join('') + '</div>' +
    (st.vis.pretes || st.vis.postes ? '<div class="alert info" style="margin:14px 0 0"><i class="bi bi-shield-check"></i><div><b style="color:var(--tx);font-size:13px">Integritas Evaluasi</b><span>Durasi tonton &amp; perpindahan jendela tercatat otomatis di server.</span></div></div>' : '') + '</div>' +
    '<div class="card">' + pane + '</div></div>' +
    ((st.vis.pretes || st.vis.postes) ? '<div class="card mt"><div class="card-h"><div><h3>' + ic('shield-check') + ' Aturan Integritas &amp; Keamanan Tes</h3><p>Protokol pengerjaan Pretes &amp; Postes portal informatika</p></div><span class="bd red">Deteksi Otomatis Aktif</span></div><div class="grid g3"><div class="rule"><i class="bi bi-window-stack"></i><b>Dilarang Pindah Tab</b><span>Membuka tab/aplikasi lain akan memicu peringatan dan dapat mengakhiri tes.</span></div><div class="rule"><i class="bi bi-window-dash"></i><b>Dilarang Minimasi</b><span>Kehilangan fokus jendela dicatat sebagai pelanggaran integritas.</span></div><div class="rule"><i class="bi bi-server"></i><b>Penilaian Server</b><span>Jika keluar paksa, tes selesai otomatis dan hanya jawaban yang sudah terisi yang dinilai.</span></div></div></div>' : '');
}
R.materiDetail = detailMateri;
ACT.stage = el => { S.ui.stage = el.dataset.k; S.ui.editTugas = false; renderRoute(false); };

function lockMsg(why) { return '<div class="empty">' + ic('lock') + '<b style="color:var(--tx);display:block;margin-bottom:4px">Tahap masih terkunci</b>' + why + '</div>'; }
function paneTes(m, st, k) {
  const h = k === 'pretes' ? st.hp : st.hq, n = k === 'pretes' ? m.nPre : m.nPost, nm = k === 'pretes' ? 'Pretes' : 'Postes';
  const head = '<div class="card-h"><div><span class="eyebrow">' + nm + '</span><h3 style="font-size:19px">' + (k === 'pretes' ? 'Pretes: Diagnostik Awal' : 'Postes: Uji Pemahaman') + '</h3></div></div>';
  if (st.lock[k]) return head + lockMsg(k === 'postes' ? 'Selesaikan materi (durasi belajar penuh) terlebih dahulu.' : 'Selesaikan tahap sebelumnya terlebih dahulu.');
  if (h && h.status !== 'berjalan') {
    const bad = h.status === 'keluar aplikasi', to = h.status === 'waktu habis';
    return head + '<div class="grid g2"><div class="card" style="background:' + (bad ? 'var(--danger-bg)' : 'var(--ok-bg)') + ';box-shadow:none;text-align:center"><div class="muted" style="font-size:12px;font-weight:600">NILAI ANDA</div><div style="font-size:52px;font-weight:700;color:' + (bad ? 'var(--danger)' : 'var(--ok-tx)') + ';line-height:1.1">' + num(h.nilai, 0) + '</div><div class="muted">' + h.benar + ' benar dari ' + h.total + ' soal</div></div><div style="display:flex;flex-direction:column;gap:10px;justify-content:center"><div class="mini">' + ic('flag') + '<div><small>Status</small><b>' + (bad ? 'Berakhir: keluar aplikasi' : to ? 'Berakhir: waktu habis' : 'Selesai normal') + '</b></div></div><div class="mini">' + ic('calendar-check') + '<div><small>Selesai</small><b>' + fDT(h.selesai) + '</b></div></div>' + (h.pelanggaran ? '<div class="mini">' + ic('exclamation-triangle') + '<div><small>Pelanggaran tercatat</small><b>' + h.pelanggaran + 'x</b></div></div>' : '') + '</div></div><p class="muted" style="margin:14px 0 0;font-size:12.5px">Tes hanya dapat dikerjakan satu kali. Hubungi guru bila perlu pengulangan.</p>';
  }
  const run = h && h.status === 'berjalan';
  return head + '<div class="grid g3" style="margin-bottom:14px"><div class="mini">' + ic('list-check') + '<div><small>Jumlah soal</small><b>' + n + ' soal</b></div></div><div class="mini">' + ic('stopwatch') + '<div><small>Durasi</small><b>' + (m.durasiTes || 15) + ' menit</b></div></div><div class="mini">' + ic('shuffle') + '<div><small>Urutan soal</small><b>Diacak</b></div></div></div>' +
    '<div class="alert" style="margin-bottom:14px"><i class="bi bi-shield-exclamation"></i><div><b>Perhatian sebelum mulai</b><span>Jika keluar dari aplikasi (pindah tab, minimize, atau menutup halaman), tes akan selesai dan dicatat sebagai “keluar aplikasi”. Waktu dihitung server.</span></div></div>' +
    '<button class="btn ' + (run ? 'btn-ok' : 'btn-p') + '" data-act="mulaiTes" data-k="' + k + '" data-id="' + m.id + '">' + ic(run ? 'play-fill' : 'rocket-takeoff') + ' ' + (run ? 'Lanjutkan ' + nm : 'Mulai ' + nm) + '</button>';
}
function paneMateri(m, st) {
  const head = '<div class="card-h"><div><span class="eyebrow">Konten Materi</span><h3 style="font-size:19px">' + esc(m.judul) + '</h3></div>' + (totalMenit(m) ? '<span class="timer-chip">' + ic('stopwatch') + ' Wajib: ' + String(totalMenit(m)).padStart(2, '0') + ':00</span>' : '') + '</div>';
  if (st.lock.materi) return head + lockMsg('Kerjakan <b>Pretes</b> terlebih dahulu sebelum membuka materi.');
  const tIc = { youtube: ['youtube', '#E5484D'], pdf: ['file-earmark-pdf', '#E5484D'], ppt: ['file-earmark-slides', '#F59E0B'], dokumen: ['file-earmark-text', '#4BA6F5'], teks: ['card-text', '#4F3FE0'], link: ['link-45deg', '#4F3FE0'] };
  return head + '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">' + m.konten.map(k => { const t = tIc[k.tipe] || tIc.link; return '<div class="konten-item"><div class="ki" style="background:' + t[1] + '1F;color:' + t[1] + '">' + ic(t[0]) + '</div><div style="flex:1;min-width:0"><b class="ellip" style="display:block">' + esc(k.judul || 'Konten ' + k.urutan) + '</b><small class="muted">' + esc(k.tipe.toUpperCase()) + (k.durasi ? ' · ' + k.durasi + ' menit' : '') + '</small></div></div>'; }).join('') + '</div>' +
    '<div class="alert ' + (st.done.materi ? 'info' : '') + '" style="' + (st.done.materi ? '' : 'background:var(--warn-bg);border-color:rgba(245,158,11,.3);color:var(--warn-tx)') + '"><i class="bi bi-' + (st.done.materi ? 'check-circle' : 'hourglass-split') + '"></i><div><b>' + (st.done.materi ? 'Materi sudah dipelajari' : 'Instruksi Wajib Belajar') + '</b><span>' + (st.done.materi ? 'Anda dapat membuka kembali materi kapan saja tanpa timer.' : 'Materi tampil dalam jendela pop-up dengan hitung mundur dari server. Tombol <b>Selesai</b> baru muncul saat waktu habis. Menutup sebelum waktunya menandai materi sebagai <b style="color:var(--danger)">Belum Dibaca</b>.') + '</span></div></div>' +
    '<button class="btn ' + (st.done.materi ? 'btn-s' : 'btn-p') + '" data-act="bukaMateri" data-id="' + m.id + '">' + ic(st.done.materi ? 'arrow-repeat' : 'play-circle') + ' ' + (st.done.materi ? 'Buka Kembali Materi' : st.red ? 'Ulangi Belajar dari Awal' : 'Mulai Belajar') + '</button>';
}
function paneTugas(m, st) {
  const t = m.tugas, s = st.s, head = '<div class="card-h"><div><span class="eyebrow">Tugas Praktik</span><h3 style="font-size:19px">Tugas: ' + esc(m.judul) + '</h3></div>' + (s ? (s.nilai != null ? '<span class="bd grn">Dinilai: ' + num(s.nilai, 0) + ' / ' + t.nilaiMaks + '</span>' : '<span class="bd amb">Menunggu Penilaian</span>') : '<span class="bd gry">Belum dikumpulkan</span>') + '</div>';
  if (st.lock.tugas) return head + lockMsg('Selesaikan <b>Materi</b> (durasi belajar penuh) terlebih dahulu.');
  const late = t.batas && nowS() > t.batas;
  const info = '<div style="white-space:pre-wrap;background:var(--card-2);border-radius:14px;padding:14px;margin-bottom:12px">' + esc(t.instruksi) + '</div><div class="flow" style="margin-bottom:14px"><span class="a">Jawaban: ' + TIPE_LBL[t.tipeJawaban] + '</span>' + (t.batas ? '<span class="' + (late ? 'r' : '') + '">' + ic('calendar-event') + ' Batas ' + fDT(t.batas) + (late ? ' (lewat)' : '') + '</span>' : '') + '<span>Nilai maks. ' + t.nilaiMaks + '</span></div>';
  const F = tipeFlags(t.tipeJawaban), needImg = F.img, needTxt = F.txt, needFile = F.file;
  if (s && !S.ui.editTugas) {
    return head + info + '<div class="card" style="box-shadow:none;background:var(--card-2)"><b style="display:block;margin-bottom:8px">Jawaban Anda · ' + fDT(s.waktuKirim) + (t.batas && s.waktuKirim > t.batas ? ' <span class="bd red">Terlambat</span>' : '') + '</b>' + (isBerkas(s) ? berkasChip(s) : s.linkGambar ? '<img src="' + esc(s.linkGambar) + '" alt="Jawaban gambar" style="max-width:100%;max-height:300px;border-radius:12px;display:block;margin-bottom:10px" loading="lazy" referrerpolicy="no-referrer">' : '') + (s.deskripsi ? '<p style="white-space:pre-wrap;margin:0">' + esc(s.deskripsi) + '</p>' : '') +
      (s.nilai != null ? '<div class="alert info" style="margin:12px 0 0"><i class="bi bi-chat-square-text"></i><div><b style="color:var(--tx)">Catatan guru</b><span>' + esc(s.catatan || 'Tidak ada catatan.') + '</span></div></div>' : '') + '</div>' + (s.nilai == null ? '<button class="btn btn-s mt" data-act="editTugas">' + ic('pencil') + ' Ubah Jawaban</button>' : '');
  }
  return head + info + '<form id="tgForm" novalidate>' + (needImg ? '<div class="field"><label>Gambar jawaban (tangkapan layar / foto)</label><label class="drop" for="tgFile" id="tgDrop">' + ic('cloud-arrow-up') + ' <b>Pilih atau ambil foto</b><br><span class="muted" style="font-size:12px">Otomatis dikompres di browser (maks. 1280 px)</span><div id="tgPrev">' + (s && s.linkGambar && !isBerkas(s) ? '<img src="' + esc(s.linkGambar) + '" alt="Gambar sebelumnya" referrerpolicy="no-referrer">' : '') + '</div></label><input type="file" id="tgFile" accept="image/*" class="sr-only" data-ch="tgFile"></div>' : '') +
    (needFile ? fileField('tgBerkas', TG.berkas, s && isBerkas(s) ? berkasNama(s) : '') : '') +
    (needTxt ? '<div class="field"><label for="tgDesc">Deskripsi jawaban</label><textarea id="tgDesc" class="txa" placeholder="Jelaskan langkah dan hasil pengerjaan Anda…">' + esc(s ? s.deskripsi : '') + '</textarea></div>' : '') +
    '<div id="tgErr" class="ferr hide"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-p" type="submit" id="tgBtn" data-act="kirimTugas" data-t="' + t.id + '">' + ic('send') + ' ' + (s ? 'Kirim Ulang' : 'Kirim Tugas') + '</button>' + (s ? '<button class="btn btn-s" type="button" data-act="batalEditTugas">Batal</button>' : '') + '</div></form>';
}
const impBlock = () => { if (S.imp) { toast('Mode pantau guru: hanya dapat melihat.', 'er'); return true; } return false; };
ACT.editTugas = () => { if (impBlock()) return; S.ui.editTugas = true; TG = { img: null }; renderRoute(false); };
ACT.batalEditTugas = () => { S.ui.editTugas = false; renderRoute(false); };
let TG = { img: null };
CH.tgFile = async el => {
  const f = el.files[0]; if (!f) return; if (!/^image\//.test(f.type)) return toast('Berkas harus berupa gambar', 'er');
  try { TG.img = await compressImg(f); $('#tgPrev').innerHTML = '<img src="' + TG.img + '" alt="Pratinjau gambar">'; } catch (e) { toast('Gagal memproses gambar', 'er'); }
};
function compressImg(file, max) {
  max = max || 1280;
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { let w = im.width, h = im.height, k = Math.min(1, max / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
      let q = .82, out = c.toDataURL('image/jpeg', q); while (out.length > 1400000 && q > .4) { q -= .12; out = c.toDataURL('image/jpeg', q); }
      URL.revokeObjectURL(url); res(out); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); }; im.src = url;
  });
}
ACT.kirimTugas = async el => {
  if (impBlock()) return;
  const m = S.d.materi.find(x => x.id === S.ui.mid), t = m.tugas, er = $('#tgErr'); er.classList.add('hide');
  const desc = $('#tgDesc') ? $('#tgDesc').value.trim() : '', F = tipeFlags(t.tipeJawaban), needImg = F.img, needTxt = F.txt, needFile = F.file, old = S.d._s[t.id];
  const fail = x => { er.innerHTML = ic('exclamation-circle') + ' ' + esc(x); er.classList.remove('hide'); };
  if (needTxt && !desc) return fail('Deskripsi jawaban wajib diisi.');
  if (needImg && !TG.img && !(old && old.linkGambar && !isBerkas(old))) return fail('Gambar jawaban wajib diunggah.');
  if (needFile && !TG.berkas && !(old && isBerkas(old))) return fail('Berkas jawaban (PDF/PPT) wajib diunggah.');
  busy(el, true, TG.berkas ? 'Mengunggah berkas…' : 'Mengunggah…');
  try { const rec = await rpc('kirimTugas', { tugasId: t.id, deskripsi: desc, gambar: TG.img || '', berkas: TG.berkas ? { nama: TG.berkas.nama, data: TG.berkas.data } : null });
    S.d.submit = S.d.submit.filter(x => x.id !== rec.id).concat(rec); idx(); TG = { img: null }; S.ui.editTugas = false; saveCache(); updateBadges(); renderRoute(false); toast('Tugas berhasil dikirim'); }
  catch (x) { fail(x.message); busy(el, false); }
};
document.addEventListener('submit', e => { if (e.target.id === 'tgForm') { e.preventDefault(); const b = $('#tgBtn'); if (b) b.click(); } });

/* ---------- POP UP MATERI (timer dihitung server) ---------- */
function embedOf(k) {
  const l = String(k.link || '').trim(); if (k.tipe === 'teks') return { text: l }; let m;
  if ((m = l.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/))) return { src: 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0&modestbranding=1' };
  if ((m = l.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || l.match(/drive\.google\.com\/open\?id=([\w-]+)/))) return { src: 'https://drive.google.com/file/d/' + m[1] + '/preview' };
  if ((m = l.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]+)/))) return { src: 'https://docs.google.com/' + m[1] + '/d/' + m[2] + '/preview' };
  if (/^https:\/\//.test(l)) return { src: l };
  return { text: 'Tautan konten tidak valid. Hubungi guru.' };
}
function viewerHtml(k) { const e = embedOf(k); return e.text != null ? '<div class="txt">' + esc(e.text) + '</div>' : '<iframe src="' + esc(e.src) + '" title="' + esc(k.judul || 'Konten') + '" allow="autoplay; encrypted-media; fullscreen" allowfullscreen loading="lazy" referrerpolicy="no-referrer"></iframe>'; }
let MP = null;
ACT.bukaMateri = el => openMateri(el.dataset.id);
function openMateri(mid) {
  const m = S.d.materi.find(x => x.id === mid), st = stg(m); if (!m.konten.length) return toast('Belum ada konten materi.', 'er');
  const review = st.done.materi || !!S.imp; MP = { mid, review, ends: null, finished: review, w: null, tick: null };
  const tabs = m.konten.length > 1 ? '<div class="tabs" style="margin:0 0 10px">' + m.konten.map((k, i) => '<button class="tab ' + (i ? '' : 'on') + '" data-act="mpTab" data-i="' + i + '">' + esc(k.judul || 'Konten ' + (i + 1)) + '</button>').join('') + '</div>' : '';
  MP.w = modal({
    size: 'lg', noFocus: true, title: m.judul,
    head: '<div style="flex:1;min-width:0"><div class="eyebrow" style="margin:0 0 2px">Materi</div><h3 class="ellip">' + esc(m.judul) + '</h3></div>' + (review ? '' : '<span class="timer-chip" id="mpTimer">' + ic('stopwatch') + ' <span>menyiapkan…</span></span>'),
    body: '<div style="display:flex;flex-direction:column;height:100%">' + tabs + '<div class="viewer" id="mpView" style="flex:1">' + viewerHtml(m.konten[0]) + '</div></div>',
    foot: (review ? '<span class="muted" style="margin-right:auto">Mode tinjau — tanpa timer</span><button class="btn btn-s" data-close>Tutup</button>' : '<span class="muted" id="mpInfo" style="margin-right:auto;font-size:12.5px">' + ic('hourglass-split') + ' Tombol <b>Selesai</b> muncul saat waktu belajar habis.</span><button class="btn btn-ok hide" id="mpDone">' + ic('check2-circle') + ' Selesai Mempelajari</button>'),
    onClose: why => { if (why === 'force' || MP.finished) { clearInterval(MP.tick); MP = null; return true; } confirmBox('Waktu belajar belum selesai. Jika ditutup sekarang, materi ditandai <b style="color:var(--danger)">Belum Dibaca</b> dan Tugas/Postes tetap terkunci.', { title: 'Tutup materi?', ok: 'Tutup & tandai belum dibaca', no: 'Lanjut belajar', danger: true }).then(y => { if (y) closeM(MP.w, 'force'); }); return false; }
  });
  $('#mpView', MP.w).parentNode.style.height = '100%';
  if (review) return;
  const dn = $('#mpDone', MP.w); dn.onclick = () => finishMateri();
  // tandai lokal "belum dibaca" langsung (optimistik) agar status merah muncul bila ditutup dini
  if (!S.d._p[mid]) { const row = { id: S.d.me.id + '_' + mid, userId: S.d.me.id, materiId: mid, status: 'belum dibaca', mulai: nowS(), selesai: null }; S.d.progres.push(row); idx(); }
  const t0 = performance.now();
  rpc('startMateri', { materiId: mid }, { retry: 1 }).then(r => {
    if (!MP || MP.mid !== mid) return;
    if (r.selesai) { MP.finished = true; MP.review = true; $('#mpTimer', MP.w).remove(); dn.classList.add('hide'); $('#mpInfo', MP.w).innerHTML = 'Materi sudah tuntas.'; return; }
    const rtt = performance.now() - t0; MP.ends = performance.now() - rtt / 2 + r.sisaDetik * 1000 + 400; MP.tick = setInterval(mpTick, 250); mpTick();
  }).catch(e => { toast(e.message, 'er'); if (MP) { MP.finished = true; closeM(MP.w, 'force'); } });
}
ACT.mpTab = el => { const m = S.d.materi.find(x => x.id === MP.mid); $$('.tab', MP.w).forEach(b => b.classList.toggle('on', b === el)); $('#mpView', MP.w).innerHTML = viewerHtml(m.konten[+el.dataset.i]); };
function mpTick() {
  if (!MP || !MP.ends) return; const left = MP.ends - performance.now(), tm = $('#mpTimer', MP.w); if (!tm) return;
  tm.querySelector('span').textContent = left > 0 ? mmss(left) : '00:00'; tm.classList.toggle('low', left > 0 && left < 30000);
  if (left <= 0 && !MP.finished) { clearInterval(MP.tick); MP.ready = true; $('#mpDone', MP.w).classList.remove('hide'); $('#mpInfo', MP.w).innerHTML = ic('check-circle') + ' Waktu belajar terpenuhi. Klik <b>Selesai</b>.'; }
}
async function finishMateri() {
  const mid = MP.mid, btn = $('#mpDone', MP.w); busy(btn, true, 'Menyimpan…');
  try { const r = await rpc('selesaiMateri', { materiId: mid }, { retry: 1 });
    const p = S.d._p[mid]; if (p) { p.status = 'sudah dipelajari'; p.selesai = r.selesai; } idx(); MP.finished = true; closeM(MP.w, 'force'); saveCache(); updateBadges(); renderRoute(false); toast('Materi selesai dipelajari. Tahap berikutnya terbuka!');
  } catch (e) { busy(btn, false); toast(e.message, 'er'); }
}

/* ---------- RUANG TES (guard keluar aplikasi) ---------- */
ACT.mulaiTes = async el => {
  if (impBlock()) return; bellPrep();
  const k = el.dataset.k, id = el.dataset.id, m = S.d.materi.find(x => x.id === id), run = S.d._h[id + '|' + k] && S.d._h[id + '|' + k].status === 'berjalan';
  if (!run) { const y = await confirmBox('<b>Jika keluar dari aplikasi, tes akan selesai.</b><br><br>Pindah tab, minimize, atau menutup halaman akan dideteksi dan dicatat. Timer dihitung server dan tes hanya dapat dikerjakan satu kali. Siap memulai?', { title: 'Mulai ' + NAMA[k] + '?', ok: 'Mulai Tes', no: 'Nanti dulu' }); if (!y) return; }
  openTestShell(m, k);
  try {
    const r = await rpc('startTes', { materiId: id, jenis: k }, { retry: 1 });
    const bk = jp(store.get('pj_ans_' + r.hasilId), {});
    T = { mid: id, jenis: k, hasilId: r.hasilId, judul: r.judul, soal: r.soal, ans: Object.assign({}, bk, r.jawaban), i: 0, ends: performance.now() + r.sisaMs, tol: r.toleransi, viol: r.pelanggaran, ended: false, leaving: 0, tick: null };
    if (!S.d._h[id + '|' + k]) { const row = { id: r.hasilId, materiId: id, jenis: k, nilai: null, status: 'berjalan', mulai: nowS(), selesai: null, benar: 0, total: r.soal.length, pelanggaran: r.pelanggaran, durasi: m.durasiTes }; S.d.hasil.push(row); idx(); }
    renderTest(); T.tick = setInterval(testTick, 500); testTick();
  } catch (e) { closeTestSilently(); toast(e.message, 'er'); refresh(true); }
};
function openTestShell(m, k) {
  const t = $('#testRoot'); t.classList.add('on'); document.body.style.overflow = 'hidden';
  t.innerHTML = '<div class="th"><div class="brand-logo" style="width:36px;height:36px;box-shadow:none;border:1px solid var(--bd)"><svg style="width:24px;height:24px"><use href="#logo"/></svg></div><div style="flex:1;min-width:0"><div class="eyebrow" style="margin:0">' + NAMA[k] + '</div><b class="ellip" style="display:block">' + esc(m.judul) + '</b></div><span class="timer-chip" id="tmr">' + ic('stopwatch') + ' <span>--:--</span></span></div><div class="tb2"><div class="qwrap"><div class="skel" style="height:34px;width:60%;margin-bottom:16px"></div><div class="skel" style="height:90px;margin-bottom:14px"></div><div class="skel" style="height:56px;margin-bottom:10px"></div><div class="skel" style="height:56px;margin-bottom:10px"></div><div class="skel" style="height:56px"></div></div></div>';
}
function closeTestSilently() { if (T && T.tick) clearInterval(T.tick); T = null; const t = $('#testRoot'); if (t) { t.classList.remove('on'); t.innerHTML = ''; } document.body.style.overflow = ''; }
function renderTest() {
  if (!T) return; const q = T.soal[T.i], n = T.soal.length, done = Object.keys(T.ans).filter(k => T.soal.some(s => s.id === k)).length;
  $('#testRoot .tb2').innerHTML = '<div class="qwrap"><div class="qnav" style="margin-bottom:16px" role="navigation" aria-label="Navigasi soal">' + T.soal.map((s, i) => '<button data-act="tq" data-i="' + i + '" class="' + (T.ans[s.id] ? 'ans ' : '') + (i === T.i ? 'cur' : '') + '" aria-label="Soal ' + (i + 1) + '">' + (i + 1) + '</button>').join('') + '</div>' +
    '<div class="card" style="margin-bottom:14px"><div class="muted" style="font-size:12px;font-weight:700;letter-spacing:.05em;margin-bottom:6px">SOAL ' + (T.i + 1) + ' DARI ' + n + '</div><div style="font-size:17px;font-weight:600;line-height:1.55;white-space:pre-wrap">' + esc(q.q) + '</div></div>' +
    ['A', 'B', 'C', 'D'].filter(o => q.o[o]).map(o => '<button class="opt ' + (T.ans[q.id] === o ? 'sel' : '') + '" data-act="tpick" data-o="' + o + '" role="radio" aria-checked="' + (T.ans[q.id] === o) + '"><span class="l">' + o + '</span><span style="flex:1;padding-top:3px">' + esc(q.o[o]) + '</span></button>').join('') + '</div>';
  $('#testRoot').insertAdjacentHTML('beforeend', ''); let tf = $('#testRoot .tf'); if (tf) tf.remove();
  $('#testRoot').insertAdjacentHTML('beforeend', '<div class="tf"><button class="btn btn-s" data-act="tprev" ' + (T.i ? '' : 'disabled') + '>' + ic('chevron-left') + ' Sebelumnya</button><span class="muted fw6" id="tAns">' + done + ' / ' + n + ' terjawab</span>' + (T.i < n - 1 ? '<button class="btn btn-p" data-act="tnext">Berikutnya ' + ic('chevron-right') + '</button>' : '<button class="btn btn-d" data-act="tfinish">' + ic('flag') + ' Selesaikan Tes</button>') + '</div>');
}
ACT.tq = el => { T.i = +el.dataset.i; renderTest(); };
ACT.tprev = () => { if (T.i > 0) { T.i--; renderTest(); } };
ACT.tnext = () => { if (T.i < T.soal.length - 1) { T.i++; renderTest(); } };
ACT.tpick = el => { const q = T.soal[T.i]; T.ans[q.id] = el.dataset.o; store.set('pj_ans_' + T.hasilId, JSON.stringify(T.ans)); renderTest(); };
ACT.tfinish = async () => {
  const un = T.soal.length - Object.keys(T.ans).filter(k => T.soal.some(s => s.id === k)).length;
  const y = await confirmBox(un ? 'Masih ada <b>' + un + ' soal belum dijawab</b> (dinilai salah). Akhiri tes sekarang?' : 'Akhiri tes dan kirim semua jawaban?', { title: 'Selesaikan tes?', ok: 'Ya, selesaikan' }); if (y) finishTest('selesai');
};
function testTick() {
  if (!T) return; const left = T.ends - performance.now(), tm = $('#tmr'); if (tm) { tm.querySelector('span').textContent = mmss(left); tm.classList.toggle('low', left < 60000); }
  if (left <= 0 && !T.ended && !T.finishing) { toast('Waktu habis. Jawaban dikirim otomatis.', 'er'); finishTest('waktu'); }
}
async function finishTest() {
  if (!T || T.finishing) return; T.finishing = true; T.ended = true; clearInterval(T.tick);
  const t = T; const tf = $('#testRoot .tf'); if (tf) tf.innerHTML = '<span class="muted"><span class="spin"></span> Mengirim & menilai di server…</span>';
  try { const r = await rpc('submitTes', { hasilId: t.hasilId, jawaban: t.ans }, { retry: 3 }); applyHasil(t, r); store.del('pj_ans_' + t.hasilId); closeTestSilently(); showTestResult(r, t); }
  catch (e) { T = t; T.finishing = false; T.ended = false; T.tick = setInterval(testTick, 500); toast(e.message + ' — coba lagi.', 'er'); renderTest(); }
}
function applyHasil(t, r) {
  const h = S.d._h[t.mid + '|' + t.jenis]; if (h) { h.nilai = r.nilai; h.status = r.status; h.selesai = nowS(); h.benar = r.benar; h.total = r.total; if (r.pelanggaran != null) h.pelanggaran = r.pelanggaran; }
  idx(); saveCache(); updateBadges(); renderRoute(false);
}
function showTestResult(r, t) {
  const bad = r.status === 'keluar aplikasi', to = r.status === 'waktu habis';
  modal({ size: 'sm', noClose: true, cls: bad ? 'mdanger' : '', title: 'Hasil tes', body: '<div style="text-align:center"><div class="warn-ico" style="' + (bad ? '' : 'background:var(--ok-bg);color:var(--ok-tx)') + '">' + ic(bad ? 'shield-x' : 'patch-check') + '</div><h3 style="font-size:20px">' + (bad ? 'Tes Diakhiri: Keluar Aplikasi' : to ? 'Waktu Habis' : 'Tes Selesai') + '</h3><div style="font-size:54px;font-weight:700;line-height:1.2;color:' + (bad ? 'var(--danger)' : 'var(--ok-tx)') + '">' + num(r.nilai, 0) + '</div><p class="muted" style="margin:0">' + r.benar + ' benar dari ' + r.total + ' soal' + (bad ? '. Hanya soal yang sudah dijawab yang dinilai dan kejadian ini tercatat di log guru.' : '.') + '</p></div>', foot: '<button class="btn btn-p btn-block" data-close>Kembali ke Modul</button>' });
}
/* Deteksi keluar: pindah tab / minimize / blur / tutup halaman */
function onLeave(kind) {
  if (!T || T.ended || T.leaving || T.finishing || !T.soal) return; T.leaving = Date.now();
  T.cnt = (T.cnt == null ? T.viol : T.cnt) + 1; if (T.cnt === 2 && !ringBell()) T.belPend = true;   // bel sekali, tepat pada pelanggaran ke-2
  const t = T; t.rep = rpc('laporPelanggaran', { hasilId: t.hasilId, jawaban: t.ans, jenis: kind }, { retry: 2 }).catch(() => ({ offline: true }));
}
function onReturn() {
  if (!T || !T.leaving || T.finishing) return; const t = T; t.leaving = 0; if (t.belPend) { t.belPend = false; ringBell(); } if (t.warnOpen) return; t.warnOpen = true;
  Promise.resolve(t.rep).then(r => {
    if (!r || r.offline) { t.viol++; r = { ended: t.viol > t.tol, pelanggaran: t.viol, toleransi: t.tol }; if (r.ended) return finishTest('keluar'); }
    t.viol = r.pelanggaran != null ? r.pelanggaran : t.viol + 1;
    if (r.ended) { t.ended = true; clearInterval(t.tick); const rr = { nilai: r.nilai, benar: r.benar, total: r.total, status: 'keluar aplikasi', pelanggaran: r.pelanggaran }; applyHasil(t, rr); store.del('pj_ans_' + t.hasilId); closeTestSilently(); return showTestResult(rr, t); }
    const w = modal({ size: 'sm', noClose: true, cls: 'mdanger', title: 'Peringatan', body: '<div style="text-align:center"><div class="warn-ico">' + ic('shield-x') + '</div><span class="bd red" style="margin-bottom:10px">PELANGGARAN INTEGRITAS TERDETEKSI</span><h3 style="font-size:20px;margin:8px 0 12px">Peringatan: Upaya Keluar Aplikasi Terdeteksi!</h3><div class="alert" style="margin:0 0 12px;text-align:left"><i class="bi bi-lock"></i><div><b style="font-size:13.5px">“Jika keluar dari aplikasi, tes akan selesai.”</b></div></div><div class="mini" style="justify-content:space-between;margin-bottom:12px"><span>Toleransi pelanggaran</span><span class="bd red">' + t.viol + ' / ' + (t.tol + 1) + ' kesempatan</span></div><p class="muted" style="font-size:12.5px;margin:0">Jika Anda beralih jendela <b>sekali lagi</b>, sesi tes ditutup otomatis oleh server dan hanya soal yang sudah tersimpan yang dinilai. Kejadian ini tercatat di Log Guru.</p></div>', foot: '<button class="btn btn-p btn-block" data-close id="wBack">' + ic('unlock') + ' Kembali Lanjutkan Tes</button>', onClose: () => { t.warnOpen = false; return true; } });
  });
}
document.addEventListener('visibilitychange', () => document.hidden ? onLeave('tab') : onReturn());
window.addEventListener('blur', () => { if (!T) return; setTimeout(() => { if (T && !document.hasFocus() && !document.hidden) onLeave('blur'); }, 700); });
window.addEventListener('focus', () => onReturn());
window.addEventListener('pagehide', () => { if (T && !T.ended) onLeave('unload'); });
window.addEventListener('beforeunload', e => { if (T && !T.ended) { e.preventDefault(); e.returnValue = 'Jika keluar dari aplikasi, tes akan selesai.'; return e.returnValue; } });
document.addEventListener('contextmenu', e => { if (T) e.preventDefault(); });

/* ---------- TUGAS (murid: daftar) ---------- */
function tugasPribadiMurid() {
  const L = S.d.materi.map((m, i) => ({ m, i, st: stg(m) })).filter(x => x.m.tugas && x.st.vis.tugas);
  const rows = L.map(x => { const t = x.m.tugas, s = x.st.s, late = t.batas && nowS() > t.batas;
    const stt = s ? (s.nilai != null ? '<span class="bd grn">Dinilai</span>' : '<span class="bd amb">Menunggu Penilaian</span>') : x.st.lock.tugas ? '<span class="bd gry">' + ic('lock') + ' Terkunci</span>' : late ? '<span class="bd red">Terlambat</span>' : '<span class="bd blu">Belum dikumpulkan</span>';
    return '<tr class="hv"><td><b>' + esc(x.m.judul) + '</b><br><small class="muted">' + esc((t.instruksi || '').slice(0, 90)) + (t.instruksi.length > 90 ? '…' : '') + '</small></td><td>' + (t.batas ? fD(t.batas) : '–') + '</td><td>' + stt + '</td><td class="num">' + (s && s.nilai != null ? num(s.nilai, 0) + ' / ' + t.nilaiMaks : '–') + '</td><td><button class="btn btn-sm ' + (s ? 'btn-s' : 'btn-p') + '" data-act="openDetail" data-id="' + x.m.id + '" data-st="tugas">' + (s ? 'Lihat' : 'Kerjakan') + '</button></td></tr>'; });
  return '<div class="card">' +
    (L.length ? '<div class="tw"><table class="tb"><thead><tr><th>Tugas / Materi</th><th>Batas</th><th>Status</th><th>Nilai</th><th></th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : emptyBox('card-checklist', 'Belum ada tugas yang dibuka guru.')) + '</div>';
}

/* ---------- NILAI (murid) ---------- */
function nilaiMuridModul() {
  const d = S.d, kkm = S.cfg.kkm, L = d.materi.map((m, i) => ({ m, i, n: nilaiMateri(m), st: stg(m) }));
  const pr = avg(L.map(x => x.n.pre)), po = avg(L.map(x => x.n.pos)), fin = avg(L.map(x => x.n.akhir));
  const tuntas = L.filter(x => x.n.akhir != null && x.n.akhir >= kkm).length, patuh = L.length ? Math.round(L.filter(x => x.st.state === 'selesai').length / L.length * 100) : 0;
  const keluar = d.hasil.filter(h => h.status === 'keluar aplikasi').length;
  return '<div class="page-head"><div><nav class="crumb" style="margin:0 0 4px">Evaluasi Akademik / Transkrip</nav><h1>Capaian Belajar &amp; Rekap Nilai</h1></div><div class="acts"><button class="btn btn-s" data-act="expXlsx" data-m="murid">' + ic('file-earmark-excel') + ' Ekspor Excel</button><button class="btn btn-p" data-act="expPdf" data-m="murid">' + ic('file-earmark-pdf') + ' Unduh PDF</button></div></div>' +
    '<div class="grid g3">' + stat('indigo', 'bar-chart', 'Rata-rata Pretes', num(pr), 'Baseline awal · KKM ' + kkm) + stat('sky', 'graph-up-arrow', 'Rata-rata Postes', num(po), pr != null && po != null ? (po - pr >= 0 ? '+' : '') + num(po - pr) + ' poin dari pretes' : 'Belum ada data') + stat('emerald', 'check2-circle', 'Kepatuhan Belajar', patuh + '%', tuntas + ' modul tuntas · ' + keluar + ' pelanggaran tes') + '</div>' +
    '<div class="card mt"><div class="card-h"><div><h3>' + ic('bar-chart-steps') + ' Analisis Komparasi Pretes vs Postes</h3><p>Garis putus-putus menandai KKM (' + kkm + ')</p></div><div class="legend"><span><i style="background:#7C6CF0"></i>Pretes</span><span><i style="background:var(--emerald)"></i>Postes</span></div></div>' +
    (L.length ? '<div class="chartbox"><canvas id="chBar" role="img" aria-label="Grafik batang pretes dan postes per modul"></canvas></div>' : emptyBox('bar-chart', 'Belum ada modul.')) + '</div>' +
    '<div class="card mt"><div class="card-h"><div><h3>' + ic('list-columns-reverse') + ' Rincian Nilai &amp; Status Materi per Modul</h3><p>Nilai akhir = Pretes ' + S.cfg.bobotPretes + '% + Tugas ' + S.cfg.bobotTugas + '% + Postes ' + S.cfg.bobotPostes + '%. Muncul setelah Pretes, Tugas (pribadi &amp; kelompok), dan Postes yang diaktifkan guru selesai dan dinilai.</p></div></div><div class="tw"><table class="tb"><thead><tr><th>Modul</th><th>Status Mempelajari</th><th>Pretes</th><th>Tugas</th><th>Postes</th><th>Nilai Akhir</th><th>Kelulusan</th></tr></thead><tbody>' +
    L.map(x => { const sc = (v, tag) => '<span class="sc ' + (tag || scCls(v, kkm)) + '">' + (v == null ? '–' : num(v)) + '</span>'; return '<tr class="hv ' + (x.st.red ? 'hl' : '') + '"><td><b>' + esc(x.m.judul) + '</b></td><td>' + (x.st.vis.materi ? (x.st.done.materi ? '<span class="bd grn">Tuntas (' + totalMenit(x.m) + ' mnt)</span>' : x.st.red ? '<span class="bd red">Belum Dibaca</span>' : '<span class="bd gry">Belum</span>') : '<span class="muted3">–</span>') + '</td><td>' + sc(x.n.pre, 'a') + '</td><td>' + sc(x.n.tug) + '</td><td>' + sc(x.n.pos) + '</td><td>' + akhirCell(x.n) + '</td><td>' + (x.n.akhir == null ? '<span class="bd gry">Belum lengkap</span>' : x.n.akhir >= kkm ? '<span class="bd grn">TUNTAS</span>' : '<span class="bd red">REMEDIAL</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
    '<div class="alert info" style="margin:14px 0 0"><i class="bi bi-award"></i><div><b style="color:var(--tx)">Rata-rata nilai akhir: ' + num(fin) + ' (Predikat ' + predikat(fin) + ')</b><span>' + tuntas + ' dari ' + L.length + ' modul telah mencapai KKM.</span></div></div></div>';
}
function drawBar() {
  const kkm = S.cfg.kkm, L = S.d.materi.map((m, i) => ({ m, i, n: nilaiMateri(m) })); if (!document.getElementById('chBar')) return;
  mkChart('chBar', { data: { labels: L.map(x => shortM(x.m, x.i)), datasets: [{ type: 'bar', label: 'Pretes', data: L.map(x => x.n.pre), backgroundColor: '#7C6CF0', borderRadius: 8, maxBarThickness: 28 }, { type: 'bar', label: 'Postes', data: L.map(x => x.n.pos), backgroundColor: cv('--emerald'), borderRadius: 8, maxBarThickness: 28 }, { type: 'line', label: 'KKM', data: L.map(() => kkm), borderColor: cv('--danger'), borderDash: [6, 5], pointRadius: 0, borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100, grid: { color: cv('--bd-l') } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } } });
}


/* =====================================================================
 * REVISI 3 (murid) — nilai akhir lengkap, tugas kelompok, pengumuman, bel
 * ===================================================================== */
/** Nilai akhir HANYA keluar bila semua tahap bernilai yang diaktifkan guru sudah selesai & dinilai. */
function hitungAkhir(m, o) {
  const c = S.cfg, vis = { pretes: !!m.tampilPretes && m.nPre > 0, postes: !!m.tampilPostes && m.nPost > 0, tugas: !!m.tampilTugas && !!m.tugas, kel: !!(m.tugasK && m.tugasK.aktif) }, kurang = [];
  const pre = vis.pretes && o.hp && o.hp.status !== 'berjalan' ? o.hp.nilai : null; if (vis.pretes && pre == null) kurang.push(o.hp ? 'Pretes (sedang berjalan)' : 'Pretes');
  const pos = vis.postes && o.hq && o.hq.status !== 'berjalan' ? o.hq.nilai : null; if (vis.postes && pos == null) kurang.push(o.hq ? 'Postes (sedang berjalan)' : 'Postes');
  const tp = vis.tugas && o.s && o.s.nilai != null ? o.s.nilai / (m.tugas.nilaiMaks || 100) * 100 : null; if (vis.tugas && tp == null) kurang.push(o.s ? 'Tugas (menunggu penilaian)' : 'Tugas');
  const sk = o.sk || {}, tk = vis.kel && sk.nilai != null ? sk.nilai / (m.tugasK.nilaiMaks || 100) * 100 : null;
  if (vis.kel && tk == null) kurang.push(!sk.has ? 'Tugas Kelompok (belum masuk kelompok)' : sk.sub ? 'Tugas Kelompok (menunggu penilaian)' : 'Tugas Kelompok');
  const tg = avg([tp, tk]), komp = [];
  if (vis.pretes) komp.push([pre, c.bobotPretes]); if (vis.tugas || vis.kel) komp.push([tg, c.bobotTugas]); if (vis.postes) komp.push([pos, c.bobotPostes]);
  const lengkap = komp.length > 0 && kurang.length === 0, w = komp.reduce((a, x) => a + x[1], 0);
  return { pre, pos, tug: tg, tugP: tp, tugK: tk, kurang, lengkap, akhir: lengkap && w ? komp.reduce((a, x) => a + x[0] * x[1], 0) / w : null };
}
function nilaiMateri(m) {
  const st = stg(m), d = S.d; let sk = null;
  if (m.tugasK) { const g = d._k[m.tugasK.id], sb = d._sk[m.tugasK.id]; sk = { has: !!g, sub: !!sb, nilai: sb ? sb.nilaiSaya : null }; }
  return hitungAkhir(m, { hp: st.hp, hq: st.hq, s: st.s, sk });
}
const akhirTxt = n => n.akhir != null ? num(n.akhir) : 'Belum lengkap';
const akhirCell = n => n.akhir != null ? '<b class="num">' + num(n.akhir) + '</b> <small class="muted">(' + predikat(n.akhir) + ')</small>' : '<span class="bd gry">Belum lengkap</span>' + (n.kurang && n.kurang.length ? '<br><small class="muted3">Kurang: ' + esc(n.kurang.join(', ')) + '</small>' : '');
const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, '<br>');
function tkPending() {   // tugas kelompok yang harus dikirim murid ini (ia ketua)
  const d = S.d; return d.materi.filter(m => m.tugasK && d._k[m.tugasK.id] && d._k[m.tugasK.id].ketuaId === d.me.id && !d._sk[m.tugasK.id] && !stg(m).lock.tugas);
}

/* ---------- Pengumuman (dasbor murid) ---------- */
function annCard(a) {
  return '<article class="card ann ' + (a.penting ? 'imp' : '') + '"><div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;flex-wrap:wrap">' + (a.penting ? '<span class="bd red">Penting</span>' : '<span class="bd pur">' + ic('megaphone') + ' Pengumuman</span>') + '<small class="muted3">' + fD(a.dibuat) + (a.berakhir ? ' · sampai ' + fD(a.berakhir) : '') + '</small></div><h4 style="font-size:15px;margin:0 0 4px">' + esc(a.judul) + '</h4><div class="ann-t">' + linkify(a.isi) + '</div></article>';
}
function pengumumanHtml() {
  const L = S.d.pengumuman || []; if (!L.length) return '';
  return '<section style="margin-bottom:16px"><div class="card-h" style="margin-bottom:8px;align-items:center"><h3 style="display:flex;gap:8px;align-items:center">' + ic('megaphone') + ' Pengumuman</h3>' + (L.length > 3 ? '<a style="cursor:pointer;font-weight:600" data-act="annAll">Lihat semua (' + L.length + ')</a>' : '') + '</div><div class="grid g3">' + L.slice(0, 3).map(annCard).join('') + '</div></section>';
}
ACT.annAll = () => modal({ title: 'Semua Pengumuman', body: '<div style="display:flex;flex-direction:column;gap:12px">' + S.d.pengumuman.map(annCard).join('') + '</div>' });

/* ---------- Tugas: Pribadi | Kelompok ---------- */
function tugasMurid() {
  const t = S.ui.f.tt || 'pribadi', pend = tkPending().length, nK = S.d.materi.filter(m => m.tugasK).length;
  return '<div class="page-head"><div><h1>Tugas</h1><p class="muted" style="margin:4px 0 0">Kerjakan tugas pribadi dan tugas kelompok. Tugas kelompok dikirim oleh ketua kelompok.</p></div></div><div class="tabs"><button class="tab ' + (t === 'pribadi' ? 'on' : '') + '" data-act="tt" data-v="pribadi">Tugas Pribadi</button><button class="tab ' + (t === 'kelompok' ? 'on' : '') + '" data-act="tt" data-v="kelompok">Tugas Kelompok' + (nK ? ' (' + nK + ')' : '') + (pend ? ' <span class="bd red" style="padding:0 7px">' + pend + '</span>' : '') + '</button></div>' + (t === 'kelompok' ? tugasKelompokMurid() : tugasPribadiMurid());
}
ACT.tt = el => { setF('tt', el.dataset.v); renderRoute(false); };
let TGK = { img: null };
function tugasKelompokMurid() {
  const d = S.d, me = d.me.id, L = d.materi.filter(m => m.tugasK);
  if (!L.length) return '<div class="card">' + emptyBox('people', 'Belum ada tugas kelompok yang dibuka guru.') + '</div>';
  return '<div style="display:flex;flex-direction:column;gap:16px">' + L.map(m => {
    const tk = m.tugasK, g = d._k[tk.id], sb = d._sk[tk.id], st = stg(m), lock = st.lock.tugas, late = tk.batas && nowS() > tk.batas, ketua = g && g.ketuaId === me, graded = sb && sb.nilai != null;
    const tag = sb ? (graded ? '<span class="bd grn">Dinilai: ' + num(sb.nilaiSaya, 0) + ' / ' + tk.nilaiMaks + '</span>' : '<span class="bd amb">Menunggu Penilaian</span>') : !g ? '<span class="bd gry">Belum masuk kelompok</span>' : lock ? '<span class="bd gry">' + ic('lock') + ' Terkunci</span>' : late ? '<span class="bd red">Terlambat</span>' : '<span class="bd blu">Belum dikumpulkan</span>';
    let body = '<div style="white-space:pre-wrap;background:var(--card-2);border-radius:14px;padding:14px;margin-bottom:12px">' + esc(tk.instruksi) + '</div><div class="flow" style="margin-bottom:14px"><span class="a">Jawaban: ' + TIPE_LBL[tk.tipeJawaban] + '</span>' + (tk.batas ? '<span class="' + (late ? 'r' : '') + '">' + ic('calendar-event') + ' Batas ' + fDT(tk.batas) + (late ? ' (lewat)' : '') + '</span>' : '') + '<span>Nilai maks. ' + tk.nilaiMaks + '</span></div>';
    body += g ? '<div class="card" style="box-shadow:none;background:var(--card-2);margin-bottom:12px"><b style="display:block;margin-bottom:8px">' + ic('people') + ' ' + esc(g.nama) + ' · ' + g.anggota.length + ' anggota</b><div style="display:flex;flex-wrap:wrap;gap:8px">' + g.anggota.map(a => '<span class="bd ' + (a.id === g.ketuaId ? 'pur' : 'gry') + '">' + (a.id === g.ketuaId ? ic('star-fill') + ' ' : '') + esc(a.nama) + (a.id === g.ketuaId ? ' (Ketua)' : '') + (a.id === me ? ' · Anda' : '') + '</span>').join('') + '</div></div>' : '<div class="alert info"><i class="bi bi-hourglass-split"></i><div><b style="color:var(--tx)">Anda belum dimasukkan ke kelompok</b><span>Guru akan membagi kelompok. Cek kembali nanti.</span></div></div>';
    if (sb) body += '<div class="card" style="box-shadow:none;background:var(--card-2);margin-bottom:12px"><b style="display:block;margin-bottom:8px">Jawaban kelompok · dikirim ' + fDT(sb.waktuKirim) + (tk.batas && sb.waktuKirim > tk.batas ? ' <span class="bd red">Terlambat</span>' : '') + '</b>' + (isBerkas(sb) ? berkasChip(sb) : sb.linkGambar ? '<img src="' + esc(sb.linkGambar) + '" alt="Jawaban kelompok" style="max-width:100%;max-height:280px;border-radius:12px;display:block;margin-bottom:10px" loading="lazy" referrerpolicy="no-referrer">' : '') + (sb.deskripsi ? '<p style="white-space:pre-wrap;margin:0">' + esc(sb.deskripsi) + '</p>' : '') + (graded ? '<div class="alert info" style="margin:12px 0 0"><i class="bi bi-chat-square-text"></i><div><b style="color:var(--tx)">Nilai Anda: ' + num(sb.nilaiSaya, 0) + (sb.nilaiSaya !== sb.nilai ? ' (nilai kelompok ' + num(sb.nilai, 0) + ')' : '') + '</b><span>' + esc(sb.catatan || 'Tidak ada catatan guru.') + '</span></div></div>' : '') + '</div>';
    const open = S.ui.tkOpen === tk.id;
    if (g && !graded && !lock) {
      if (!ketua) body += '<div class="alert info" style="margin:0"><i class="bi bi-info-circle"></i><div><b style="color:var(--tx)">Hanya ketua yang mengirim tugas</b><span>Ketua kelompok Anda: ' + esc((g.anggota.find(a => a.id === g.ketuaId) || {}).nama || '-') + '.</span></div></div>';
      else if (!open) body += '<button class="btn btn-p" data-act="tkOpen" data-id="' + tk.id + '">' + ic('send') + ' ' + (sb ? 'Ubah / Kirim Ulang' : 'Kirim Tugas Kelompok') + '</button>';
      else { const F = tipeFlags(tk.tipeJawaban), needImg = F.img, needTxt = F.txt, needFile = F.file;
        body += '<form class="tkForm" data-id="' + tk.id + '" novalidate>' + (needImg ? '<div class="field"><label>Gambar jawaban kelompok</label><label class="drop" for="tkFile">' + ic('cloud-arrow-up') + ' <b>Pilih atau ambil foto</b><div id="tkPrev">' + (sb && sb.linkGambar && !isBerkas(sb) ? '<img src="' + esc(sb.linkGambar) + '" alt="Gambar sebelumnya" referrerpolicy="no-referrer">' : '') + '</div></label><input type="file" id="tkFile" accept="image/*" class="sr-only" data-ch="tkFile"></div>' : '') + (needFile ? fileField('tkBerkas', TGK.berkas, sb && isBerkas(sb) ? berkasNama(sb) : '') : '') + (needTxt ? '<div class="field"><label for="tkDesc">Deskripsi jawaban</label><textarea id="tkDesc" class="txa">' + esc(sb ? sb.deskripsi : '') + '</textarea></div>' : '') + '<div id="tkErr" class="ferr hide"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-p" type="button" data-act="tkKirim" data-id="' + tk.id + '">' + ic('send') + ' Kirim atas nama kelompok</button><button class="btn btn-s" type="button" data-act="tkOpen" data-id="">Batal</button></div></form>'; }
    } else if (g && lock) body += '<div class="alert info" style="margin:0"><i class="bi bi-lock"></i><div><b style="color:var(--tx)">Tahap masih terkunci</b><span>Selesaikan <b>Materi</b> (durasi belajar penuh) terlebih dahulu.</span></div></div>';
    return '<article class="card"><div class="card-h"><div><span class="eyebrow">Tugas Kelompok</span><h3 style="font-size:18px">' + esc(m.judul) + '</h3></div>' + tag + '</div>' + body + '</article>';
  }).join('') + '</div>';
}
ACT.tkOpen = el => { if (impBlock()) return; S.ui.tkOpen = el.dataset.id || null; TGK = { img: null }; renderRoute(false); };
CH.tkFile = async el => { const f = el.files[0]; if (!f) return; if (!/^image\//.test(f.type)) return toast('Berkas harus berupa gambar', 'er'); try { TGK.img = await compressImg(f); $('#tkPrev').innerHTML = '<img src="' + TGK.img + '" alt="Pratinjau">'; } catch (e) { toast('Gagal memproses gambar', 'er'); } };
ACT.tkKirim = async el => {
  if (impBlock()) return; const m = S.d.materi.find(x => x.tugasK && x.tugasK.id === el.dataset.id), tk = m.tugasK, g = S.d._k[tk.id], old = S.d._sk[tk.id], er = $('#tkErr'); er.classList.add('hide');
  const desc = $('#tkDesc') ? $('#tkDesc').value.trim() : '', F = tipeFlags(tk.tipeJawaban), needImg = F.img, needTxt = F.txt, needFile = F.file, fail = x => { er.innerHTML = ic('exclamation-circle') + ' ' + esc(x); er.classList.remove('hide'); };
  if (needTxt && !desc) return fail('Deskripsi jawaban wajib diisi.'); if (needImg && !TGK.img && !(old && old.linkGambar && !isBerkas(old))) return fail('Gambar jawaban wajib diunggah.');
  if (needFile && !TGK.berkas && !(old && isBerkas(old))) return fail('Berkas jawaban (PDF/PPT) wajib diunggah.');
  busy(el, true, TGK.berkas ? 'Mengunggah berkas…' : 'Mengunggah…');
  try { const rec = await rpc('kirimTugasKelompok', { kelompokId: g.id, deskripsi: desc, gambar: TGK.img || '', berkas: TGK.berkas ? { nama: TGK.berkas.nama, data: TGK.berkas.data } : null }); S.d.submitK = (S.d.submitK || []).filter(x => x.id !== rec.id).concat(rec); idx(); TGK = { img: null }; S.ui.tkOpen = null; saveCache(); updateBadges(); renderRoute(false); toast('Tugas kelompok terkirim'); }
  catch (x) { fail(x.message); busy(el, false); }
};

/* ---------- Bel peringatan (Web Audio, tanpa berkas audio) ---------- */
let BELL = null;
function bellPrep() { try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; if (!BELL) BELL = new AC(); if (BELL.state === 'suspended') BELL.resume(); } catch (e) { } }
function ringBell(force) {
  if (!BELL || (!force && S.cfg.belTes === 0)) return false; if (BELL.state !== 'running') { try { BELL.resume(); } catch (e) { } return false; }
  const t = BELL.currentTime, master = BELL.createGain(); master.gain.value = .85; master.connect(BELL.destination);
  [[1, .7], [2.756, .38], [5.404, .2], [8.933, .1]].forEach(p => { const o = BELL.createOscillator(), g = BELL.createGain(); o.type = 'sine'; o.frequency.value = 660 * p[0]; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p[1], t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + 1.6 / Math.sqrt(p[0])); o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.7); });
  return true;
}


/* =====================================================================
 * REVISI 4 (bersama + murid) — berkas PDF/PPT, rumus semester
 * ===================================================================== */
const TIPE_LBL = { gambar: 'Gambar', deskripsi: 'Deskripsi', keduanya: 'Gambar + Deskripsi', berkas: 'PDF / PPT', berkasdeskripsi: 'PDF / PPT + Deskripsi' };
const TIPE_OPTS = [['gambar', 'Gambar'], ['deskripsi', 'Deskripsi'], ['keduanya', 'Gambar + Deskripsi'], ['berkas', 'PDF / PPT (maks. 5 MB)'], ['berkasdeskripsi', 'PDF / PPT + Deskripsi']];
const tipeFlags = t => ({ img: t === 'gambar' || t === 'keduanya', file: t === 'berkas' || t === 'berkasdeskripsi', txt: t === 'deskripsi' || t === 'keduanya' || t === 'berkasdeskripsi' });
const isBerkas = s => !!s && String(s.linkGambar || '').indexOf('berkas|') === 0;
const berkasNama = s => String(s.linkGambar).split('|').slice(2).join('|');
const BERKAS_MAX = 5 * 1024 * 1024;
const kb = n => n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function readBerkas(file) {
  return new Promise((res, rej) => {
    if (!/\.(pdf|pptx?)$/i.test(file.name)) return rej(new Error('Berkas harus berformat PDF, PPT, atau PPTX.'));
    if (file.size > BERKAS_MAX) return rej(new Error('Ukuran berkas ' + kb(file.size) + ' melebihi batas 5 MB.'));
    const r = new FileReader(); r.onload = () => res({ nama: file.name, data: r.result, size: file.size }); r.onerror = () => rej(new Error('Gagal membaca berkas.')); r.readAsDataURL(file);
  });
}
const berkasInfoHtml = (nama, size) => '<span class="bd grn">' + ic('file-earmark-check') + ' ' + esc(nama) + ' · ' + kb(size) + '</span>';
function fileField(id, chosen, lama) {
  return '<div class="field"><label>Berkas jawaban (PDF / PPT / PPTX, maks. 5 MB)</label><label class="drop" for="' + id + '">' + ic('file-earmark-arrow-up') + ' <b>Pilih berkas PDF atau PPT</b><div id="' + id + 'Info" style="margin-top:8px">' + (chosen ? berkasInfoHtml(chosen.nama, chosen.size) : lama ? '<span class="bd gry">Berkas saat ini: ' + esc(lama) + ' · pilih berkas baru untuk mengganti</span>' : '') + '</div></label><input type="file" id="' + id + '" accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" class="sr-only" data-ch="' + id + '"></div>';
}
function berkasChip(s, guru) {
  const nm = berkasNama(s), ppt = /pptx?$/i.test(nm), col = ppt ? '#F59E0B' : '#E5484D';
  return '<div class="konten-item" style="margin-bottom:10px"><div class="ki" style="background:' + col + '1F;color:' + col + '">' + ic(ppt ? 'file-earmark-slides' : 'file-earmark-pdf') + '</div><div style="flex:1;min-width:0"><b class="ellip" style="display:block">' + esc(nm) + '</b><small class="muted">' + (ppt ? 'Presentasi' : 'Dokumen PDF') + '</small></div><button class="btn btn-sm btn-s" type="button" data-act="prevBerkas" data-f="' + esc(s.fileId) + '" data-n="' + esc(nm) + '">' + ic('eye') + ' Pratinjau</button>' + (guru ? '<button class="btn btn-sm btn-s" type="button" data-act="dlBerkas" data-f="' + esc(s.fileId) + '">' + ic('download') + ' Unduh</button>' : '') + '</div>';
}
const berkasMini = s => '<button class="btn btn-sm btn-s" type="button" data-act="prevBerkas" data-f="' + esc(s.fileId) + '" data-n="' + esc(berkasNama(s)) + '">' + ic(/pptx?$/i.test(berkasNama(s)) ? 'file-earmark-slides' : 'file-earmark-pdf') + ' Lihat</button>';
function previewBerkas(fileId, nama) {
  const w = modal({ size: 'lg', noFocus: true, title: nama, body: '<div style="height:100%"><div class="viewer" style="height:100%"><iframe src="https://drive.google.com/file/d/' + esc(fileId) + '/preview" title="Pratinjau ' + esc(nama) + '" allowfullscreen referrerpolicy="no-referrer"></iframe></div></div>', foot: '<span class="muted" style="margin-right:auto;font-size:12.5px">Pratinjau di dalam aplikasi' + (role() === 'guru' ? '. Jika tidak tampil, gunakan Unduh.' : '.') + '</span>' + (role() === 'guru' ? '<button class="btn btn-s" data-act="dlBerkas" data-f="' + esc(fileId) + '">' + ic('download') + ' Unduh</button>' : '') + '<button class="btn btn-p" data-close>Tutup</button>' });
  $('.mb', w).style.padding = '10px';
}
ACT.prevBerkas = el => previewBerkas(el.dataset.f, el.dataset.n || 'Berkas');
ACT.dlBerkas = async el => {
  busy(el, true, 'Menyiapkan…');
  try { const r = await rpc('getBerkas', { fileId: el.dataset.f }); const bin = atob(r.data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); download(r.nama, new Blob([u8], { type: r.mime })); toast('Berkas diunduh'); }
  catch (e) { toast(e.message, 'er'); } finally { busy(el, false); }
};
ACT.zoomImg = el => modal({ size: 'lg', title: 'Gambar jawaban', body: '<div style="text-align:center"><img src="' + esc(el.dataset.src) + '" alt="Gambar jawaban" style="max-width:100%;border-radius:12px" referrerpolicy="no-referrer"></div>' });
CH.tgBerkas = async el => { const f = el.files[0]; if (!f) return; try { TG.berkas = await readBerkas(f); $('#tgBerkasInfo').innerHTML = berkasInfoHtml(TG.berkas.nama, TG.berkas.size); } catch (e) { el.value = ''; TG.berkas = null; $('#tgBerkasInfo').innerHTML = ''; toast(e.message, 'er'); } };
CH.tkBerkas = async el => { const f = el.files[0]; if (!f) return; try { TGK.berkas = await readBerkas(f); $('#tkBerkasInfo').innerHTML = berkasInfoHtml(TGK.berkas.nama, TGK.berkas.size); } catch (e) { el.value = ''; TGK.berkas = null; $('#tkBerkasInfo').innerHTML = ''; toast(e.message, 'er'); } };

/* ---------- Rumus nilai semester & tahun ---------- */
const periodeOf = m => m && m.periode ? m.periode : { tahun: S.cfg.tahunAjaran, semester: String(S.cfg.semester || 'Ganjil').toLowerCase() };
/** Nilai Semester = Harian×bH + STS×bS + SAS×bA. Harian = rata-rata nilai akhir modul; hanya keluar bila semua modul (kecuali yang dibebaskan) lengkap dan STS & SAS terisi. */
function hitungSemester(mods, getN, isBebas, as) {
  const c = S.cfg, list = [], kurangModul = [];
  mods.forEach(m => {
    if (isBebas(m)) { list.push({ m, bebas: true }); return; }
    const n = getN(m);
    if (!n.lengkap && !n.kurang.length) { list.push({ m, na: true, n }); return; }   // modul tanpa tahap bernilai: tidak dihitung
    list.push({ m, n }); if (!n.lengkap) kurangModul.push(m.judul);
  });
  const dipakai = list.filter(x => x.n && x.n.lengkap), wajib = list.filter(x => x.n && !x.na).length;
  const harianSementara = dipakai.length ? avg(dipakai.map(x => x.n.akhir)) : null;
  const harian = wajib > 0 && !kurangModul.length ? harianSementara : null, kurang = [];
  if (!mods.length) kurang.push('Belum ada modul pada semester ini'); else if (!wajib) kurang.push('Tidak ada modul bernilai (semua dibebaskan)');
  if (kurangModul.length) kurang.push(kurangModul.length + ' modul belum lengkap');
  if (as.sts == null) kurang.push('STS'); if (as.sas == null) kurang.push('SAS');
  const lengkap = harian != null && as.sts != null && as.sas != null, w = (c.bobotHarian || 0) + (c.bobotSTS || 0) + (c.bobotSAS || 0) || 100;
  return { list, harian, harianSementara, sts: as.sts, sas: as.sas, kurang, kurangModul, lengkap, nilai: lengkap ? (harian * (c.bobotHarian || 0) + as.sts * (c.bobotSTS || 0) + as.sas * (c.bobotSAS || 0)) / w : null };
}
const nilaiTahun = (g, n) => g && n && g.nilai != null && n.nilai != null ? (g.nilai + n.nilai) / 2 : null;
function semMuridHtml() {
  const d = S.d, bb = new Set(d.bebas || []), per = {}; d.materi.forEach(m => { const p = periodeOf(m); (per[p.tahun] = per[p.tahun] || {})[p.semester] = 1; }); (d.asesmen || []).forEach(a => { (per[a.tahun] = per[a.tahun] || {})[a.semester] = 1; });
  const thn = Object.keys(per).sort().reverse(); if (!thn.length) return '';
  const asFor = (t, s) => { const o = { sts: null, sas: null }; (d.asesmen || []).forEach(a => { if (a.tahun === t && a.semester === s) o[a.jenis] = a.nilai; }); return o; }, kkm = S.cfg.kkm, sc = v => '<span class="sc ' + scCls(v, kkm) + '">' + (v == null ? '–' : num(v)) + '</span>';
  return thn.map(t => {
    const calc = s => per[t][s] ? hitungSemester(d.materi.filter(m => { const p = periodeOf(m); return p.tahun === t && p.semester === s; }), nilaiMateri, m => bb.has(m.id), asFor(t, s)) : null, g = calc('ganjil'), n = calc('genap'), th = nilaiTahun(g, n);
    const row = (lb, x) => x ? '<tr class="hv"><td><b>' + lb + '</b></td><td>' + (x.harian != null ? sc(x.harian) : x.harianSementara != null ? '<span class="muted3" title="Sementara: belum semua modul lengkap">~' + num(x.harianSementara) + '</span>' : '<span class="muted3">–</span>') + '</td><td>' + sc(x.sts) + '</td><td>' + sc(x.sas) + '</td><td>' + (x.nilai != null ? '<b class="num">' + num(x.nilai) + '</b> <small class="muted">(' + predikat(x.nilai) + ')</small>' : '<span class="bd gry">Belum lengkap</span>') + '</td></tr>' : '';
    const kur = [g && !g.lengkap ? 'Ganjil: ' + esc(g.kurang.join(', ')) : '', n && !n.lengkap ? 'Genap: ' + esc(n.kurang.join(', ')) : ''].filter(Boolean);
    return '<div class="card mt"><div class="card-h"><div><h3>' + ic('calendar3') + ' Rekap Nilai Tahun Ajaran ' + esc(t) + '</h3><p>Nilai semester = Harian ' + S.cfg.bobotHarian + '% + STS ' + S.cfg.bobotSTS + '% + SAS ' + S.cfg.bobotSAS + '%. Muncul setelah semua modul lengkap dan STS &amp; SAS diumumkan guru.</p></div>' + (th != null ? '<span class="bd grn">Nilai Tahun: ' + num(th) + '</span>' : '<span class="bd gry">Nilai Tahun belum tersedia</span>') + '</div><div class="tw"><table class="tb" style="min-width:520px"><thead><tr><th>Semester</th><th>Nilai Harian</th><th>STS</th><th>SAS</th><th>Nilai Semester</th></tr></thead><tbody>' + row('Ganjil', g) + row('Genap', n) + '</tbody></table></div>' + (kur.length ? '<p class="muted" style="font-size:12px;margin:10px 0 0">Yang masih kurang — ' + kur.join(' · ') + '</p>' : '') + '</div>';
  }).join('');
}

const nilaiMurid = () => nilaiMuridModul() + semMuridHtml();
/* ---------- Registrasi render murid ---------- */
R.dashboard = () => role() === 'guru' ? dashGuru() : dashMurid();
AFTER.dashboard = () => role() === 'guru' ? drawGuruDash() : drawMuridChart();
R.materi = () => role() === 'guru' ? materiGuru() : materiMurid();
R.tugas = tugasMurid;
R.nilai = () => role() === 'guru' ? nilaiGuru() : nilaiMurid();
AFTER.nilai = () => role() === 'guru' ? drawGuruNilai() : drawBar();

/* =====================================================================
 * BAGIAN C — GURU: dasbor, materi, editor, penilaian, laporan, pengguna
 * ===================================================================== */
const mu = id => S.d.murid.find(x => x.id === id), mt = id => S.d.materi.find(x => x.id === id);
const kOpts = (sel, all) => (all ? '<option value="">' + all + '</option>' : '') + S.d.kelas.map(k => '<option value="' + k.id + '"' + (k.id === sel ? ' selected' : '') + '>' + esc(k.nama) + '</option>').join('');
const mOpts = (sel, all) => (all ? '<option value="">' + all + '</option>' : '') + S.d.materi.map(m => '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.judul) + '</option>').join('');
const swHtml = (on, attrs, label) => '<label class="sw"><input type="checkbox" ' + (on ? 'checked' : '') + ' ' + attrs + ' aria-label="' + esc(label) + '"><i></i></label>';
const avatarU = n => '<span class="avatar" style="width:36px;height:36px;font-size:12px">' + esc(initials(n)) + '</span>';

/* ---------- DASBOR GURU ---------- */
function dashGuru() {
  const d = S.d, L = laporan(), nilai = d.submit.filter(s => s.nilai == null), keluar = d.hasil.filter(h => h.status === 'keluar aplikasi');
  const gk = S.ui.f.gk || '', kel = d.kelas.filter(k => !gk || k.id === gk);
  const bars = kel.map(k => { const r = L.filter(x => x.u.kelasId === k.id), pr = avg(r.map(x => x.pre)), po = avg(r.map(x => x.pos));
    return '<div class="cbar"><div class="h"><b>' + esc(k.nama) + ' <span class="muted fw6">(' + d.murid.filter(u => u.kelasId === k.id).length + ' murid)</span></b><span><b>' + num(pr, 0) + '</b> → <b>' + num(po, 0) + '</b> ' + (pr != null && po != null ? '<span class="bd grn">+' + num(po - pr, 0) + ' poin</span>' : '') + '</span></div><div class="tr"><div class="a" style="width:' + Math.max(pr || 0, po || 0) + '%"></div><div class="b" style="left:' + Math.min(pr || 0, po || 0) + '%;width:' + Math.abs((po || 0) - (pr || 0)) + '%;border-radius:0 99px 99px 0"></div></div></div>'; }).join('');
  const att = [];
  keluar.sort((a, b) => b.selesai - a.selesai).slice(0, 3).forEach(h => { const u = mu(h.userId), m = mt(h.materiId); if (u && m) att.push('<div class="card" style="background:var(--danger-bg);box-shadow:none;border-color:rgba(229,72,77,.2)"><div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">' + avatarU(u.nama) + '<div style="flex:1;min-width:0"><b>' + esc(u.nama) + '</b><br><small class="muted">' + esc(kls(u.kelasId)) + '</small></div><span class="bd red">Keluar Aplikasi</span></div><p style="margin:0 0 8px;font-size:12.5px">Berpindah aplikasi pada <b>' + NAMA[h.jenis] + ' ' + esc(m.judul) + '</b>. Nilai terhenti di ' + num(h.nilai, 0) + '.</p><div style="text-align:right"><button class="btn btn-sm btn-d" data-act="resetTes" data-id="' + h.id + '">Reset Izin Tes</button></div></div>'); });
  L.filter(x => x.red).slice(0, 3 - Math.min(att.length, 2)).forEach(x => att.push('<div class="card" style="background:var(--warn-bg);box-shadow:none;border-color:rgba(245,158,11,.25)"><div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">' + avatarU(x.u.nama) + '<div style="flex:1;min-width:0"><b>' + esc(x.u.nama) + '</b><br><small class="muted">' + esc(kls(x.u.kelasId)) + '</small></div><span class="bd red">Belum Dibaca</span></div><p style="margin:0;font-size:12.5px">Menutup materi <b>' + esc(x.m.judul) + '</b> sebelum durasi belajar minimum selesai.</p></div>'));
  const recent = d.submit.slice().sort((a, b) => b.waktuKirim - a.waktuKirim).slice(0, 5);
  return '<div class="page-head"><div><span class="eyebrow">Mode Guru (Administrator)</span><h1>Dasbor Kendali Pembelajaran Praktik</h1></div><div class="acts">' + (d.ssUrl ? '<a class="btn btn-s" href="' + esc(d.ssUrl) + '" target="_blank" rel="noopener">' + ic('table') + ' Buka Google Sheets</a>' : '') + '<button class="btn btn-p" data-act="newMateri">' + ic('plus-circle') + ' Buat Modul Baru</button></div></div>' +
    '<div class="grid g4">' + stat('indigo', 'people', 'Jumlah Murid', d.murid.filter(u => u.aktif).length, d.kelas.length + ' rombel kelas') + stat('sky', 'layers', 'Materi Aktif', d.materi.filter(m => m.publikasi).length, d.materi.filter(m => m.tampilPretes && m.tampilPostes).length + ' dengan Pretes & Postes') + stat('emerald', 'check2-square', 'Tugas Perlu Dinilai', nilai.length, d.submit.length + ' total pengumpulan') + stat('red', 'shield-exclamation', 'Keluar Saat Tes', keluar.length, 'Terdeteksi pindah tab saat ujian') + '</div>' +
    '<div class="grid gmain mt"><div style="display:flex;flex-direction:column;gap:16px;min-width:0"><div class="card"><div class="card-h"><div><span class="muted" style="font-size:11px;font-weight:700;letter-spacing:.05em">EVALUASI EFEKTIVITAS PEMBELAJARAN</span><h3>Rata-rata Capaian per Kelas</h3></div><select class="sel" style="width:auto;min-height:40px" data-ch="gk" aria-label="Filter kelas">' + kOpts(gk, 'Semua Kelas') + '</select></div><div class="legend" style="margin-bottom:12px"><span><i style="background:#B9BDD0"></i>Pretes</span><span><i style="background:var(--indigo)"></i>Postes</span><span style="color:var(--ok-tx)">' + ic('graph-up-arrow') + ' Lonjakan</span></div>' + (bars || emptyBox('people', 'Belum ada kelas. Tambahkan di Kelola Pengguna.')) + '<p class="muted" style="font-size:12px;margin:8px 0 0">*Standar Ketuntasan Minimal (KKM) Informatika: ' + S.cfg.kkm + '</p></div>' +
    '<div class="card"><div class="card-h"><div><h3>' + ic('sliders') + ' Sakelar Tampil / Sembunyi Alur Cepat</h3><p>Atur visibilitas 4 tahapan alur belajar murid secara langsung per modul.</p></div></div>' + (d.materi.length ? '<div class="tw"><table class="tb" style="min-width:700px"><thead><tr><th>Modul Praktik</th><th style="text-align:center">Pretes</th><th style="text-align:center">Materi</th><th style="text-align:center">Tugas</th><th style="text-align:center">Postes</th><th style="text-align:center">Kelompok</th><th style="text-align:center">Publik</th></tr></thead><tbody>' + d.materi.map(m => '<tr><td><b>' + esc(m.judul) + '</b><br><small class="muted">' + esc(kls(m.kelasId)) + ' · ' + totalMenit(m) + ' mnt</small></td>' + ['tampilPretes', 'tampilMateri', 'tampilTugas', 'tampilPostes', 'tampilKelompok', 'publikasi'].map(f => f === 'tampilKelompok' ? '<td><div class="sw-cell">' + (m.tugasK ? swHtml(m.tugasK.aktif, 'data-ch="tgl" data-id="' + m.id + '" data-f="tampilKelompok"', 'Tugas kelompok ' + m.judul) : '<span class="muted3" title="Belum ada tugas kelompok">–</span>') + '</div></td>' : '<td><div class="sw-cell">' + swHtml(m[f], 'data-ch="tgl" data-id="' + m.id + '" data-f="' + f + '"', f + ' ' + m.judul) + '</div></td>').join('') + '</tr>').join('') + '</tbody></table></div>' : emptyBox('journal-plus', 'Belum ada materi.')) + '</div></div>' +
    '<div style="display:flex;flex-direction:column;gap:16px;min-width:0"><div class="card"><div class="card-h"><h3 style="display:flex;gap:8px;align-items:center"><i style="width:10px;height:10px;border-radius:50%;background:var(--danger);display:inline-block"></i>Perlu Perhatian Khusus</h3><span class="bd red">' + (keluar.length + L.filter(x => x.red).length) + ' kasus</span></div><p class="muted" style="font-size:12.5px;margin:0 0 12px">Murid dengan anomali kepatuhan waktu belajar atau pelanggaran tab saat ujian.</p><div style="display:flex;flex-direction:column;gap:10px">' + (att.join('') || emptyBox('emoji-smile', 'Tidak ada kasus. Semua aman!')) + '</div></div>' +
    '<div class="card"><div class="card-h"><h3>Akses Cepat</h3></div><div style="display:grid;gap:8px"><button class="btn btn-s" data-act="go" data-r="pengumpulan" style="justify-content:flex-start">' + ic('inbox') + ' Nilai tugas (' + nilai.length + ')</button><button class="btn btn-s" data-act="go" data-r="absensi" style="justify-content:flex-start">' + ic('calendar-check') + ' Isi absensi hari ini</button><button class="btn btn-s" data-act="go" data-r="pengguna" style="justify-content:flex-start">' + ic('person-plus') + ' Tambah / impor murid</button><button class="btn btn-s" data-act="go" data-r="nilai" style="justify-content:flex-start">' + ic('file-earmark-spreadsheet') + ' Laporan & ekspor</button>' + (d.folderUrl ? '<a class="btn btn-s" href="' + esc(d.folderUrl) + '" target="_blank" rel="noopener" style="justify-content:flex-start">' + ic('folder2-open') + ' Folder Google Drive</a>' : '') + '</div></div></div></div>' +
    '<div class="card mt"><div class="card-h"><div><h3>Pengumpulan Tugas Praktik Terbaru</h3><p>Berkas jawaban tersimpan otomatis di Google Drive murid.</p></div><button class="btn btn-sm btn-s" data-act="go" data-r="pengumpulan">Lihat semua ' + ic('arrow-right-short') + '</button></div>' + subTable(recent, false) + '</div>';
}
CH.gk = el => { setF('gk', el.value); renderRoute(false); };
function drawGuruDash() { }
CH.tgl = async el => {
  const m = mt(el.dataset.id), f = el.dataset.f, v = el.checked, tgt = f === 'tampilKelompok' ? m.tugasK : m, key = f === 'tampilKelompok' ? 'aktif' : f, old = tgt[key]; tgt[key] = v; saveCache(); updateBadges();
  try { await rpc('setTampil', { id: m.id, field: f, val: v }, { retry: 1 }); toast('Pengaturan tampil diperbarui'); }
  catch (e) { tgt[key] = old; el.checked = old; toast(e.message, 'er'); }
};
function subTable(list, full) {
  if (!list.length) return emptyBox('inbox', 'Belum ada pengumpulan tugas.');
  return '<div class="tw"><table class="tb"><thead><tr><th>Murid</th><th>Kelas</th><th>Modul / Tugas</th><th>Waktu Kirim</th><th>Jawaban</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(s => { const u = mu(s.userId), m = mt(s.materiId); if (!u || !m) return '';
    return '<tr class="hv"><td><div class="nm">' + avatarU(u.nama) + '<div><b>' + esc(u.nama) + '</b><small>' + esc(u.nisn || '@' + u.username) + '</small></div></div></td><td>' + esc(kls(u.kelasId)) + '</td><td>' + esc(m.judul) + '</td><td>' + fDT(s.waktuKirim) + (m.tugas && m.tugas.batas && s.waktuKirim > m.tugas.batas ? '<br><span class="bd red">Terlambat</span>' : '') + '</td><td>' + (isBerkas(s) ? berkasMini(s) : s.linkGambar ? '<img class="thumb" style="cursor:zoom-in" data-act="zoomImg" data-src="' + esc(s.linkGambar) + '" src="' + esc(s.linkGambar) + '" alt="Jawaban ' + esc(u.nama) + '" loading="lazy" referrerpolicy="no-referrer">' : '<span class="muted3">teks</span>') + '</td><td>' + (s.nilai != null ? '<span class="bd grn">Nilai ' + num(s.nilai, 0) + '</span>' : '<span class="bd amb">Menunggu</span>') + '</td><td><button class="btn btn-sm ' + (s.nilai != null ? 'btn-s' : 'btn-p') + '" data-act="nilaiTugas" data-id="' + s.id + '">' + (s.nilai != null ? 'Ubah' : 'Nilai Sekarang') + '</button></td></tr>'; }).join('') + '</tbody></table></div>';
}
ACT.nilaiTugas = el => {
  const s = S.d.submit.find(x => x.id === el.dataset.id), u = mu(s.userId), m = mt(s.materiId), mx = m.tugas ? m.tugas.nilaiMaks : 100;
  const w = modal({ title: 'Nilai Tugas — ' + u.nama, body: '<p class="muted" style="margin:0 0 10px">' + esc(m.judul) + ' · ' + fDT(s.waktuKirim) + '</p>' + (m.tugas ? '<div style="white-space:pre-wrap;background:var(--card-2);border-radius:12px;padding:12px;margin-bottom:12px;font-size:13px"><b>Instruksi:</b> ' + esc(m.tugas.instruksi) + '</div>' : '') + answerView(s) + (s.deskripsi ? '<p style="white-space:pre-wrap;background:var(--card-2);padding:12px;border-radius:12px">' + esc(s.deskripsi) + '</p>' : '') + '<div class="row2"><div class="field"><label for="nvVal">Nilai (0 – ' + mx + ')</label><input id="nvVal" class="inp" type="number" min="0" max="' + mx + '" step="0.5" value="' + (s.nilai != null ? s.nilai : '') + '"></div></div><div class="field"><label for="nvCat">Catatan untuk murid</label><textarea id="nvCat" class="txa">' + esc(s.catatan || '') + '</textarea></div><div id="nvErr" class="ferr hide"></div>', foot: '<button class="btn btn-s" data-close>Batal</button><button class="btn btn-p" id="nvSave">' + ic('check2') + ' Simpan Nilai</button>' });
  $('#nvSave', w).onclick = async e => { const v = $('#nvVal', w).value; if (v === '') { $('#nvErr', w).textContent = 'Nilai wajib diisi.'; return $('#nvErr', w).classList.remove('hide'); }
    busy(e.currentTarget, true); try { const r = await rpc('nilaiTugas', { id: s.id, nilai: +v, catatan: $('#nvCat', w).value }); Object.assign(s, r); saveCache(); closeM(w, 'force'); refreshUI(); toast('Nilai tersimpan'); } catch (x) { $('#nvErr', w).textContent = x.message; $('#nvErr', w).classList.remove('hide'); busy(e.currentTarget, false); } };
};
ACT.resetTes = async el => {
  if (!await confirmBox('Reset izin tes? Hasil tes murid ini dihapus dan murid dapat mengerjakan ulang dengan kumpulan soal baru.', { title: 'Reset izin tes', ok: 'Reset', danger: true })) return;
  try { await rpc('resetTes', { id: el.dataset.id }); S.d.hasil = S.d.hasil.filter(h => h.id !== el.dataset.id); saveCache(); refreshUI(); toast('Izin tes direset'); } catch (e) { toast(e.message, 'er'); }
};

/* ---------- MATERI (guru: daftar) ---------- */
function materiGuru() {
  const q = (S.ui.f.mq || '').toLowerCase(), gk = S.ui.f.mk || '';
  const L = S.d.materi.filter(m => (!q || m.judul.toLowerCase().includes(q)) && (!gk || m.kelasId === gk));
  return '<div class="page-head"><div><h1>Kelola Materi</h1><p class="muted" style="margin:4px 0 0">Susun alur Pretes → Materi → Tugas → Postes dan atur durasi belajar.</p></div><div class="acts"><select class="sel" style="width:auto" data-ch="mk" aria-label="Filter kelas">' + kOpts(gk, 'Semua kelas') + '</select><button class="btn btn-p" data-act="newMateri">' + ic('plus-circle') + ' Buat Materi</button></div></div>' +
    (q ? '<p class="muted">Pencarian: “<b>' + esc(q) + '</b>” · <a style="cursor:pointer" data-act="clearQ">hapus</a></p>' : '') +
    (L.length ? '<div class="grid g3">' + L.map((m, i) => '<article class="card hov mcard"><div class="top"><div class="mi" style="background:' + MCOL[i % 6] + '1F;color:' + MCOL[i % 6] + '">' + ic(MICON[i % MICON.length]) + '</div><div style="flex:1;min-width:0"><div class="kode">' + esc(kls(m.kelasId)) + ' · urutan ' + m.urutan + '</div><h4>' + esc(m.judul) + '</h4></div><span class="bd ' + (m.publikasi ? 'grn' : 'gry') + '">' + (m.publikasi ? 'Publik' : 'Draf') + '</span></div><p>' + esc(m.deskripsi || '—') + '</p><div class="flow"><span class="' + (m.tampilPretes ? 'd' : '') + '">Pretes ' + m.nPre + '</span><span class="' + (m.tampilMateri ? 'd' : '') + '">Materi ' + m.konten.length + '</span><span class="' + (m.tampilTugas ? 'd' : '') + '">Tugas ' + (m.tugas ? 1 : 0) + '</span><span class="' + (m.tampilPostes ? 'd' : '') + '">Postes ' + m.nPost + '</span>' + (m.tugasK ? '<span class="' + (m.tugasK.aktif ? 'd' : '') + '">Kelompok</span>' : '') + '</div><div class="foot"><span class="muted" style="font-size:12px">' + ic('clock') + ' ' + totalMenit(m) + ' mnt belajar</span><span style="display:flex;gap:6px"><button class="btn btn-sm btn-dl" data-act="delMateri" data-id="' + m.id + '" aria-label="Hapus ' + esc(m.judul) + '">' + ic('trash') + '</button><button class="btn btn-sm btn-p" data-act="editMateri" data-id="' + m.id + '">' + ic('pencil-square') + ' Edit</button></span></div></article>').join('') + '</div>' : emptyBox('journal-plus', 'Belum ada materi. Klik “Buat Materi”.'));
}
CH.mk = el => { setF('mk', el.value); renderRoute(false); };
ACT.delMateri = async el => {
  const m = mt(el.dataset.id); if (!await confirmBox('Hapus <b>' + esc(m.judul) + '</b> beserta soal, tugas, dan seluruh nilai murid pada materi ini? Tindakan tidak dapat dibatalkan.', { title: 'Hapus materi', ok: 'Hapus permanen', danger: true })) return;
  try { await rpc('hapusMateri', { id: m.id }); const id = m.id; S.d.materi = S.d.materi.filter(x => x.id !== id); S.d.hasil = S.d.hasil.filter(x => x.materiId !== id); S.d.progres = S.d.progres.filter(x => x.materiId !== id); S.d.submit = S.d.submit.filter(x => x.materiId !== id); saveCache(); refreshUI(); toast('Materi dihapus'); } catch (e) { toast(e.message, 'er'); }
};
ACT.newMateri = () => editMateri(null);
ACT.editMateri = el => editMateri(el.dataset.id);

/* ---------- EDITOR MATERI ---------- */
function editMateri(id) {
  const m = id ? mt(id) : null;
  S.ui.ed = { id, periode: periodeOf(m), tab: 'info', soalLoaded: !id, dirtySoal: { pretes: false, postes: false }, soal: { pretes: [], postes: [] },
    materi: m ? { id: m.id, judul: m.judul, deskripsi: m.deskripsi, kelasId: m.kelasId, urutan: m.urutan, tampilPretes: m.tampilPretes, tampilMateri: m.tampilMateri, tampilTugas: m.tampilTugas, tampilPostes: m.tampilPostes, publikasi: m.publikasi, durasiTes: m.durasiTes } : { judul: '', deskripsi: '', kelasId: '', urutan: S.d.materi.length + 1, tampilPretes: true, tampilMateri: true, tampilTugas: true, tampilPostes: true, publikasi: false, durasiTes: 15 },
    konten: m ? m.konten.map(k => Object.assign({}, k)) : [], tugas: m && m.tugas ? Object.assign({}, m.tugas) : null, tugasK: m && m.tugasK ? Object.assign({}, m.tugasK) : null, hadK: !!(m && m.tugasK) };
  go('materiEditor');
  if (id) rpc('getSoal', { materiId: id }).then(r => { const e = S.ui.ed; if (!e || e.id !== id) return; ['pretes', 'postes'].forEach(j => e.soal[j] = r.filter(s => s.jenis === j)); e.soalLoaded = true; if (S.route === 'materiEditor' && (e.tab === 'pretes' || e.tab === 'postes')) renderRoute(false); }).catch(x => toast(x.message, 'er'));
}
const dtl = t => { if (!t) return ''; const d = new Date(t), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
function editorGuru() {
  const e = S.ui.ed; if (!e) return emptyBox('pencil', 'Pilih materi untuk diedit.');
  const m = e.materi, tabs = [['info', 'Informasi'], ['konten', 'Konten (' + e.konten.length + ')'], ['pretes', 'Soal Pretes'], ['postes', 'Soal Postes'], ['tugas', 'Tugas'], ['kelompok', 'Tugas Kelompok']];
  let body = '';
  if (e.tab === 'info') body = '<div class="field"><label for="edJ">Judul materi</label><input id="edJ" class="inp" data-in="ed" data-p="materi.judul" value="' + esc(m.judul) + '" placeholder="Modul 01: Berpikir Komputasional"></div><div class="field"><label for="edD">Deskripsi singkat</label><textarea id="edD" class="txa" data-in="ed" data-p="materi.deskripsi">' + esc(m.deskripsi) + '</textarea></div><div class="row2"><div class="field"><label>Untuk kelas</label><select class="sel" data-ch="ed" data-p="materi.kelasId">' + kOpts(m.kelasId, 'Semua kelas') + '</select></div><div class="field"><label>Urutan tampil</label><input class="inp" type="number" min="1" data-in="ed" data-p="materi.urutan" data-n="1" value="' + m.urutan + '"></div></div><div class="row2"><div class="field"><label>Durasi tes (menit, pretes & postes)</label><input class="inp" type="number" min="1" max="180" data-in="ed" data-p="materi.durasiTes" data-n="1" value="' + m.durasiTes + '"></div></div><div class="row2"><div class="field"><label>Semester (untuk rekap nilai)</label><select class="sel" data-ch="ed" data-p="periode.semester"><option value="ganjil"' + (e.periode.semester === 'ganjil' ? ' selected' : '') + '>Ganjil</option><option value="genap"' + (e.periode.semester === 'genap' ? ' selected' : '') + '>Genap</option></select></div><div class="field"><label>Tahun ajaran</label><select class="sel" data-ch="ed" data-p="periode.tahun">' + tahunOpts().map(t => '<option' + (t === e.periode.tahun ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div></div><div class="card" style="box-shadow:none;background:var(--card-2)"><b style="display:block;margin-bottom:10px">Sakelar tampil / sembunyi</b><div class="kv">' + [['publikasi', 'Publikasikan ke murid'], ['tampilPretes', 'Menu Pretes'], ['tampilMateri', 'Menu Materi'], ['tampilTugas', 'Menu Tugas'], ['tampilPostes', 'Menu Postes']].map(x => '<label style="display:flex;gap:10px;align-items:center;cursor:pointer">' + swHtml(m[x[0]], 'data-ch="ed" data-p="materi.' + x[0] + '" data-b="1"', x[1]) + '<span>' + x[1] + '</span></label>').join('') + '</div></div>';
  else if (e.tab === 'konten') body = '<p class="muted" style="margin-top:0">Tambahkan video YouTube, PDF/PPT/dokumen (tautan Drive atau unggah), atau teks. Durasi menit dijumlahkan menjadi <b>waktu belajar wajib</b> murid.</p>' + e.konten.map((k, i) => '<div class="qed"><div class="row2"><div class="field"><label>Judul konten</label><input class="inp" data-in="ed" data-p="konten.' + i + '.judul" value="' + esc(k.judul) + '"></div><div class="field"><label>Tipe</label><select class="sel" data-ch="ed" data-p="konten.' + i + '.tipe" data-r="1">' + ['youtube', 'pdf', 'ppt', 'dokumen', 'teks'].map(t => '<option value="' + t + '"' + (k.tipe === t ? ' selected' : '') + '>' + ({ youtube: 'Video YouTube', pdf: 'PDF', ppt: 'PPT / Slide', dokumen: 'Dokumen', teks: 'Teks ringkasan' }[t]) + '</option>').join('') + '</select></div></div><div class="field"><label>' + (k.tipe === 'teks' ? 'Isi teks' : 'Tautan (YouTube / Google Drive / Docs / Slides)') + '</label>' + (k.tipe === 'teks' ? '<textarea class="txa" data-in="ed" data-p="konten.' + i + '.link">' + esc(k.link) + '</textarea>' : '<input class="inp" data-in="ed" data-p="konten.' + i + '.link" value="' + esc(k.link) + '" placeholder="https://…">') + '</div><div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap"><div class="field" style="margin:0;width:140px"><label>Durasi (menit)</label><input class="inp" type="number" min="0" data-in="ed" data-p="konten.' + i + '.durasi" data-n="1" value="' + k.durasi + '"></div>' + (k.tipe !== 'teks' && k.tipe !== 'youtube' ? '<label class="btn btn-s" style="cursor:pointer">' + ic('cloud-upload') + ' Unggah berkas<input type="file" class="sr-only" data-ch="upl" data-i="' + i + '" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,image/*"></label>' : '') + '<button class="btn btn-dl" data-act="edDelK" data-i="' + i + '" style="margin-left:auto">' + ic('trash') + ' Hapus</button></div></div>').join('') + '<button class="btn btn-s" data-act="edAddK">' + ic('plus-lg') + ' Tambah konten</button>';
  else if (e.tab === 'pretes' || e.tab === 'postes') {
    const L = e.soal[e.tab];
    body = !e.soalLoaded ? '<div class="skel" style="height:140px"></div>' : '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"><button class="btn btn-s" data-act="tplSoal">' + ic('file-earmark-excel') + ' Unduh Template Excel</button><label class="btn btn-p" style="cursor:pointer">' + ic('cloud-upload') + ' Impor Soal dari Excel<input type="file" class="sr-only" accept=".xlsx,.xls,.csv" data-ch="impSoal"></label><button class="btn btn-s" data-act="expSoal">' + ic('download') + ' Ekspor Soal Ini</button></div><p class="muted" style="margin-top:0">' + (e.tab === 'pretes' ? 'Pretes disarankan 5 soal pilihan ganda.' : 'Jumlah soal postes bebas.') + ' Kunci jawaban hanya tersimpan di server.</p>' + L.map((s, i) => '<div class="qed"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>Soal ' + (i + 1) + '</b><button class="btn btn-sm btn-dl" data-act="edDelS" data-i="' + i + '" aria-label="Hapus soal ' + (i + 1) + '">' + ic('trash') + '</button></div><div class="field"><textarea class="txa" style="min-height:70px" data-in="ed" data-p="soal.' + e.tab + '.' + i + '.pertanyaan" placeholder="Pertanyaan…">' + esc(s.pertanyaan) + '</textarea></div><div class="row2">' + ['a', 'b', 'c', 'd'].map(o => '<div class="field" style="margin:0"><input class="inp" data-in="ed" data-p="soal.' + e.tab + '.' + i + '.' + o + '" value="' + esc(s[o]) + '" placeholder="Pilihan ' + o.toUpperCase() + '" aria-label="Pilihan ' + o.toUpperCase() + '"></div>').join('') + '</div><div style="display:flex;gap:10px;margin-top:10px"><div class="field" style="margin:0"><label>Kunci</label><select class="sel" data-ch="ed" data-p="soal.' + e.tab + '.' + i + '.kunci">' + ['A', 'B', 'C', 'D'].map(o => '<option' + (s.kunci === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></div><div class="field" style="margin:0;width:100px"><label>Bobot</label><input class="inp" type="number" min="1" data-in="ed" data-p="soal.' + e.tab + '.' + i + '.bobot" data-n="1" value="' + (s.bobot || 1) + '"></div></div></div>').join('') + '<button class="btn btn-s" data-act="edAddS">' + ic('plus-lg') + ' Tambah soal</button>';
  } else if (e.tab === 'kelompok') { body = kelompokTab(e);
  } else body = '<div class="field"><label style="display:flex;gap:10px;align-items:center">' + swHtml(!!e.tugas, 'data-act="edTugasOn"', 'Aktifkan tugas') + ' Materi ini memiliki tugas praktik</label></div>' + (e.tugas ? '<div class="field"><label>Instruksi tugas</label><textarea class="txa" data-in="ed" data-p="tugas.instruksi">' + esc(e.tugas.instruksi) + '</textarea></div><div class="row2"><div class="field"><label>Tipe jawaban</label><select class="sel" data-ch="ed" data-p="tugas.tipeJawaban">' + TIPE_OPTS.map(o => '<option value="' + o[0] + '"' + (e.tugas.tipeJawaban === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div><div class="field"><label>Nilai maksimal</label><input class="inp" type="number" min="1" data-in="ed" data-p="tugas.nilaiMaks" data-n="1" value="' + e.tugas.nilaiMaks + '"></div></div><div class="field"><label>Batas waktu</label><input class="inp" type="datetime-local" data-ch="ed" data-p="tugas.batas" data-dt="1" value="' + dtl(e.tugas.batas) + '"></div>' : '<p class="muted">Aktifkan untuk menambahkan instruksi tugas.</p>');
  return '<nav class="crumb"><a data-act="go" data-r="materi">Materi</a>/<b>' + (e.id ? 'Edit' : 'Baru') + '</b></nav><div class="page-head"><div><h1>' + (e.id ? 'Edit Materi' : 'Buat Materi Baru') + '</h1></div><div class="acts"><button class="btn btn-s" data-act="back">Batal</button><button class="btn btn-p" id="edSave" data-act="edSave">' + ic('check2-circle') + ' Simpan Semua</button></div></div><div class="card"><div class="tabs">' + tabs.map(t => '<button class="tab ' + (e.tab === t[0] ? 'on' : '') + '" data-act="edTab" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' + body + '</div>';
}
R.materiEditor = editorGuru;
function setPath(o, p, v) { const a = p.split('.'); for (let i = 0; i < a.length - 1; i++) o = o[a[i]]; o[a[a.length - 1]] = v; }
function edSet(el, rerender) {
  const e = S.ui.ed; let v = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.n) v = +v || 0; if (el.dataset.dt) v = v ? new Date(v).getTime() : 0;
  setPath(e, el.dataset.p, v); const p = el.dataset.p.split('.'); if (p[0] === 'soal') e.dirtySoal[p[1]] = true;
  if (rerender || el.dataset.r) renderRoute(false);
}
IN.ed = el => edSet(el); CH.ed = el => edSet(el);
ACT.edTab = el => { S.ui.ed.tab = el.dataset.t; renderRoute(false); };
ACT.edAddK = () => { S.ui.ed.konten.push({ tipe: 'youtube', link: '', judul: '', durasi: 5 }); renderRoute(false); };
ACT.edDelK = el => { S.ui.ed.konten.splice(+el.dataset.i, 1); renderRoute(false); };
ACT.edAddS = () => { const e = S.ui.ed; e.soal[e.tab].push({ pertanyaan: '', a: '', b: '', c: '', d: '', kunci: 'A', bobot: 1 }); e.dirtySoal[e.tab] = true; renderRoute(false); };
ACT.edDelS = el => { const e = S.ui.ed; e.soal[e.tab].splice(+el.dataset.i, 1); e.dirtySoal[e.tab] = true; renderRoute(false); };
ACT.edTugasOn = el => { const e = S.ui.ed; e.tugas = el.checked ? { instruksi: '', tipeJawaban: 'keduanya', batas: 0, nilaiMaks: 100 } : null; renderRoute(false); };
CH.upl = el => {
  const f = el.files[0]; if (!f) return; if (f.size > 10 * 1024 * 1024) return toast('Berkas > 10 MB. Unggah ke Drive lalu tempel tautannya.', 'er');
  const i = +el.dataset.i, rd = new FileReader(); toast('Mengunggah ' + f.name + '…');
  rd.onload = async () => { try { const r = await rpc('uploadBerkas', { nama: f.name, mime: f.type || 'application/pdf', data: rd.result }); S.ui.ed.konten[i].link = r.url; if (!S.ui.ed.konten[i].judul) S.ui.ed.konten[i].judul = f.name; renderRoute(false); toast('Berkas terunggah ke Google Drive'); } catch (e) { toast(e.message, 'er'); } };
  rd.readAsDataURL(f);
};
ACT.edSave = async el => {
  const e = S.ui.ed; if (!e.materi.judul.trim()) { e.tab = 'info'; renderRoute(false); return toast('Judul materi wajib diisi', 'er'); }
  busy(el, true, 'Menyimpan…');
  try {
    const v = await rpc('simpanMateri', { materi: e.materi, konten: e.konten, tugas: e.tugas, tugasK: e.tugasK, periode: e.periode }); e.id = v.id; e.materi.id = v.id;
    for (const j of ['pretes', 'postes']) if (e.dirtySoal[j] && e.soalLoaded) { const r = await rpc('simpanSoal', { materiId: v.id, jenis: j, soal: e.soal[j] }); e.soal[j] = r.soal; if (j === 'pretes') v.nPre = r.n; else v.nPost = r.n; e.dirtySoal[j] = false; }
    const i = S.d.materi.findIndex(x => x.id === v.id), keep = i >= 0 ? S.d.materi[i] : null;
    v.nPre = e.soalLoaded ? e.soal.pretes.length : (keep ? keep.nPre : 0); v.nPost = e.soalLoaded ? e.soal.postes.length : (keep ? keep.nPost : 0);
    if (i >= 0) S.d.materi[i] = v; else S.d.materi.push(v);
    S.d.materi.sort((a, b) => a.urutan - b.urutan); if (e.hadK && !e.tugasK) { const tkId = (keep && keep.tugasK) ? keep.tugasK.id : null; if (tkId) { S.d.kelompok = S.d.kelompok.filter(g => g.tugasKId !== tkId); S.d.submitK = S.d.submitK.filter(s => s.tugasKId !== tkId); } }
    saveCache(); toast('Materi tersimpan'); busy(el, false);
    if (e.tugasK && !e.hadK) { editMateri(v.id); S.ui.ed.tab = 'kelompok'; renderRoute(false); toast('Tugas kelompok tersimpan. Silakan atur kelompok.'); } else { S.ui.ed = null; go('materi', undefined, true); S.hist = []; }
  } catch (x) { busy(el, false); toast(x.message, 'er'); }
};

/* ---------- PENGUMPULAN ---------- */
function pengumpulanPribadi() {
  const f = S.ui.f, q = (f.sq || '').toLowerCase();
  let L = S.d.submit.filter(s => { const u = mu(s.userId); if (!u) return false; return (!f.sk || u.kelasId === f.sk) && (!f.sm || s.materiId === f.sm) && (!f.ss || (f.ss === 'b' ? s.nilai == null : s.nilai != null)) && (!q || u.nama.toLowerCase().includes(q)); }).sort((a, b) => b.waktuKirim - a.waktuKirim);
  const pg = paginate('sub', L, 10), cnt = { a: S.d.submit.length, b: S.d.submit.filter(s => s.nilai == null).length };
  return '<div class="page-head"><div><h1>Tugas &amp; Penilaian</h1><p class="muted" style="margin:4px 0 0">Berkas jawaban tersimpan otomatis di Google Drive. Perlu dinilai: <b>' + cnt.b + '</b></p></div><div class="acts"><button class="btn btn-s" data-act="expSub">' + ic('file-earmark-excel') + ' Ekspor Excel</button></div></div><div class="card"><div class="filters"><label class="search"><i class="bi bi-search"></i><input data-in="fq" data-k="sq" placeholder="Cari nama murid…" value="' + esc(f.sq || '') + '" aria-label="Cari"></label><select class="sel" data-ch="ff" data-k="sk" aria-label="Kelas">' + kOpts(f.sk, 'Semua kelas') + '</select><select class="sel" data-ch="ff" data-k="sm" aria-label="Materi">' + mOpts(f.sm, 'Semua materi') + '</select><select class="sel" data-ch="ff" data-k="ss" aria-label="Status"><option value="">Semua status</option><option value="b"' + (f.ss === 'b' ? ' selected' : '') + '>Belum dinilai</option><option value="s"' + (f.ss === 's' ? ' selected' : '') + '>Sudah dinilai</option></select></div>' + subTable(pg.rows, true) + pg.html + '</div>';
}
R.pengumpulan = pengumpulanGuru;
IN.fq = debounce(el => { setF(el.dataset.k, el.value); const p = el.selectionStart; renderRoute(false); const n = document.querySelector('[data-in="fq"][data-k="' + el.dataset.k + '"]'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) { } } }, 220);
CH.ff = el => { setF(el.dataset.k, el.value); renderRoute(false); };
ACT.expSub = () => exportXlsx('Pengumpulan_Tugas', ['Murid', 'Kelas', 'Materi', 'Waktu Kirim', 'Nilai', 'Catatan'], S.d.submit.map(s => { const u = mu(s.userId), m = mt(s.materiId); return [u ? u.nama : '', u ? kls(u.kelasId) : '', m ? m.judul : '', fDT(s.waktuKirim), s.nilai, s.catatan]; }));

/* ---------- NILAI & LAPORAN (guru) ---------- */
function filteredLaporan() {
  const f = S.ui.f, q = (f.nq || '').toLowerCase();
  return laporan().filter(x => (!f.nk || x.u.kelasId === f.nk) && (!f.nm || x.m.id === f.nm) && (!q || x.u.nama.toLowerCase().includes(q)) &&
    (!f.nt || (f.nt === 'tuntas' ? x.akhir != null && x.akhir >= S.cfg.kkm : f.nt === 'remedial' ? x.akhir != null && x.akhir < S.cfg.kkm : f.nt === 'keluar' ? x.keluar : f.nt === 'belum' ? x.red : f.nt === 'blm' ? !x.lengkap : !x.done)));
}
function nilaiModulGuru() {
  const f = S.ui.f, L = filteredLaporan(), kkm = S.cfg.kkm, pg = paginate('lap', L, 12);
  const tun = L.filter(x => x.akhir != null && x.akhir >= kkm).length;
  return '<div class="page-head"><div><h1>Nilai &amp; Laporan</h1><p class="muted" style="margin:4px 0 0">Filter, cari, lalu unduh sebagai Excel atau PDF.</p></div><div class="acts"><button class="btn btn-s" data-act="expXlsx" data-m="guru">' + ic('file-earmark-excel') + ' Unduh Excel</button><button class="btn btn-p" data-act="expPdf" data-m="guru">' + ic('file-earmark-pdf') + ' Unduh PDF</button></div></div>' +
    '<div class="grid g4">' + stat('indigo', 'bar-chart', 'Rata-rata Pretes', num(avg(L.map(x => x.pre))), L.length + ' baris data') + stat('emerald', 'graph-up-arrow', 'Rata-rata Postes', num(avg(L.map(x => x.pos))), 'Target KKM ' + kkm) + stat('sky', 'award', 'Rata-rata Nilai Akhir', num(avg(L.map(x => x.akhir))), tun + ' tuntas · ' + L.filter(x => x.lengkap).length + ' lengkap') + stat('red', 'exclamation-triangle', 'Belum Dibaca', L.filter(x => x.red).length, L.filter(x => x.keluar).length + ' keluar saat tes') + '</div>' +
    '<div class="card mt"><div class="card-h"><div><h3>Perkembangan Rata-rata per Modul</h3><p>Pretes vs Postes (sesuai filter)</p></div></div><div class="chartbox sm"><canvas id="chLap" role="img" aria-label="Grafik rata-rata pretes dan postes per modul"></canvas></div></div>' +
    '<div class="card mt"><div class="filters"><label class="search"><i class="bi bi-search"></i><input data-in="fq" data-k="nq" placeholder="Cari nama murid…" value="' + esc(f.nq || '') + '" aria-label="Cari"></label><select class="sel" data-ch="ff" data-k="nk" aria-label="Kelas">' + kOpts(f.nk, 'Semua kelas') + '</select><select class="sel" data-ch="ff" data-k="nm" aria-label="Materi">' + mOpts(f.nm, 'Semua materi') + '</select><select class="sel" data-ch="ff" data-k="nt" aria-label="Status">' + [['', 'Semua status'], ['tuntas', 'Tuntas (≥ KKM)'], ['remedial', 'Remedial'], ['keluar', 'Keluar aplikasi'], ['belum', 'Belum dibaca'], ['belum2', 'Materi belum selesai'], ['blm', 'Nilai akhir belum lengkap']].map(o => '<option value="' + o[0] + '"' + (f.nt === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>' +
    '<div class="tw"><table class="tb"><thead><tr><th>Murid</th><th>Kelas</th><th>Materi</th><th>Status Materi</th><th>Pretes</th><th>Tugas</th><th>Postes</th><th>Akhir</th></tr></thead><tbody>' + (pg.rows.map(x => '<tr class="hv ' + (x.keluar ? 'hl' : '') + '"><td><div class="nm">' + avatarU(x.u.nama) + '<div><b>' + esc(x.u.nama) + '</b><small>' + esc(x.u.nisn || '') + '</small></div></div></td><td>' + esc(kls(x.u.kelasId)) + '</td><td>' + esc(x.m.judul) + '</td><td>' + (x.done ? '<span class="bd grn">Dipelajari</span>' : x.red ? '<span class="bd red">Belum Dibaca</span>' : '<span class="bd gry">Belum</span>') + (x.keluar ? ' <span class="bd red">Keluar app</span>' : '') + '</td><td><span class="sc a">' + num(x.pre, 0) + '</span></td><td><span class="sc ' + scCls(x.tug, kkm) + '">' + num(x.tug, 0) + '</span></td><td><span class="sc ' + scCls(x.pos, kkm) + '">' + num(x.pos, 0) + '</span></td><td>' + akhirCell(x) + '</td></tr>').join('') || '<tr><td colspan="8">' + emptyBox('search', 'Tidak ada data sesuai filter.') + '</td></tr>') + '</tbody></table></div>' + pg.html + '</div>';
}
function drawGuruNilai() {
  const L = filteredLaporan(), ms = S.d.materi.filter(m => L.some(x => x.m.id === m.id)); if (!document.getElementById('chLap')) return;
  mkChart('chLap', { type: 'line', data: { labels: ms.map((m, i) => shortM(m, i)), datasets: [{ label: 'Pretes', data: ms.map(m => avg(L.filter(x => x.m.id === m.id).map(x => x.pre))), borderColor: cv('--indigo'), backgroundColor: cv('--indigo'), tension: .4, borderWidth: 3, pointRadius: 5 }, { label: 'Postes', data: ms.map(m => avg(L.filter(x => x.m.id === m.id).map(x => x.pos))), borderColor: cv('--emerald'), backgroundColor: cv('--emerald'), tension: .4, borderWidth: 3, pointRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { min: 0, max: 100, grid: { color: cv('--bd-l') } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom' } } } });
}

/* ---------- KELOLA PENGGUNA ---------- */
function penggunaGuru() {
  const f = S.ui.f, tab = f.ut || 'murid', q = (f.uq || '').toLowerCase(), d = S.d;
  const kcount = k => d.murid.filter(u => u.kelasId === k).length;
  let body;
  if (tab === 'murid') {
    const L = d.murid.filter(u => (!f.uk || u.kelasId === f.uk) && (!f.us || (f.us === 'kunci' ? u.gagal >= 5 : f.us === 'aktif' ? u.aktif : !u.aktif)) && (!q || (u.nama + u.username + u.nisn).toLowerCase().includes(q))), pg = paginate('usr', L, 10);
    const prog = {}; d.progres.forEach(p => { if (p.status === 'sudah dipelajari') prog[p.userId] = (prog[p.userId] || 0) + 1; });
    body = '<div class="filters"><label class="search"><i class="bi bi-search"></i><input data-in="fq" data-k="uq" placeholder="Cari nama, NISN, atau username…" value="' + esc(f.uq || '') + '" aria-label="Cari murid"></label><select class="sel" data-ch="ff" data-k="uk" aria-label="Kelas">' + kOpts(f.uk, 'Semua rombel') + '</select><select class="sel" data-ch="ff" data-k="us" aria-label="Status akun"><option value="">Semua status akun</option><option value="aktif"' + (f.us === 'aktif' ? ' selected' : '') + '>Aktif</option><option value="nonaktif"' + (f.us === 'nonaktif' ? ' selected' : '') + '>Nonaktif</option><option value="kunci"' + (f.us === 'kunci' ? ' selected' : '') + '>Terkunci</option></select></div>' +
      '<div class="tw"><table class="tb"><thead><tr><th>Murid</th><th>Username</th><th>Kelas</th><th>Materi Selesai</th><th>Status</th><th>Terakhir Login</th><th>Aksi</th></tr></thead><tbody>' + (pg.rows.map(u => '<tr class="hv ' + (u.gagal >= 5 ? 'hl' : '') + '"><td><div class="nm">' + avatarU(u.nama) + '<div><b>' + esc(u.nama) + '</b><small>NISN: ' + esc(u.nisn || '–') + '</small></div></div></td><td class="mono">@' + esc(u.username) + '</td><td>' + esc(kls(u.kelasId)) + '</td><td>' + (prog[u.id] || 0) + ' materi</td><td>' + (u.gagal >= 5 ? '<span class="bd red">Terkunci (' + u.gagal + 'x gagal)</span>' : u.aktif ? '<span class="bd grn">Aktif</span>' : '<span class="bd gry">Nonaktif</span>') + '</td><td>' + (u.terakhirLogin ? ago(u.terakhirLogin) : 'Belum pernah') + '</td><td><div style="display:flex;gap:4px"><button class="btn btn-sm btn-p btn-ic" data-act="masukMurid" data-id="' + u.id + '" aria-label="Masuk sebagai ' + esc(u.nama) + '" title="Masuk sebagai murid (tanpa login)">' + ic('box-arrow-in-right') + '</button>' + (u.gagal >= 5 ? '<button class="btn btn-sm btn-o" data-act="unlock" data-id="' + u.id + '">Buka Kunci</button>' : '<button class="btn btn-sm btn-s btn-ic" data-act="resetPw" data-id="' + u.id + '" aria-label="Reset sandi ' + esc(u.nama) + '" title="Reset sandi">' + ic('key') + '</button>') + '<button class="btn btn-sm btn-s btn-ic" data-act="editMurid" data-id="' + u.id + '" aria-label="Ubah ' + esc(u.nama) + '" title="Ubah">' + ic('pencil') + '</button><button class="btn btn-sm btn-dl btn-ic" data-act="delMurid" data-id="' + u.id + '" aria-label="Hapus ' + esc(u.nama) + '" title="Hapus">' + ic('trash') + '</button></div></td></tr>').join('') || '<tr><td colspan="7">' + emptyBox('people', 'Belum ada murid. Tambah atau impor CSV.') + '</td></tr>') + '</tbody></table></div>' + pg.html;
  } else body = '<div class="grid g3">' + (d.kelas.map(k => '<div class="card hov"><div class="card-h" style="margin-bottom:8px"><span class="bd pur">' + esc(k.tahunAjaran || '–') + '</span><span style="font-size:22px;font-weight:700">' + kcount(k.id) + '<small class="muted" style="font-size:12px;font-weight:500"> siswa</small></span></div><h3>' + esc(k.nama) + '</h3><p class="muted" style="margin:4px 0 12px">Wali: ' + esc(k.wali || '–') + '</p><div style="display:flex;gap:6px"><button class="btn btn-sm btn-s" data-act="editKelas" data-id="' + k.id + '">' + ic('pencil') + ' Ubah</button><button class="btn btn-sm btn-dl" data-act="delKelas" data-id="' + k.id + '">' + ic('trash') + '</button></div></div>').join('') || emptyBox('door-open', 'Belum ada kelas.')) + '</div>';
  return '<div class="page-head"><div><span class="eyebrow">Modul Administrasi</span><h1>Kelola Akun Murid &amp; Rombel Kelas</h1><p class="muted" style="margin:4px 0 0">Sandi awal murid = NISN (atau username bila NISN kosong). Murid diminta mengganti saat login pertama.</p></div><div class="acts"><button class="btn btn-s" data-act="tplCsv">' + ic('download') + ' Template CSV</button><button class="btn btn-s" data-act="impor">' + ic('upload') + ' Impor Massal</button><button class="btn btn-s" data-act="newKelas">' + ic('door-open') + ' Tambah Kelas</button><button class="btn btn-p" data-act="newMurid">' + ic('person-plus') + ' Tambah Murid</button></div></div>' +
    '<div class="grid g4"><div class="stat s-indigo"><div class="ico">' + ic('people') + '</div><div><div class="lb">Total Murid</div><div class="v">' + d.murid.length + '</div><div class="sub">' + d.murid.filter(u => u.aktif).length + ' aktif</div></div></div><div class="stat s-sky"><div class="ico">' + ic('door-open') + '</div><div><div class="lb">Rombel Kelas</div><div class="v">' + d.kelas.length + '</div><div class="sub">tersedia</div></div></div><div class="stat s-amber"><div class="ico">' + ic('lock') + '</div><div><div class="lb">Akun Terkunci</div><div class="v">' + d.murid.filter(u => u.gagal >= 5).length + '</div><div class="sub">perlu dibuka kuncinya</div></div></div><div class="stat s-emerald"><div class="ico">' + ic('cloud-check') + '</div><div><div class="lb">Basis Data</div><div class="v" style="font-size:22px">Google Sheets</div><div class="sub">sinkron otomatis</div></div></div></div>' +
    '<div class="card mt"><div class="tabs"><button class="tab ' + (tab === 'murid' ? 'on' : '') + '" data-act="utab" data-t="murid">Data Murid (' + d.murid.length + ')</button><button class="tab ' + (tab === 'kelas' ? 'on' : '') + '" data-act="utab" data-t="kelas">Rombel Kelas (' + d.kelas.length + ')</button></div>' + body + '</div>';
}
R.pengguna = penggunaGuru;
ACT.utab = el => { setF('ut', el.dataset.t); renderRoute(false); };
ACT.unlock = async el => { try { await rpc('bukaKunci', { id: el.dataset.id }); mu(el.dataset.id).gagal = 0; saveCache(); refreshUI(); toast('Kunci akun dibuka'); } catch (e) { toast(e.message, 'er'); } };
ACT.resetPw = async el => { const u = mu(el.dataset.id); if (!await confirmBox('Reset sandi <b>' + esc(u.nama) + '</b> ke sandi awal (NISN / username)?', { ok: 'Reset sandi' })) return;
  try { const r = await rpc('resetSandi', { id: u.id }); u.gagal = 0; saveCache(); refreshUI(); modal({ size: 'sm', title: 'Sandi direset', body: '<p>Sandi baru untuk <b>' + esc(u.nama) + '</b>:</p><div class="mono" style="font-size:20px;font-weight:700;background:var(--card-2);padding:12px;border-radius:12px;text-align:center">' + esc(r.sandiBaru) + '</div><p class="muted" style="font-size:12px">Murid akan diminta menggantinya saat login.</p>', foot: '<button class="btn btn-p" data-close>Selesai</button>' }); } catch (e) { toast(e.message, 'er'); } };
ACT.delMurid = async el => { const u = mu(el.dataset.id); if (!await confirmBox('Hapus <b>' + esc(u.nama) + '</b> beserta seluruh nilai dan pengumpulannya? Untuk menonaktifkan sementara, gunakan tombol Ubah.', { title: 'Hapus murid', ok: 'Hapus', danger: true })) return;
  try { await rpc('hapusMurid', { id: u.id }); S.d.murid = S.d.murid.filter(x => x.id !== u.id); ['hasil', 'progres', 'submit'].forEach(k => S.d[k] = S.d[k].filter(x => x.userId !== u.id)); S.d.kelompok.forEach(g => { g.anggota = g.anggota.filter(i => i !== u.id); if (g.ketuaId === u.id) g.ketuaId = g.anggota[0] || ''; }); S.d.kelompok = S.d.kelompok.filter(g => g.anggota.length); saveCache(); refreshUI(); toast('Murid dihapus'); } catch (e) { toast(e.message, 'er'); } };
ACT.newMurid = () => muridForm(null); ACT.editMurid = el => muridForm(el.dataset.id);
function muridForm(id) {
  const u = id ? mu(id) : { nama: '', username: '', nisn: '', kelasId: S.ui.f.uk || '', aktif: true };
  const w = modal({ title: id ? 'Ubah Murid' : 'Tambah Murid', body: '<div class="field"><label for="mNama">Nama lengkap</label><input id="mNama" class="inp" value="' + esc(u.nama) + '"></div><div class="row2"><div class="field"><label for="mUn">Username</label><input id="mUn" class="inp" autocapitalize="none" value="' + esc(u.username) + '"></div><div class="field"><label for="mNisn">NISN</label><input id="mNisn" class="inp" inputmode="numeric" value="' + esc(u.nisn) + '"></div></div><div class="row2"><div class="field"><label for="mKls">Kelas</label><select id="mKls" class="sel">' + kOpts(u.kelasId, '— pilih kelas —') + '</select></div><div class="field"><label>Status akun</label><label style="display:flex;gap:10px;align-items:center;min-height:46px">' + swHtml(u.aktif, 'id="mAktif"', 'Aktif') + ' Aktif</label></div></div><div id="mErr" class="ferr hide"></div>', foot: '<button class="btn btn-s" data-close>Batal</button><button class="btn btn-p" id="mSave">Simpan</button>' });
  $('#mSave', w).onclick = async e => { busy(e.currentTarget, true); try { const r = await rpc('simpanMurid', { id: id, nama: $('#mNama', w).value, username: $('#mUn', w).value, nisn: $('#mNisn', w).value, kelasId: $('#mKls', w).value, aktif: $('#mAktif', w).checked });
    if (id) Object.assign(mu(id), r, { gagal: mu(id).gagal }); else S.d.murid.push(Object.assign({ gagal: 0 }, r)); saveCache(); closeM(w, 'force'); refreshUI(); toast('Data murid tersimpan'); } catch (x) { $('#mErr', w).textContent = x.message; $('#mErr', w).classList.remove('hide'); busy(e.currentTarget, false); } };
}
ACT.newKelas = () => kelasForm(null); ACT.editKelas = el => kelasForm(el.dataset.id);
function kelasForm(id) {
  const k = id ? S.d.kelas.find(x => x.id === id) : { nama: '', tahunAjaran: S.cfg.tahunAjaran, wali: '' };
  const w = modal({ size: 'sm', title: id ? 'Ubah Kelas' : 'Tambah Kelas', body: '<div class="field"><label for="kN">Nama kelas</label><input id="kN" class="inp" value="' + esc(k.nama) + '" placeholder="XI-MIPA 1"></div><div class="field"><label for="kT">Tahun ajaran</label><input id="kT" class="inp" value="' + esc(k.tahunAjaran) + '"></div><div class="field"><label for="kW">Wali kelas</label><input id="kW" class="inp" value="' + esc(k.wali) + '"></div><div id="kErr" class="ferr hide"></div>', foot: '<button class="btn btn-s" data-close>Batal</button><button class="btn btn-p" id="kSave">Simpan</button>' });
  $('#kSave', w).onclick = async e => { busy(e.currentTarget, true); try { const r = await rpc('simpanKelas', { id: id, nama: $('#kN', w).value, tahunAjaran: $('#kT', w).value, wali: $('#kW', w).value }); const i = S.d.kelas.findIndex(x => x.id === r.id); if (i >= 0) S.d.kelas[i] = r; else S.d.kelas.push(r); saveCache(); closeM(w, 'force'); refreshUI(); toast('Kelas tersimpan'); } catch (x) { $('#kErr', w).textContent = x.message; $('#kErr', w).classList.remove('hide'); busy(e.currentTarget, false); } };
}
ACT.delKelas = async el => { if (!await confirmBox('Hapus kelas ini?', { ok: 'Hapus', danger: true })) return; try { await rpc('hapusKelas', { id: el.dataset.id }); S.d.kelas = S.d.kelas.filter(k => k.id !== el.dataset.id); saveCache(); refreshUI(); toast('Kelas dihapus'); } catch (e) { toast(e.message, 'er'); } };
ACT.tplCsv = () => download('template_murid.csv', 'nama,username,nisn,kelas\nAisyah Putri Rahma,aisyah.putri,0072918340,XI-MIPA 1\nSiti Nur Annisa,siti.annisa,0068943210,XI-MIPA 1\n', 'text/csv;charset=utf-8');
function download(name, content, mime) {
  const b = content instanceof Blob ? content : new Blob(['\ufeff' + content], { type: mime }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function parseCsv(t) {
  const lines = t.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean); if (!lines.length) return [];
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',', cells = l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
  let head = cells(lines[0]).map(h => h.toLowerCase()), start = 0, ix = { nama: 0, username: 1, nisn: 2, kelas: 3 };
  if (head.includes('nama')) { start = 1; ix = {}; ['nama', 'username', 'nisn', 'kelas'].forEach(k => ix[k] = head.indexOf(k)); }
  return lines.slice(start).map(l => { const c = cells(l); return { nama: c[ix.nama] || '', username: ix.username >= 0 ? c[ix.username] || '' : '', nisn: ix.nisn >= 0 ? c[ix.nisn] || '' : '', kelas: ix.kelas >= 0 ? c[ix.kelas] || '' : '' }; });
}
ACT.impor = () => {
  let rows = [];
  const w = modal({ title: 'Impor Massal Murid (CSV)', body: '<p class="muted" style="margin-top:0">Kolom: <span class="mono">nama, username, nisn, kelas</span>. Impor bersifat idempoten (username sama = diperbarui, tidak dobel). Kelas baru dibuat otomatis.</p><label class="drop" for="imFile">' + ic('file-earmark-spreadsheet') + ' <b>Pilih berkas CSV</b></label><input type="file" id="imFile" accept=".csv,.txt,text/csv" class="sr-only"><div class="field mt"><label for="imTxt">…atau tempel data di sini</label><textarea id="imTxt" class="txa" style="min-height:110px" placeholder="Nama,Username,NISN,Kelas"></textarea></div><div id="imRes"></div>', foot: '<button class="btn btn-s" data-close>Tutup</button><button class="btn btn-s" id="imScan">' + ic('search') + ' Pindai (dry-run)</button><button class="btn btn-p" id="imRun" disabled>' + ic('cloud-upload') + ' Jalankan Impor</button>' });
  $('#imFile', w).onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#imTxt', w).value = r.result; }; r.readAsText(f); };
  const call = async (dry, btn) => { rows = parseCsv($('#imTxt', w).value); if (!rows.length) return toast('Data kosong', 'er'); busy(btn, true, dry ? 'Memindai…' : 'Mengimpor…');
    try { const tot = { tambah: 0, perbarui: 0, lewati: 0, kelasBaru: 0, galat: [] };
      for (let i = 0; i < rows.length; i += 60) { const r = await rpc('importMurid', { rows: rows.slice(i, i + 60), dryRun: dry }, { retry: 1 }); ['tambah', 'perbarui', 'lewati', 'kelasBaru'].forEach(k => tot[k] += r[k]); r.galat.forEach(g => tot.galat.push(g)); if (!dry) $('#imRes', w).innerHTML = '<p class="muted">Memproses ' + Math.min(i + 60, rows.length) + ' / ' + rows.length + '…</p>'; }
      $('#imRes', w).innerHTML = '<div class="grid g4" style="margin-top:12px">' + [['Ditambah', tot.tambah, 'grn'], ['Diperbarui', tot.perbarui, 'blu'], ['Dilewati', tot.lewati, 'amb'], ['Kelas baru', tot.kelasBaru, 'pur']].map(x => '<div class="mini"><div><small>' + x[0] + '</small><b>' + x[1] + '</b></div></div>').join('') + '</div>' + (tot.galat.length ? '<div class="alert" style="margin:12px 0 0"><i class="bi bi-exclamation-triangle"></i><div><b>Catatan</b><span>' + tot.galat.slice(0, 8).map(esc).join('<br>') + '</span></div></div>' : '');
      if (dry) $('#imRun', w).disabled = false; else { toast('Impor selesai: +' + tot.tambah + ' murid'); await refresh(true); closeM(w, 'force'); renderRoute(false); }
    } catch (x) { toast(x.message, 'er'); } finally { busy(btn, false); } };
  $('#imScan', w).onclick = e => call(true, e.currentTarget); $('#imRun', w).onclick = e => call(false, e.currentTarget);
};

/* ---------- LOG KEAMANAN TES ---------- */
function logTes() {
  const d = S.d, today = new Date().setHours(0, 0, 0, 0), H = d.hasil.filter(h => h.pelanggaran > 0 || h.status === 'keluar aplikasi' || h.status === 'berjalan').sort((a, b) => (b.selesai || b.mulai) - (a.selesai || a.mulai));
  const k = d.hasil.filter(h => h.status === 'keluar aplikasi'), tdy = k.filter(h => h.selesai >= today).length, run = d.hasil.filter(h => h.status === 'berjalan').length;
  const pat = d.hasil.length ? Math.round((1 - k.length / d.hasil.length) * 1000) / 10 : 100, pg = paginate('log', H, 10);
  return '<div class="page-head"><div><span class="eyebrow">Live Monitoring</span><h1>Log Aktivitas &amp; Audit Pelanggaran Ujian</h1><p class="muted" style="margin:4px 0 0">Sistem mendeteksi pindah tab/jendela lalu mengakhiri tes di server. Toleransi saat ini: <b>' + S.cfg.toleransiTes + 'x peringatan</b>.</p></div><div class="acts"><button class="btn btn-s" data-act="expLog">' + ic('download') + ' Ekspor Log (CSV)</button><button class="btn btn-p" data-act="go" data-r="pengaturan">' + ic('sliders') + ' Setelan Toleransi</button></div></div>' +
    '<div class="grid g4">' + stat('red', 'shield-x', 'Kasus Hari Ini', tdy, k.length + ' total keluar aplikasi') + stat('amber', 'hourglass-split', 'Tes Berjalan', run, 'sedang dikerjakan murid') + stat('sky', 'journal-x', 'Pelanggaran Tercatat', d.hasil.reduce((a, h) => a + (h.pelanggaran || 0), 0), 'peringatan keseluruhan') + stat('emerald', 'shield-check', 'Tingkat Kepatuhan', pat + '%', d.hasil.length + ' sesi tes') + '</div>' +
    '<div class="card mt"><div class="card-h"><div><h3>Daftar Insiden Pelanggaran Integritas</h3><p>Tes yang terhenti paksa, ada peringatan, atau masih berjalan.</p></div></div><div class="tw"><table class="tb"><thead><tr><th>Peserta</th><th>Modul &amp; Ujian</th><th>Waktu</th><th>Nilai Parsial</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>' + (pg.rows.map(h => { const u = mu(h.userId), m = mt(h.materiId); if (!u || !m) return ''; return '<tr class="hv ' + (h.status === 'keluar aplikasi' ? 'hl' : '') + '"><td><div class="nm">' + avatarU(u.nama) + '<div><b>' + esc(u.nama) + '</b><small>' + esc(kls(u.kelasId)) + '</small></div></div></td><td>' + esc(m.judul) + '<br><small class="muted">' + NAMA[h.jenis] + '</small></td><td>' + fDT(h.selesai || h.mulai) + '</td><td><b class="num">' + (h.status === 'berjalan' ? '–' : num(h.nilai, 0) + ' / 100') + '</b><br><small class="muted">' + (h.status === 'berjalan' ? '' : h.benar + ' benar dari ' + h.total) + '</small></td><td>' + (h.status === 'keluar aplikasi' ? '<span class="bd red">Keluar aplikasi</span>' : h.status === 'berjalan' ? '<span class="bd amb">Berjalan</span>' : '<span class="bd gry">' + esc(h.status) + '</span>') + (h.pelanggaran ? '<br><small class="muted">' + h.pelanggaran + 'x peringatan</small>' : '') + '</td><td><button class="btn btn-sm btn-s" data-act="masukMurid" data-id="' + u.id + '" title="Lihat sebagai murid">' + ic('eye') + '</button> <button class="btn btn-sm btn-p" data-act="resetTes" data-id="' + h.id + '">' + ic('arrow-counterclockwise') + ' Reset Izin</button></td></tr>'; }).join('') || '<tr><td colspan="6">' + emptyBox('shield-check', 'Tidak ada insiden. Semua tes berjalan bersih.') + '</td></tr>') + '</tbody></table></div>' + pg.html + '</div>' +
    '<div class="card mt"><div class="card-h"><div><h3>' + ic('clock-history') + ' Log Aktivitas Sistem</h3><p>200 aktivitas terakhir (login, tes, nilai, pengaturan).</p></div><button class="btn btn-s btn-sm" data-act="loadLog">Muat log</button></div><div id="logBox" class="muted">Klik “Muat log”.</div></div>';
}
R.logtes = logTes;
ACT.loadLog = async el => { busy(el, true); try { const r = await rpc('getLog'); S.ui.logs = r; $('#logBox').innerHTML = '<div class="tw"><table class="tb" style="min-width:480px"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th></tr></thead><tbody>' + r.map(l => '<tr><td style="white-space:nowrap">' + fDT(l.waktu) + '</td><td>' + esc(l.nama) + '</td><td>' + esc(l.aksi) + '</td></tr>').join('') + '</tbody></table></div>'; } catch (e) { toast(e.message, 'er'); } finally { busy(el, false); } };
ACT.expLog = () => download('log_tes.csv', 'Peserta,Kelas,Materi,Ujian,Nilai,Status,Pelanggaran,Waktu\n' + S.d.hasil.filter(h => h.pelanggaran > 0 || h.status === 'keluar aplikasi').map(h => { const u = mu(h.userId) || {}, m = mt(h.materiId) || {}; return [u.nama, kls(u.kelasId), m.judul, h.jenis, h.nilai, h.status, h.pelanggaran, fDT(h.selesai || h.mulai)].map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','); }).join('\n'), 'text/csv;charset=utf-8');

/* ---------- PENGATURAN ---------- */
function pengaturan() {
  const c = S.cfg, f = (k, l, t, h) => '<div class="field"><label for="cf_' + k + '">' + l + '</label><input id="cf_' + k + '" class="inp" ' + (t || '') + ' value="' + esc(c[k]) + '" data-cfk="' + k + '">' + (h ? '<small class="muted">' + h + '</small>' : '') + '</div>';
  return '<div class="page-head"><div><h1>Pengaturan</h1><p class="muted" style="margin:4px 0 0">Identitas madrasah, tahun ajaran, KKM, bobot nilai, dan toleransi keamanan tes.</p></div></div><div class="grid g2"><div class="card"><div class="card-h"><h3>Identitas Madrasah</h3></div>' + f('namaMadrasah', 'Nama madrasah') + f('namaApp', 'Nama aplikasi') + f('subJudul', 'Sub judul') + '<div class="row2">' + f('tahunAjaran', 'Tahun ajaran') + '<div class="field"><label for="cf_semester">Semester</label><select id="cf_semester" class="sel" data-cfk="semester"><option' + (c.semester === 'Ganjil' ? ' selected' : '') + '>Ganjil</option><option' + (c.semester === 'Genap' ? ' selected' : '') + '>Genap</option></select></div></div><p class="muted" style="font-size:12px;margin:0">Hak cipta di footer: © Ufi Syaiful Ulum, Gr.</p></div>' +
    '<div class="card"><div class="card-h"><h3>Penilaian &amp; Keamanan Tes</h3></div><div class="row2">' + f('kkm', 'KKM', 'type="number" min="0" max="100"') + f('toleransiTes', 'Toleransi pelanggaran', 'type="number" min="0" max="5"', '0 = tes langsung berakhir saat keluar; 1 = satu peringatan.') + '</div><label style="display:flex;gap:10px;align-items:center;margin:0 0 10px;cursor:pointer">' + swHtml(c.belTes !== 0, 'data-cfk="belTes" id="cf_belTes"', 'Bel peringatan tes') + '<span>Bunyikan <b>bel</b> pada pelanggaran ke-2 saat tes</span></label><button class="btn btn-s btn-sm" data-act="ujiBel" style="margin:0 0 14px">' + ic('bell') + ' Uji bel</button><div class="row2">' + f('bobotPretes', 'Bobot Pretes (%)', 'type="number" min="0"') + f('bobotTugas', 'Bobot Tugas (%)', 'type="number" min="0"') + '</div>' + f('bobotPostes', 'Bobot Postes (%)', 'type="number" min="0"', 'Nilai akhir modul = rata-rata tertimbang; muncul bila semua tahap bernilai lengkap.') + '</div></div><div class="grid g2" style="margin-top:16px"><div class="card"><div class="card-h"><div><h3>Rumus Nilai Semester</h3><p>Nilai Semester = Harian × bobot + STS × bobot + SAS × bobot. Harian = rata-rata nilai akhir modul.</p></div></div><div class="row2">' + f('bobotHarian', 'Bobot Harian (%)', 'type="number" min="0"') + f('bobotSTS', 'Bobot STS (%)', 'type="number" min="0"') + '</div>' + f('bobotSAS', 'Bobot SAS (%)', 'type="number" min="0"', 'Total tidak harus 100; sistem menormalkan otomatis (default 50/25/25).') + '</div><div class="card"><div class="card-h"><div><h3>Tanda Tangan Jurnal</h3><p>Dipakai pada cetak PDF jurnal harian.</p></div></div>' + f('namaGuru', 'Nama guru mata pelajaran') + f('nipGuru', 'NIP guru') + f('namaKepala', 'Nama kepala madrasah') + f('nipKepala', 'NIP kepala madrasah') + f('kotaTTD', 'Kota penandatanganan') + '</div></div><div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-p" data-act="saveCfg" id="cfSave">' + ic('check2-circle') + ' Simpan Pengaturan</button>' + (S.d.ssUrl ? '<a class="btn btn-s" target="_blank" rel="noopener" href="' + esc(S.d.ssUrl) + '">' + ic('table') + ' Spreadsheet Database</a>' : '') + (S.d.folderUrl ? '<a class="btn btn-s" target="_blank" rel="noopener" href="' + esc(S.d.folderUrl) + '">' + ic('folder2-open') + ' Folder Drive</a>' : '') + '</div>';
}
R.pengaturan = pengaturan;
ACT.saveCfg = async el => { const cfg = {}; $$('[data-cfk]').forEach(i => cfg[i.dataset.cfk] = i.type === 'checkbox' ? (i.checked ? 1 : 0) : i.value); busy(el, true); try { S.cfg = await rpc('simpanConfig', { cfg }); S.d.cfg = S.cfg; applyIdentity(); saveCache(); toast('Pengaturan tersimpan'); } catch (e) { toast(e.message, 'er'); } finally { busy(el, false); } };


/* =====================================================================
 * REVISI 2 — Template Excel soal, masuk sebagai murid, absensi
 * ===================================================================== */
const SOAL_HEAD = ['No', 'Pertanyaan', 'Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D', 'Kunci Jawaban (A/B/C/D)', 'Bobot'];
const jenisEd = () => S.ui.ed.tab === 'postes' ? 'Postes' : 'Pretes';
async function tulisXlsxSoal(nama, rows, petunjuk) {
  try {
    await lib('xlsx'); const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([SOAL_HEAD].concat(rows));
    ws['!cols'] = [{ wch: 5 }, { wch: 60 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 24 }, { wch: 8 }]; XLSX.utils.book_append_sheet(wb, ws, 'Soal ' + jenisEd());
    if (petunjuk) { const w2 = XLSX.utils.aoa_to_sheet([['PETUNJUK PENGISIAN'], [''], ['1. Isi satu soal per baris pada sheet "Soal ' + jenisEd() + '". Jangan mengubah judul kolom.'], ['2. Kolom Pertanyaan, Pilihan A, dan Pilihan B wajib diisi. Pilihan C dan D boleh dikosongkan.'], ['3. Kunci Jawaban diisi satu huruf: A, B, C, atau D.'], ['4. Bobot angka bulat (kosong = 1). Nilai = total bobot benar / total bobot × 100.'], ['5. Baris yang diawali [CONTOH] diabaikan saat impor. Hapus atau timpa baris contoh.'], ['6. ' + (jenisEd() === 'Pretes' ? 'Pretes disarankan 5 soal.' : 'Jumlah soal Postes bebas.')], ['7. Simpan, lalu unggah lewat tombol "Impor Soal dari Excel" di editor materi, kemudian klik "Simpan Semua".'], [''], [S.cfg.namaMadrasah || MADRASAH]]); w2['!cols'] = [{ wch: 100 }]; XLSX.utils.book_append_sheet(wb, w2, 'Petunjuk'); }
    XLSX.writeFile(wb, nama + '.xlsx'); toast('Berkas Excel diunduh');
  } catch (e) { download(nama + '.csv', SOAL_HEAD.join(',') + '\n' + rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv;charset=utf-8'); toast('Pustaka Excel gagal dimuat — diunduh sebagai CSV (tetap bisa diimpor)', 'er'); }
}
ACT.tplSoal = () => tulisXlsxSoal('Template_Soal_' + jenisEd(), [[1, '[CONTOH] Memecah masalah besar menjadi bagian kecil disebut ...', 'Abstraksi', 'Dekomposisi', 'Algoritma', 'Pola', 'B', 1], [2, '[CONTOH] Mana yang BUKAN pilar berpikir komputasional?', 'Dekomposisi', 'Abstraksi', 'Menghafal tanpa memahami', 'Algoritma', 'C', 1]], true);
ACT.expSoal = () => { const e = S.ui.ed, L = e.soal[e.tab]; if (!L.length) return toast('Belum ada soal untuk diekspor', 'er'); tulisXlsxSoal('Soal_' + jenisEd() + '_' + (e.materi.judul || 'materi').replace(/\W+/g, '_').slice(0, 30), L.map((s, i) => [i + 1, s.pertanyaan, s.a, s.b, s.c, s.d, s.kunci, s.bobot || 1]), false); };
function parseSoalRows(rows) {
  let hi = rows.findIndex(r => r.some(c => /pertanyaan/i.test(String(c)))); if (hi < 0) hi = 0;
  const H = (rows[hi] || []).map(c => String(c).toLowerCase().trim()), col = (re, d) => { const i = H.findIndex(h => re.test(h)); return i >= 0 ? i : d; };
  const ci = { q: col(/pertanyaan/, 1), a: col(/^(pilihan\s*)?a$/, 2), b: col(/^(pilihan\s*)?b$/, 3), c: col(/^(pilihan\s*)?c$/, 4), d: col(/^(pilihan\s*)?d$/, 5), k: col(/kunci/, 6), w: col(/bobot/, 7) };
  const ok = [], err = [];
  rows.slice(hi + 1).forEach((r, i) => {
    const g = k => String(r[ci[k]] == null ? '' : r[ci[k]]).trim(), q = g('q'), baris = hi + i + 2;
    if (!q && !g('a') && !g('b')) return; if (/^\[contoh\]/i.test(q)) return;
    const key = g('k').toUpperCase().charAt(0), bobot = Math.max(1, parseInt(g('w'), 10) || 1);
    if (!q) return err.push({ baris, msg: 'pertanyaan kosong' }); if (!g('a') || !g('b')) return err.push({ baris, msg: 'Pilihan A dan B wajib diisi' });
    if (!/^[A-D]$/.test(key)) return err.push({ baris, msg: 'kunci harus A/B/C/D' });
    if (!g(key.toLowerCase())) return err.push({ baris, msg: 'kunci mengarah ke pilihan ' + key + ' yang kosong' });
    ok.push({ pertanyaan: q, a: g('a'), b: g('b'), c: g('c'), d: g('d'), kunci: key, bobot });
  });
  return { ok, err };
}
CH.impSoal = async el => {
  const f = el.files[0]; el.value = ''; if (!f) return;
  try {
    await lib('xlsx'); const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }), nm = wb.SheetNames.find(n => /soal/i.test(n)) || wb.SheetNames[0];
    const res = parseSoalRows(XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: '' })), e = S.ui.ed, j = e.tab, has = e.soal[j].length;
    const w = modal({ size: 'sm', title: 'Impor Soal ' + jenisEd(), body: '<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px"><div class="mini"><div style="color:var(--ok-tx)">' + ic('check-circle') + '</div><div><small>Soal valid</small><b>' + res.ok.length + '</b></div></div><div class="mini"><div style="color:var(--danger)">' + ic('x-circle') + '</div><div><small>Baris bermasalah</small><b>' + res.err.length + '</b></div></div></div>' + (res.err.length ? '<div class="alert" style="margin:12px 0 0"><i class="bi bi-exclamation-triangle"></i><div><b>Perbaiki di Excel lalu impor ulang</b><span>' + res.err.slice(0, 8).map(x => 'Baris ' + x.baris + ': ' + esc(x.msg)).join('<br>') + (res.err.length > 8 ? '<br>…dan ' + (res.err.length - 8) + ' lainnya' : '') + '</span></div></div>' : '') + (res.ok.length && has ? '<p class="muted" style="margin:12px 0 0;font-size:12.5px">Sudah ada ' + has + ' soal ' + jenisEd() + '. Pilih cara impor:</p>' : ''),
      foot: '<button class="btn btn-s" data-close>Batal</button>' + (res.ok.length ? (has ? '<button class="btn btn-s" data-m="add">Tambahkan</button><button class="btn btn-p" data-m="rep">Ganti semua</button>' : '<button class="btn btn-p" data-m="rep">Impor ' + res.ok.length + ' soal</button>') : '') });
    w.addEventListener('click', ev => { const b = ev.target.closest('[data-m]'); if (!b) return; e.soal[j] = b.dataset.m === 'add' ? e.soal[j].concat(res.ok) : res.ok; e.dirtySoal[j] = true; closeM(w, 'force'); renderRoute(false); toast(res.ok.length + ' soal diimpor. Klik "Simpan Semua" untuk menyimpan.'); });
  } catch (x) { toast('Gagal membaca berkas Excel: ' + x.message, 'er'); }
};

/* ---------- Masuk sebagai murid (mode pantau, tanpa login) ---------- */
ACT.masukMurid = async el => {
  const u = mu(el.dataset.id); if (!u) return;
  if (!await confirmBox('Masuk ke akun <b>' + esc(u.nama) + '</b> tanpa sandi? Anda hanya dapat <b>melihat</b> (tidak mengubah nilai/tes/tugas). Aktivitas ini tercatat di log.', { title: 'Masuk sebagai murid', ok: 'Masuk' })) return;
  try {
    const r = await rpc('impersonasi', { id: u.id });
    S.back = { token: S.token, d: S.d, route: S.route, hist: S.hist }; S.token = r.token; S.imp = u.nama; S.route = ''; S.hist = [];
    Object.keys(S.charts).forEach(k => { try { S.charts[k].destroy(); } catch (e) { } }); S.charts = {}; S.ui.f = {}; S.ui.pg = {};
    startApp(r.boot, true); toast('Melihat sebagai ' + u.nama);
  } catch (e) { toast(e.message, 'er'); }
};
ACT.keluarImp = () => {
  const b = S.back; if (!b) return; $('#pop').classList.remove('on');
  S.back = null; S.imp = null; S.token = b.token; S.route = b.route || ''; S.hist = b.hist || []; S.ui.f = {}; S.ui.pg = {};
  Object.keys(S.charts).forEach(k => { try { S.charts[k].destroy(); } catch (e) { } }); S.charts = {};
  startApp(b.d, true); refresh(true); toast('Kembali ke akun guru');
};

/* ---------- ABSENSI ---------- */
const ABS = [['hadir', 'H', 'Hadir'], ['izin', 'I', 'Izin'], ['sakit', 'S', 'Sakit'], ['alpa', 'A', 'Alpa']];
const todayStr = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const fTgl = s => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const absCls = s => ({ hadir: 'grn', izin: 'blu', sakit: 'amb', alpa: 'red' }[s] || 'gry');
function abState() { if (!S.ui.ab) S.ui.ab = { mode: 'input', kelas: (S.d.kelas[0] || {}).id || '', tgl: todayStr(), materi: '', draft: {}, loaded: false, loading: false, bulan: todayStr().slice(0, 7), rek: [], rekLoaded: false, rekLoading: false }; return S.ui.ab; }
function absensiGuru() {
  const ab = abState(), d = S.d, sis = d.murid.filter(u => u.kelasId === ab.kelas && u.aktif);
  const tabs = '<div class="tabs"><button class="tab ' + (ab.mode === 'input' ? 'on' : '') + '" data-act="abMode" data-v="input">Isi Absensi</button><button class="tab ' + (ab.mode === 'rekap' ? 'on' : '') + '" data-act="abMode" data-v="rekap">Rekap Bulanan</button></div>';
  const head = '<div class="page-head"><div><h1>Absensi Kehadiran</h1><p class="muted" style="margin:4px 0 0">Catat kehadiran per kelas dan tanggal. Murid melihat rekap kehadirannya sendiri.</p></div></div>';
  if (!d.kelas.length) return head + '<div class="card">' + emptyBox('door-open', 'Belum ada kelas. Tambahkan kelas di Kelola Pengguna.') + '</div>';
  const kSel = '<select class="sel" data-ch="abK" aria-label="Kelas">' + kOpts(ab.kelas) + '</select>';
  if (ab.mode === 'input') {
    const cnt = { hadir: 0, izin: 0, sakit: 0, alpa: 0, belum: 0 }; sis.forEach(u => { const x = ab.draft[u.id]; if (x && x.status) cnt[x.status]++; else cnt.belum++; });
    return head + tabs + '<div class="card"><div class="filters" style="grid-template-columns:1fr 1fr"><div class="field" style="margin:0"><label>Kelas</label>' + kSel + '</div><div class="field" style="margin:0"><label for="abT">Tanggal</label><input id="abT" type="date" class="inp" value="' + ab.tgl + '" max="' + todayStr() + '" data-ch="abT"></div><div class="field" style="margin:0;grid-column:1/-1"><label>Modul / pertemuan (opsional)</label><select class="sel" data-ch="abM">' + mOpts(ab.materi, '— tanpa keterangan modul —') + '</select></div></div>' +
      '<div class="flow" style="margin:6px 0 14px"><span class="d">Hadir ' + cnt.hadir + '</span><span class="a">Izin ' + cnt.izin + '</span><span style="background:var(--warn-bg);color:var(--warn-tx)">Sakit ' + cnt.sakit + '</span><span class="r">Alpa ' + cnt.alpa + '</span><span>Belum diisi ' + cnt.belum + '</span></div>' +
      (!ab.loaded ? '<div class="skel" style="height:180px"></div>' : sis.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn btn-s btn-sm" data-act="abAll">' + ic('check2-all') + ' Tandai semua hadir</button></div><div class="tw"><table class="tb" style="min-width:560px"><thead><tr><th>No</th><th>Murid</th><th>Kehadiran</th><th>Catatan</th></tr></thead><tbody>' + sis.map((u, i) => { const x = ab.draft[u.id] || {}; return '<tr class="hv"><td>' + (i + 1) + '</td><td><div class="nm">' + avatarU(u.nama) + '<div><b>' + esc(u.nama) + '</b><small>' + esc(u.nisn || '@' + u.username) + '</small></div></div></td><td><div class="seg" role="radiogroup" aria-label="Kehadiran ' + esc(u.nama) + '">' + ABS.map(a => '<button type="button" class="' + a[0] + ' ' + (x.status === a[0] ? 'on' : '') + '" data-act="abSet" data-u="' + u.id + '" data-s="' + a[0] + '" role="radio" aria-checked="' + (x.status === a[0]) + '" title="' + a[2] + '">' + a[1] + '</button>').join('') + '</div></td><td><input class="inp" style="min-height:40px" data-in="abC" data-u="' + u.id + '" value="' + esc(x.catatan || '') + '" placeholder="Catatan (opsional)" aria-label="Catatan ' + esc(u.nama) + '"></td></tr>'; }).join('') + '</tbody></table></div><div style="margin-top:14px;display:flex;justify-content:flex-end"><button class="btn btn-p" data-act="abSave" id="abSaveBtn">' + ic('check2-circle') + ' Simpan Absensi</button></div>' : emptyBox('people', 'Belum ada murid aktif di kelas ini.')) + '</div>';
  }
  const dates = []; ab.rek.forEach(r => { if (dates.indexOf(r.tanggal) < 0) dates.push(r.tanggal); }); dates.sort();
  const by = {}; ab.rek.forEach(r => { (by[r.userId] = by[r.userId] || {})[r.tanggal] = r.status; });
  return head + tabs + '<div class="card"><div class="filters" style="grid-template-columns:1fr 1fr"><div class="field" style="margin:0"><label>Kelas</label>' + kSel + '</div><div class="field" style="margin:0"><label for="abB">Bulan</label><input id="abB" type="month" class="inp" value="' + ab.bulan + '" data-ch="abB"></div></div>' +
    (!ab.rekLoaded ? '<div class="skel" style="height:180px"></div>' : !dates.length ? emptyBox('calendar-x', 'Belum ada absensi pada bulan ini.') : '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 12px"><button class="btn btn-s btn-sm" data-act="abXlsx">' + ic('file-earmark-excel') + ' Excel</button><button class="btn btn-s btn-sm" data-act="abPdf">' + ic('file-earmark-pdf') + ' PDF</button></div><div class="tw"><table class="tb stickyc" style="min-width:' + (360 + dates.length * 40) + 'px"><thead><tr><th>Murid</th>' + dates.map(t => '<th style="text-align:center">' + (+t.slice(8)) + '</th>').join('') + '<th>H</th><th>I</th><th>S</th><th>A</th><th>% Hadir</th></tr></thead><tbody>' + sis.map(u => { const m = by[u.id] || {}, c = { hadir: 0, izin: 0, sakit: 0, alpa: 0 }; dates.forEach(t => { if (m[t]) c[m[t]]++; }); const tot = c.hadir + c.izin + c.sakit + c.alpa, pct = tot ? Math.round(c.hadir / tot * 100) : null;
      return '<tr class="hv"><td><b>' + esc(u.nama) + '</b></td>' + dates.map(t => '<td style="text-align:center">' + (m[t] ? '<span class="abc ' + m[t] + '">' + m[t][0].toUpperCase() + '</span>' : '<span class="muted3">·</span>') + '</td>').join('') + '<td>' + c.hadir + '</td><td>' + c.izin + '</td><td>' + c.sakit + '</td><td>' + c.alpa + '</td><td><b class="num" style="color:' + (pct != null && pct < 75 ? 'var(--danger)' : 'inherit') + '">' + (pct == null ? '–' : pct + '%') + '</b></td></tr>'; }).join('') + '</tbody></table></div>') + '</div>';
}
function absensiMurid() {
  const L = (S.d.absensi || []).slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal)), c = { hadir: 0, izin: 0, sakit: 0, alpa: 0 }; L.forEach(x => { if (c[x.status] != null) c[x.status]++; });
  const pct = L.length ? Math.round(c.hadir / L.length * 100) : null, pg = paginate('abm', L, 12);
  return '<div class="page-head"><div><h1>Kehadiran Saya</h1><p class="muted" style="margin:4px 0 0">Rekap absensi yang dicatat guru.</p></div></div><div class="grid g4">' + stat('emerald', 'calendar-check', 'Kehadiran', pct == null ? '–' : pct + '%', L.length + ' pertemuan tercatat') + stat('indigo', 'person-check', 'Hadir', c.hadir, 'pertemuan') + stat('sky', 'envelope-paper', 'Izin / Sakit', c.izin + c.sakit, c.izin + ' izin · ' + c.sakit + ' sakit') + stat(c.alpa ? 'red' : 'lime', 'person-x', 'Alpa', c.alpa, c.alpa ? 'Perhatikan kehadiran Anda' : 'Pertahankan!') + '</div><div class="card mt"><div class="card-h"><h3>Riwayat Kehadiran</h3></div>' + (L.length ? '<div class="tw"><table class="tb" style="min-width:420px"><thead><tr><th>Tanggal</th><th>Status</th><th>Catatan</th></tr></thead><tbody>' + pg.rows.map(x => '<tr class="hv"><td>' + fTgl(x.tanggal) + '</td><td><span class="bd ' + absCls(x.status) + '">' + esc(x.status.charAt(0).toUpperCase() + x.status.slice(1)) + '</span></td><td>' + esc(x.catatan || '–') + '</td></tr>').join('') + '</tbody></table></div>' + pg.html : emptyBox('calendar-x', 'Belum ada catatan kehadiran.')) + '</div>';
}
R.absensi = () => role() === 'guru' ? absensiGuru() : absensiMurid();
AFTER.absensi = () => { if (role() !== 'guru') return; const ab = abState(); if (!ab.kelas) return; if (ab.mode === 'input' && !ab.loaded && !ab.loading) loadAbs(); if (ab.mode === 'rekap' && !ab.rekLoaded && !ab.rekLoading) loadRekap(); };
async function loadAbs() {
  const ab = abState(), key = ab.kelas + '|' + ab.tgl; ab.loading = key;
  try { const r = await rpc('getAbsensi', { kelasId: ab.kelas, dari: ab.tgl }); if (ab.loading !== key) return; ab.draft = {}; r.forEach(x => ab.draft[x.userId] = { status: x.status, catatan: x.catatan }); if (r[0] && r[0].materiId) ab.materi = r[0].materiId; ab.loaded = true; ab.loading = false; if (S.route === 'absensi') renderRoute(false); }
  catch (e) { ab.loading = false; ab.loaded = true; toast(e.message, 'er'); if (S.route === 'absensi') renderRoute(false); }
}
async function loadRekap() {
  const ab = abState(), key = ab.kelas + '|' + ab.bulan; ab.rekLoading = key;
  try { const r = await rpc('getAbsensi', { kelasId: ab.kelas, dari: ab.bulan + '-01', sampai: ab.bulan + '-31' }); if (ab.rekLoading !== key) return; ab.rek = r; ab.rekLoaded = true; ab.rekLoading = false; if (S.route === 'absensi') renderRoute(false); }
  catch (e) { ab.rekLoading = false; ab.rekLoaded = true; toast(e.message, 'er'); }
}
const abReset = () => { const ab = abState(); ab.loaded = false; ab.loading = false; ab.draft = {}; ab.rekLoaded = false; ab.rekLoading = false; ab.rek = []; };
ACT.abMode = el => { abState().mode = el.dataset.v; renderRoute(false); };
CH.abK = el => { const ab = abState(); ab.kelas = el.value; ab.materi = ''; abReset(); renderRoute(false); };
CH.abT = el => { const ab = abState(); if (!el.value) return; ab.tgl = el.value; ab.loaded = false; ab.loading = false; ab.draft = {}; renderRoute(false); };
CH.abB = el => { const ab = abState(); if (!el.value) return; ab.bulan = el.value; ab.rekLoaded = false; ab.rekLoading = false; ab.rek = []; renderRoute(false); };
CH.abM = el => { abState().materi = el.value; };
ACT.abSet = el => { const ab = abState(), x = ab.draft[el.dataset.u] = ab.draft[el.dataset.u] || {}; x.status = el.dataset.s; renderRoute(false); };
IN.abC = el => { const ab = abState(), x = ab.draft[el.dataset.u] = ab.draft[el.dataset.u] || {}; x.catatan = el.value; };
ACT.abAll = () => { const ab = abState(); S.d.murid.filter(u => u.kelasId === ab.kelas && u.aktif).forEach(u => { const x = ab.draft[u.id] = ab.draft[u.id] || {}; if (!x.status) x.status = 'hadir'; }); renderRoute(false); };
ACT.abSave = async el => {
  const ab = abState(), items = S.d.murid.filter(u => u.kelasId === ab.kelas && u.aktif && ab.draft[u.id] && ab.draft[u.id].status).map(u => ({ userId: u.id, status: ab.draft[u.id].status, catatan: ab.draft[u.id].catatan || '' }));
  if (!items.length) return toast('Tandai kehadiran minimal satu murid', 'er');
  busy(el, true, 'Menyimpan…');
  try { const r = await rpc('simpanAbsensi', { tanggal: ab.tgl, kelasId: ab.kelas, materiId: ab.materi, items }, { retry: 1 }); ab.rekLoaded = false; toast('Absensi ' + fTgl(ab.tgl) + ' tersimpan (' + r.n + ' murid)'); }
  catch (e) { toast(e.message, 'er'); } finally { busy(el, false); }
};
function rekapData() {
  const ab = abState(), sis = S.d.murid.filter(u => u.kelasId === ab.kelas && u.aktif), dates = []; ab.rek.forEach(r => { if (dates.indexOf(r.tanggal) < 0) dates.push(r.tanggal); }); dates.sort();
  const by = {}; ab.rek.forEach(r => { (by[r.userId] = by[r.userId] || {})[r.tanggal] = r.status; });
  return { name: 'Rekap_Absensi_' + kls(ab.kelas).replace(/\W+/g, '_') + '_' + ab.bulan, title: 'Rekap Absensi ' + kls(ab.kelas) + ' — ' + ab.bulan, head: ['No', 'Nama', 'NISN'].concat(dates.map(t => String(+t.slice(8))), ['H', 'I', 'S', 'A', '% Hadir']),
    rows: sis.map((u, i) => { const m = by[u.id] || {}, c = { hadir: 0, izin: 0, sakit: 0, alpa: 0 }; dates.forEach(t => { if (m[t]) c[m[t]]++; }); const tot = c.hadir + c.izin + c.sakit + c.alpa; return [i + 1, u.nama, u.nisn || ''].concat(dates.map(t => m[t] ? m[t][0].toUpperCase() : ''), [c.hadir, c.izin, c.sakit, c.alpa, tot ? Math.round(c.hadir / tot * 100) + '%' : '–']); }) };
}
ACT.abXlsx = () => { const r = rekapData(); exportXlsx(r.name, r.head, r.rows); };
ACT.abPdf = () => { const r = rekapData(); exportPdf(r.title, r.head, r.rows, 'landscape'); };



/* =====================================================================
 * REVISI 3 (guru) — tugas kelompok, pengumuman, bel, nilai akhir lengkap
 * ===================================================================== */
const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
const gname = id => { const u = mu(id); return u ? u.nama : '(murid dihapus)'; };

/* ---------- Tab "Tugas Kelompok" di editor materi ---------- */
function kelompokTab(e) {
  const tk = e.tugasK, m = e.materi;
  let h = '<div class="field"><label style="display:flex;gap:10px;align-items:center">' + swHtml(!!tk, 'data-act="edKelOn"', 'Aktifkan tugas kelompok') + ' Materi ini memiliki tugas kelompok</label></div>';
  if (!tk) return h + '<p class="muted">Aktifkan untuk membuat tugas kelompok. Jawaban dikirim oleh <b>ketua kelompok</b> dan dinilai guru per kelompok.</p>';
  h += '<div class="field"><label style="display:flex;gap:10px;align-items:center">' + swHtml(tk.aktif, 'data-ch="ed" data-p="tugasK.aktif"', 'Tampilkan ke murid') + ' Tampilkan ke murid (sakelar tampil / sembunyi)</label></div>' +
    '<div class="field"><label>Instruksi tugas kelompok</label><textarea class="txa" data-in="ed" data-p="tugasK.instruksi">' + esc(tk.instruksi) + '</textarea></div>' +
    '<div class="row2"><div class="field"><label>Tipe jawaban</label><select class="sel" data-ch="ed" data-p="tugasK.tipeJawaban">' + TIPE_OPTS.map(o => '<option value="' + o[0] + '"' + (tk.tipeJawaban === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div><div class="field"><label>Nilai maksimal</label><input class="inp" type="number" min="1" data-in="ed" data-p="tugasK.nilaiMaks" data-n="1" value="' + tk.nilaiMaks + '"></div></div>' +
    '<div class="row2"><div class="field"><label>Jumlah murid per kelompok</label><input class="inp" type="number" min="2" max="20" data-in="ed" data-p="tugasK.ukuran" data-n="1" value="' + tk.ukuran + '"></div><div class="field"><label>Cara pembagian</label><select class="sel" data-ch="ed" data-p="tugasK.mode"><option value="acak"' + (tk.mode === 'acak' ? ' selected' : '') + '>Acak otomatis (sistem)</option><option value="manual"' + (tk.mode === 'manual' ? ' selected' : '') + '>Manual (dipilih guru)</option></select></div></div>' +
    '<div class="field"><label>Batas waktu</label><input class="inp" type="datetime-local" data-ch="ed" data-p="tugasK.batas" data-dt="1" value="' + dtl(tk.batas) + '"></div>';
  const ks = m.kelasId ? S.d.kelas.filter(k => k.id === m.kelasId) : S.d.kelas;
  h += '<div class="card" style="box-shadow:none;background:var(--card-2)"><b style="display:block;margin-bottom:8px">' + ic('people') + ' Susunan kelompok</b>' + (ks.map(k => { const gs = S.d.kelompok.filter(g => g.tugasKId === tk.id && g.kelasId === k.id), n = S.d.murid.filter(u => u.kelasId === k.id && u.aktif).length; return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd-l)"><span>' + esc(k.nama) + '</span><span class="muted">' + (gs.length ? gs.length + ' kelompok' : '<b style="color:var(--warn-tx)">belum dibagi</b>') + ' · ' + n + ' murid</span></div>'; }).join('') || '<span class="muted">Belum ada kelas.</span>') +
    '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn btn-p" data-act="edKel" ' + (tk.id ? '' : 'disabled') + '>' + ic('diagram-3') + ' Atur Kelompok</button>' + (tk.id ? '' : '<span class="muted" style="font-size:12.5px">Klik <b>Simpan Semua</b> dulu agar tugas kelompok tersimpan.</span>') + '</div></div>';
  return h;
}
ACT.edKelOn = el => { const e = S.ui.ed; e.tugasK = el.checked ? (e.tugasK || { instruksi: '', tipeJawaban: 'keduanya', batas: 0, nilaiMaks: 100, ukuran: 4, mode: 'acak', aktif: true }) : null; renderRoute(false); };

/* ---------- Pengatur kelompok (manual / acak) ---------- */
let GK = null;
function acakBagi(st, ukuran) {   // sisa digabung ke kelompok lain (selisih ukuran maksimal 1)
  const a = shuf(st.map(u => u.id)), n = a.length; if (!n) return [];
  const ng = Math.max(1, Math.floor(n / Math.max(2, ukuran))), gs = Array.from({ length: ng }, (_, i) => ({ id: null, nama: 'Kelompok ' + (i + 1), ketuaId: '', anggota: [] }));
  a.forEach((id, i) => gs[i % ng].anggota.push(id)); gs.forEach(g => g.ketuaId = g.anggota[Math.floor(Math.random() * g.anggota.length)]); return gs;
}
const gStudents = () => S.d.murid.filter(u => u.kelasId === GK.kelas && u.aktif);
function gLoad() {
  GK.groups = S.d.kelompok.filter(g => g.tugasKId === GK.tk.id && g.kelasId === GK.kelas).map(g => ({ id: g.id, nama: g.nama, ketuaId: g.ketuaId, anggota: g.anggota.slice() }));
  const ids = {}; GK.groups.forEach(g => ids[g.id] = 1); GK.locked = (S.d.submitK || []).some(s => ids[s.kelompokId]); GK.dirty = false;
  if (!GK.groups.length && GK.tk.mode === 'acak') { GK.groups = acakBagi(gStudents(), GK.tk.ukuran); GK.dirty = GK.groups.length > 0; }
}
ACT.edKel = () => {
  const e = S.ui.ed, m = e && e.id ? mt(e.id) : null; if (!m || !m.tugasK) return toast('Simpan materi terlebih dahulu agar tugas kelompok tersimpan.', 'er');
  const ks = m.kelasId ? S.d.kelas.filter(k => k.id === m.kelasId) : S.d.kelas; if (!ks.length) return toast('Belum ada kelas.', 'er');
  GK = { tk: m.tugasK, m, ks, kelas: ks[0].id, groups: [], locked: false, dirty: false, w: null }; gLoad();
  GK.w = modal({ size: 'lg', title: 'Atur Kelompok — ' + m.judul, body: '', foot: '<span class="muted" id="gInfo" style="margin-right:auto;font-size:12.5px"></span><button class="btn btn-s" data-close>Tutup</button><button class="btn btn-p" data-act="gSave" id="gSaveBtn">' + ic('check2-circle') + ' Simpan Kelompok</button>',
    onClose: why => { if (why === 'force' || !GK || !GK.dirty) { GK = null; return true; } confirmBox('Susunan kelompok belum disimpan. Tutup tanpa menyimpan?', { title: 'Tutup pengatur kelompok?', ok: 'Tutup', danger: true }).then(y => { if (y && GK) closeM(GK.w, 'force'); }); return false; } });
  gRender();
};
function gRender() {
  if (!GK) return; const st = gStudents(), asg = {}; GK.groups.forEach(g => g.anggota.forEach(id => asg[id] = 1)); const un = st.filter(u => !asg[u.id]), U = GK.tk.ukuran, lock = GK.locked;
  const opts = un.map(u => '<option value="' + u.id + '">' + esc(u.nama) + '</option>').join('');
  $('.mb', GK.w).innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">' + (GK.ks.length > 1 ? '<select class="sel" style="width:auto;min-height:40px" data-ch="gKelas" aria-label="Kelas">' + GK.ks.map(k => '<option value="' + k.id + '"' + (k.id === GK.kelas ? ' selected' : '') + '>' + esc(k.nama) + '</option>').join('') + '</select>' : '<span class="bd pur">' + esc(kls(GK.kelas)) + '</span>') +
    '<span class="muted" style="font-size:12.5px">' + st.length + ' murid · ' + U + ' per kelompok · saran ' + Math.max(1, Math.floor(st.length / U)) + ' kelompok</span>' + (lock ? '' : '<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm btn-p" data-act="gAcak">' + ic('shuffle') + ' Acak otomatis</button><button class="btn btn-sm btn-s" data-act="gTambah">' + ic('plus-lg') + ' Tambah kelompok</button><button class="btn btn-sm btn-s" data-act="gKosong">Kosongkan</button></span>') + '</div>' +
    (lock ? '<div class="alert" style="margin-bottom:12px"><i class="bi bi-lock"></i><div><b>Kelompok terkunci</b><span>Sudah ada pengumpulan tugas. Mengubah susunan butuh reset (menghapus kelompok dan pengumpulannya).</span><div style="margin-top:8px"><button class="btn btn-sm btn-d" data-act="gReset">Reset kelompok &amp; pengumpulan</button></div></div></div>' : '') +
    (GK.groups.length ? '<div class="gk">' + GK.groups.map((g, i) => '<div class="gc"><div style="display:flex;gap:6px;margin-bottom:8px">' + (lock ? '<b style="flex:1">' + esc(g.nama) + '</b>' : '<input class="inp" style="min-height:38px" data-in="gNama" data-g="' + i + '" value="' + esc(g.nama) + '" aria-label="Nama kelompok"><button class="btn btn-sm btn-dl btn-ic" data-act="gDel" data-g="' + i + '" aria-label="Hapus kelompok">' + ic('trash') + '</button>') + '</div>' +
      g.anggota.map(id => '<div class="gm"><b>' + esc(gname(id)) + '</b>' + (id === g.ketuaId ? '<span class="bd pur" style="padding:0 8px">Ketua</span>' : '') + (lock ? '' : '<button class="' + (id === g.ketuaId ? 'on' : '') + '" data-act="gKetua" data-g="' + i + '" data-u="' + id + '" title="Jadikan ketua" aria-label="Jadikan ' + esc(gname(id)) + ' ketua">' + ic(id === g.ketuaId ? 'star-fill' : 'star') + '</button><button data-act="gRm" data-g="' + i + '" data-u="' + id + '" title="Keluarkan" aria-label="Keluarkan ' + esc(gname(id)) + '">' + ic('x-lg') + '</button>') + '</div>').join('') +
      (lock ? '' : '<select class="sel" style="min-height:38px;margin-top:4px" data-ch="gAdd" data-g="' + i + '" aria-label="Tambah anggota"><option value="">+ Tambah anggota</option>' + opts + '</select>') + '<small class="muted" style="display:block;margin-top:6px">' + g.anggota.length + ' anggota' + (g.anggota.length !== U ? ' (target ' + U + ')' : '') + '</small></div>').join('') + '</div>' : '<div class="empty">' + ic('people') + 'Belum ada kelompok. Klik <b>Acak otomatis</b> atau <b>Tambah kelompok</b>.</div>') +
    '<div class="card mt" style="box-shadow:none;background:' + (un.length ? 'var(--warn-bg)' : 'var(--ok-bg)') + '"><b>' + (un.length ? 'Belum masuk kelompok (' + un.length + ')' : 'Semua murid sudah masuk kelompok') + '</b>' + (un.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + un.map(u => '<span class="bd gry">' + esc(u.nama) + '</span>').join('') + '</div>' : '') + '</div>';
  $('#gInfo', GK.w).textContent = GK.dirty ? 'Ada perubahan belum disimpan' : '';
  const sb = $('#gSaveBtn', GK.w); if (sb) sb.classList.toggle('hide', lock);
}
const gDirty = () => { GK.dirty = true; };
ACT.gAcak = async () => { if (!GK) return; if (GK.groups.some(g => g.anggota.length) && !await confirmBox('Susunan saat ini diganti hasil acak baru?', { ok: 'Acak ulang' })) return; GK.groups = acakBagi(gStudents(), GK.tk.ukuran); gDirty(); gRender(); };
ACT.gTambah = () => { GK.groups.push({ id: null, nama: 'Kelompok ' + (GK.groups.length + 1), ketuaId: '', anggota: [] }); gDirty(); gRender(); };
ACT.gKosong = () => { GK.groups = []; gDirty(); gRender(); };
ACT.gDel = el => { GK.groups.splice(+el.dataset.g, 1); gDirty(); gRender(); };
ACT.gKetua = el => { GK.groups[+el.dataset.g].ketuaId = el.dataset.u; gDirty(); gRender(); };
ACT.gRm = el => { const g = GK.groups[+el.dataset.g]; g.anggota = g.anggota.filter(x => x !== el.dataset.u); if (g.ketuaId === el.dataset.u) g.ketuaId = g.anggota[0] || ''; gDirty(); gRender(); };
CH.gAdd = el => { if (!el.value) return; const g = GK.groups[+el.dataset.g]; g.anggota.push(el.value); if (!g.ketuaId) g.ketuaId = el.value; gDirty(); gRender(); };
IN.gNama = el => { GK.groups[+el.dataset.g].nama = el.value; GK.dirty = true; $('#gInfo', GK.w).textContent = 'Ada perubahan belum disimpan'; };
CH.gKelas = async el => { if (GK.dirty && !await confirmBox('Perubahan kelas ini belum disimpan. Pindah kelas?', { ok: 'Pindah', danger: true })) { el.value = GK.kelas; return; } GK.kelas = el.value; gLoad(); gRender(); };
ACT.gSave = async el => {
  const gs = GK.groups.filter(g => g.anggota.length); if (!gs.length) return toast('Belum ada kelompok yang berisi anggota', 'er');
  busy(el, true, 'Menyimpan…');
  try {
    const r = await rpc('simpanKelompok', { tugasKId: GK.tk.id, kelasId: GK.kelas, groups: gs }, { retry: 1 });
    S.d.kelompok = S.d.kelompok.filter(g => !(g.tugasKId === GK.tk.id && g.kelasId === GK.kelas)).concat(r); saveCache(); gLoad(); gRender(); toast(r.length + ' kelompok tersimpan'); if (S.route === 'materiEditor') renderRoute(false);
  } catch (e) { toast(e.message, 'er'); } finally { busy(el, false); }
};
ACT.gReset = async () => {
  if (!await confirmBox('Hapus semua kelompok kelas ini <b>beserta pengumpulan dan nilainya</b>? Tindakan tidak dapat dibatalkan.', { title: 'Reset kelompok', ok: 'Reset', danger: true })) return;
  try { await rpc('resetKelompok', { tugasKId: GK.tk.id, kelasId: GK.kelas }); const ids = {}; S.d.kelompok.forEach(g => { if (g.tugasKId === GK.tk.id && g.kelasId === GK.kelas) ids[g.id] = 1; });
    S.d.kelompok = S.d.kelompok.filter(g => !ids[g.id]); S.d.submitK = S.d.submitK.filter(s => !ids[s.kelompokId]); saveCache(); updateBadges(); gLoad(); gRender(); toast('Kelompok direset'); } catch (e) { toast(e.message, 'er'); }
};

/* ---------- Penilaian tugas kelompok ---------- */
function pengumpulanGuru() {
  const t = S.ui.f.pt || 'pribadi', a = S.d.submit.filter(s => s.nilai == null).length, b = (S.d.submitK || []).filter(s => s.nilai == null).length;
  return '<div class="tabs"><button class="tab ' + (t === 'pribadi' ? 'on' : '') + '" data-act="pt" data-v="pribadi">Tugas Pribadi' + (a ? ' <span class="bd red" style="padding:0 7px">' + a + '</span>' : '') + '</button><button class="tab ' + (t === 'kelompok' ? 'on' : '') + '" data-act="pt" data-v="kelompok">Tugas Kelompok' + (b ? ' <span class="bd red" style="padding:0 7px">' + b + '</span>' : '') + '</button></div>' + (t === 'kelompok' ? pengumpulanKGuru() : pengumpulanPribadi());
}
ACT.pt = el => { setF('pt', el.dataset.v); renderRoute(false); };
function pengumpulanKGuru() {
  const d = S.d, f = S.ui.f, q = (f.kq || '').toLowerCase(), sub = {}; d.submitK.forEach(s => sub[s.kelompokId] = s);
  const ada = d.materi.some(m => m.tugasK);
  let L = d.kelompok.map(g => { const m = d.materi.find(x => x.tugasK && x.tugasK.id === g.tugasKId); return m ? { g, m, s: sub[g.id] || null } : null; }).filter(Boolean)
    .filter(x => (!f.kk || x.g.kelasId === f.kk) && (!f.km || x.m.id === f.km) && (!f.ks || (f.ks === 'b' ? !x.s : f.ks === 'm' ? x.s && x.s.nilai == null : x.s && x.s.nilai != null)) && (!q || (x.g.nama + ' ' + gname(x.g.ketuaId)).toLowerCase().includes(q)))
    .sort((a, b) => (a.s && a.s.nilai == null ? 0 : 1) - (b.s && b.s.nilai == null ? 0 : 1) || a.g.nama.localeCompare(b.g.nama));
  const pg = paginate('subk', L, 10), mk = S.d.materi.filter(m => m.tugasK);
  return '<div class="page-head"><div><h1>Tugas Kelompok</h1><p class="muted" style="margin:4px 0 0">Satu nilai per kelompok berlaku untuk semua anggota; nilai anggota dapat disesuaikan.</p></div></div><div class="card"><div class="filters"><label class="search"><i class="bi bi-search"></i><input data-in="fq" data-k="kq" placeholder="Cari kelompok / ketua…" value="' + esc(f.kq || '') + '" aria-label="Cari"></label><select class="sel" data-ch="ff" data-k="kk" aria-label="Kelas">' + kOpts(f.kk, 'Semua kelas') + '</select><select class="sel" data-ch="ff" data-k="km" aria-label="Materi"><option value="">Semua materi</option>' + mk.map(m => '<option value="' + m.id + '"' + (f.km === m.id ? ' selected' : '') + '>' + esc(m.judul) + '</option>').join('') + '</select><select class="sel" data-ch="ff" data-k="ks" aria-label="Status"><option value="">Semua status</option><option value="b"' + (f.ks === 'b' ? ' selected' : '') + '>Belum mengumpulkan</option><option value="m"' + (f.ks === 'm' ? ' selected' : '') + '>Menunggu penilaian</option><option value="n"' + (f.ks === 'n' ? ' selected' : '') + '>Sudah dinilai</option></select></div>' +
    (!ada ? emptyBox('people', 'Belum ada tugas kelompok. Buat di Materi → Edit → tab Tugas Kelompok.') : !d.kelompok.length ? emptyBox('diagram-3', 'Belum ada kelompok. Atur di Materi → Edit → Tugas Kelompok → Atur Kelompok.') : '<div class="tw"><table class="tb"><thead><tr><th>Kelompok</th><th>Kelas</th><th>Modul</th><th>Ketua</th><th>Dikirim</th><th>Jawaban</th><th>Status</th><th></th></tr></thead><tbody>' + (pg.rows.map(x => { const s = x.s; return '<tr class="hv"><td><b>' + esc(x.g.nama) + '</b><br><small class="muted">' + x.g.anggota.length + ' anggota</small></td><td>' + esc(kls(x.g.kelasId)) + '</td><td>' + esc(x.m.judul) + '</td><td>' + esc(gname(x.g.ketuaId)) + '</td><td>' + (s ? fDT(s.waktuKirim) + (x.m.tugasK.batas && s.waktuKirim > x.m.tugasK.batas ? '<br><span class="bd red">Terlambat</span>' : '') : '–') + '</td><td>' + (s && isBerkas(s) ? berkasMini(s) : s && s.linkGambar ? '<img class="thumb" style="cursor:zoom-in" data-act="zoomImg" data-src="' + esc(s.linkGambar) + '" src="' + esc(s.linkGambar) + '" alt="Jawaban ' + esc(x.g.nama) + '" loading="lazy" referrerpolicy="no-referrer">' : s ? '<span class="muted3">teks</span>' : '–') + '</td><td>' + (!s ? '<span class="bd gry">Belum mengumpulkan</span>' : s.nilai != null ? '<span class="bd grn">Nilai ' + num(s.nilai, 0) + '</span>' : '<span class="bd amb">Menunggu</span>') + '</td><td>' + (s ? '<button class="btn btn-sm ' + (s.nilai != null ? 'btn-s' : 'btn-p') + '" data-act="nilaiTK" data-id="' + s.id + '">' + (s.nilai != null ? 'Ubah' : 'Nilai Sekarang') + '</button>' : '') + '</td></tr>'; }).join('') || '<tr><td colspan="8">' + emptyBox('search', 'Tidak ada data sesuai filter.') + '</td></tr>') + '</tbody></table></div>' + pg.html) + '</div>';
}
ACT.nilaiTK = el => {
  const s = S.d.submitK.find(x => x.id === el.dataset.id), g = S.d.kelompok.find(x => x.id === s.kelompokId), m = S.d.materi.find(x => x.tugasK && x.tugasK.id === s.tugasKId), tk = m.tugasK, ov = s.nilaiAnggota || {};
  const w = modal({ title: 'Nilai Tugas Kelompok — ' + g.nama, body: '<p class="muted" style="margin:0 0 10px">' + esc(m.judul) + ' · dikirim ketua ' + esc(gname(s.userId)) + ' · ' + fDT(s.waktuKirim) + '</p><div style="white-space:pre-wrap;background:var(--card-2);border-radius:12px;padding:12px;margin-bottom:12px;font-size:13px"><b>Instruksi:</b> ' + esc(tk.instruksi) + '</div>' + answerView(s) + (s.deskripsi ? '<p style="white-space:pre-wrap;background:var(--card-2);padding:12px;border-radius:12px">' + esc(s.deskripsi) + '</p>' : '') +
    '<div class="field"><label for="tkNv">Nilai kelompok (0 – ' + tk.nilaiMaks + ')</label><input id="tkNv" class="inp" type="number" min="0" max="' + tk.nilaiMaks + '" step="0.5" value="' + (s.nilai != null ? s.nilai : '') + '"></div><div class="field"><label for="tkCt">Catatan untuk kelompok</label><textarea id="tkCt" class="txa">' + esc(s.catatan || '') + '</textarea></div>' +
    '<b style="display:block;margin:4px 0 6px">Penyesuaian nilai per anggota <span class="muted fw6" style="font-size:12px">(kosongkan = ikut nilai kelompok)</span></b><div class="tw"><table class="tb" style="min-width:360px"><tbody>' + g.anggota.map(id => '<tr><td>' + esc(gname(id)) + (id === g.ketuaId ? ' <span class="bd pur">Ketua</span>' : '') + '</td><td style="width:130px"><input class="inp" style="min-height:38px" type="number" min="0" max="' + tk.nilaiMaks + '" step="0.5" data-ov="' + id + '" value="' + (ov[id] != null ? ov[id] : '') + '" placeholder="ikut kelompok" aria-label="Nilai ' + esc(gname(id)) + '"></td></tr>').join('') + '</tbody></table></div><div id="tkNe" class="ferr hide"></div>',
    foot: '<button class="btn btn-s" data-close>Batal</button><button class="btn btn-p" id="tkNs">' + ic('check2') + ' Simpan Nilai</button>' });
  $('#tkNs', w).onclick = async e => {
    const v = $('#tkNv', w).value; if (v === '') { $('#tkNe', w).textContent = 'Nilai kelompok wajib diisi.'; return $('#tkNe', w).classList.remove('hide'); }
    const na = {}; $$('[data-ov]', w).forEach(i => { if (i.value !== '') na[i.dataset.ov] = +i.value; });
    busy(e.currentTarget, true);
    try { const r = await rpc('nilaiTugasKelompok', { id: s.id, nilai: +v, catatan: $('#tkCt', w).value, nilaiAnggota: na }); Object.assign(s, r); saveCache(); closeM(w, 'force'); refreshUI(); toast('Nilai kelompok tersimpan'); }
    catch (x) { $('#tkNe', w).textContent = x.message; $('#tkNe', w).classList.remove('hide'); busy(e.currentTarget, false); }
  };
};

/* ---------- Laporan nilai (nilai akhir hanya bila lengkap) ---------- */
function laporan() {
  const d = S.d, GH = {}, GP = {}, GS = {}, KG = {}, SK = {};
  d.hasil.forEach(h => GH[h.userId + '|' + h.materiId + '|' + h.jenis] = h); d.progres.forEach(p => GP[p.userId + '|' + p.materiId] = p); d.submit.forEach(s => GS[s.userId + '|' + s.materiId] = s);
  (d.kelompok || []).forEach(g => g.anggota.forEach(id => KG[g.tugasKId + '|' + id] = g)); (d.submitK || []).forEach(s => SK[s.kelompokId] = s);
  const rows = [];
  d.murid.forEach(u => d.materi.forEach(m => {
    if (!m.publikasi || (m.kelasId && m.kelasId !== u.kelasId)) return;
    const hp = GH[u.id + '|' + m.id + '|pretes'], hq = GH[u.id + '|' + m.id + '|postes'], p = GP[u.id + '|' + m.id], s = GS[u.id + '|' + m.id]; let sk = null;
    if (m.tugasK && m.tugasK.aktif) { const g = KG[m.tugasK.id + '|' + u.id], sb = g ? SK[g.id] : null; sk = { has: !!g, sub: !!sb, nilai: sb && sb.nilai != null ? (sb.nilaiAnggota && sb.nilaiAnggota[u.id] != null ? sb.nilaiAnggota[u.id] : sb.nilai) : null }; }
    const n = hitungAkhir(m, { hp, hq, s, sk }), done = !!p && p.status === 'sudah dipelajari';
    rows.push({ u, m, hp, hq, p, s, pre: n.pre, pos: n.pos, tug: n.tug, akhir: n.akhir, kurang: n.kurang, lengkap: n.lengkap, done, red: !!p && !done, keluar: [hp, hq].some(h => h && h.status === 'keluar aplikasi') });
  }));
  return rows;
}

/* ---------- Pengumuman (guru) ---------- */
function pengumumanGuru() {
  const L = S.d.pengumuman || [], now = nowS();
  return '<div class="page-head"><div><h1>Pengumuman</h1><p class="muted" style="margin:4px 0 0">Tampil di dasbor murid dan notifikasi. Pengumuman penting disematkan di atas.</p></div><div class="acts"><button class="btn btn-p" data-act="annNew">' + ic('plus-circle') + ' Buat Pengumuman</button></div></div>' +
    (L.length ? '<div class="grid g2">' + L.map(a => { const exp = a.berakhir && a.berakhir < now; return '<article class="card ann ' + (a.penting ? 'imp' : '') + '" style="' + (exp ? 'opacity:.65' : '') + '"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' + (a.penting ? '<span class="bd red">Penting</span>' : '') + '<span class="bd blu">' + esc(a.kelasId ? kls(a.kelasId) : 'Semua kelas') + '</span>' + (exp ? '<span class="bd gry">Kedaluwarsa</span>' : '<span class="bd grn">Aktif</span>') + '</div><h4 style="font-size:15px;margin:0 0 4px">' + esc(a.judul) + '</h4><div class="ann-t" style="-webkit-line-clamp:6">' + linkify(a.isi) + '</div><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap"><small class="muted3">' + fD(a.dibuat) + (a.berakhir ? ' · sampai ' + fD(a.berakhir) : '') + '</small><span style="display:flex;gap:6px"><button class="btn btn-sm btn-s" data-act="annEdit" data-id="' + a.id + '">' + ic('pencil') + ' Ubah</button><button class="btn btn-sm btn-dl" data-act="annDel" data-id="' + a.id + '" aria-label="Hapus pengumuman">' + ic('trash') + '</button></span></div></article>'; }).join('') + '</div>' : '<div class="card">' + emptyBox('megaphone', 'Belum ada pengumuman. Klik “Buat Pengumuman”.') + '</div>');
}
R.pengumuman = pengumumanGuru;
ACT.annNew = () => annForm(null); ACT.annEdit = el => annForm(el.dataset.id);
function annForm(id) {
  const a = id ? S.d.pengumuman.find(x => x.id === id) : { judul: '', isi: '', kelasId: '', penting: false, berakhir: 0 };
  const w = modal({ title: id ? 'Ubah Pengumuman' : 'Buat Pengumuman', body: '<div class="field"><label for="anJ">Judul</label><input id="anJ" class="inp" maxlength="120" value="' + esc(a.judul) + '"></div><div class="field"><label for="anI">Isi pengumuman (tautan otomatis bisa diklik)</label><textarea id="anI" class="txa" style="min-height:130px" maxlength="2000">' + esc(a.isi) + '</textarea></div><div class="row2"><div class="field"><label>Tampil untuk</label><select id="anK" class="sel">' + kOpts(a.kelasId, 'Semua kelas') + '</select></div><div class="field"><label for="anB">Berakhir (opsional)</label><input id="anB" type="date" class="inp" value="' + (a.berakhir ? dtl(a.berakhir).slice(0, 10) : '') + '"></div></div><label style="display:flex;gap:10px;align-items:center;cursor:pointer">' + swHtml(a.penting, 'id="anP"', 'Penting') + ' Tandai <b>Penting</b> (merah &amp; disematkan di atas)</label><div id="anE" class="ferr hide"></div>', foot: '<button class="btn btn-s" data-close>Batal</button><button class="btn btn-p" id="anS">' + ic('megaphone') + ' ' + (id ? 'Simpan' : 'Terbitkan') + '</button>' });
  $('#anS', w).onclick = async e => {
    const bv = $('#anB', w).value; busy(e.currentTarget, true);
    try { const r = await rpc('simpanPengumuman', { id: id, judul: $('#anJ', w).value, isi: $('#anI', w).value, kelasId: $('#anK', w).value, penting: $('#anP', w).checked, berakhir: bv ? new Date(bv + 'T23:59:59').getTime() : 0 });
      const i = S.d.pengumuman.findIndex(x => x.id === r.id); if (i >= 0) S.d.pengumuman[i] = r; else S.d.pengumuman.push(r);
      S.d.pengumuman.sort((a, b) => ((b.penting ? 1 : 0) - (a.penting ? 1 : 0)) || b.dibuat - a.dibuat); saveCache(); closeM(w, 'force'); refreshUI(); toast('Pengumuman tersimpan'); }
    catch (x) { $('#anE', w).textContent = x.message; $('#anE', w).classList.remove('hide'); busy(e.currentTarget, false); }
  };
}
ACT.annDel = async el => { if (!await confirmBox('Hapus pengumuman ini?', { ok: 'Hapus', danger: true })) return; try { await rpc('hapusPengumuman', { id: el.dataset.id }); S.d.pengumuman = S.d.pengumuman.filter(x => x.id !== el.dataset.id); saveCache(); refreshUI(); toast('Pengumuman dihapus'); } catch (e) { toast(e.message, 'er'); } };
ACT.ujiBel = () => { bellPrep(); setTimeout(() => { if (!ringBell(true)) toast('Browser belum mengizinkan suara. Klik lagi.', 'er'); }, 60); };


/* =====================================================================
 * REVISI 4 (guru) — jurnal harian, asesmen STS/SAS, rekap semester
 * ===================================================================== */
function answerView(s) {
  if (!s.linkGambar) return '';
  if (isBerkas(s)) return '<div class="field"><label>Berkas jawaban</label>' + berkasChip(s, true) + '<div class="viewer" style="height:min(55vh,460px)"><iframe src="https://drive.google.com/file/d/' + esc(s.fileId) + '/preview" title="Pratinjau berkas jawaban" loading="lazy" referrerpolicy="no-referrer"></iframe></div></div>';
  return '<img src="' + esc(s.linkGambar) + '" alt="Jawaban gambar" style="max-width:100%;max-height:340px;border-radius:12px;display:block;margin-bottom:12px;cursor:zoom-in" data-act="zoomImg" data-src="' + esc(s.linkGambar) + '" referrerpolicy="no-referrer">';
}

/* ---------- JURNAL HARIAN ---------- */
function jnState() { if (!S.ui.jn) S.ui.jn = { kelas: (S.d.kelas[0] || {}).id || '', bulan: todayStr().slice(0, 7), rows: [], abs: [], loaded: false, loading: false }; return S.ui.jn; }
function absRingkas(abs, tgl) {
  const r = abs.filter(a => a.tanggal === tgl); if (!r.length) return null; const c = { hadir: 0, izin: 0, sakit: 0, alpa: 0 }; r.forEach(a => { if (c[a.status] != null) c[a.status]++; });
  return { c, tidak: r.filter(a => a.status !== 'hadir').map(a => gname(a.userId) + ' (' + a.status.charAt(0).toUpperCase() + ')') };
}
const ringkasTxt = g => g ? 'H ' + g.c.hadir + ' · I ' + g.c.izin + ' · S ' + g.c.sakit + ' · A ' + g.c.alpa : 'Absensi belum diisi';
function jurnalGuru() {
  const jn = jnState(), d = S.d, head = '<div class="page-head"><div><h1>Jurnal Harian</h1><p class="muted" style="margin:4px 0 0">Catatan mengajar per kelas. Kehadiran diambil otomatis dari menu Absensi.</p></div><div class="acts"><button class="btn btn-s" data-act="jnXlsx">' + ic('file-earmark-excel') + ' Excel</button><button class="btn btn-s" data-act="jnPdf">' + ic('file-earmark-pdf') + ' PDF + Tanda Tangan</button><button class="btn btn-p" data-act="jnNew">' + ic('plus-circle') + ' Tulis Jurnal</button></div></div>';
  if (!d.kelas.length) return head + '<div class="card">' + emptyBox('door-open', 'Belum ada kelas. Tambahkan di Kelola Pengguna.') + '</div>';
  const list = !jn.loaded ? '<div class="skel" style="height:160px"></div>' : !jn.rows.length ? '<div class="card">' + emptyBox('journal-text', 'Belum ada jurnal pada bulan ini untuk kelas ini.') + '</div>' : jn.rows.map(r => {
    const m = r.materiId ? mt(r.materiId) : null, g = absRingkas(jn.abs, r.tanggal);
    return '<article class="card" style="margin-bottom:12px"><div class="card-h" style="margin-bottom:6px"><div class="flow"><span class="a">' + fTgl(r.tanggal) + '</span>' + (r.jam ? '<span>Jam ke-' + esc(r.jam) + '</span>' : '') + (m ? '<span>' + esc(m.judul) + '</span>' : '') + '</div><div style="display:flex;gap:6px"><button class="btn btn-sm btn-s" data-act="jnEdit" data-id="' + r.id + '" aria-label="Ubah jurnal">' + ic('pencil') + '</button><button class="btn btn-sm btn-dl" data-act="jnDel" data-id="' + r.id + '" aria-label="Hapus jurnal">' + ic('trash') + '</button></div></div><h4 style="font-size:15.5px;margin:2px 0 8px;white-space:pre-wrap">' + esc(r.topik) + '</h4><div class="kv" style="font-size:13px">' + [['Metode', r.metode], ['Kendala / refleksi', r.kendala], ['Tindak lanjut', r.tindakLanjut]].filter(x => x[1]).map(x => '<div><b class="muted fw6" style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;display:block">' + x[0] + '</b><span style="white-space:pre-wrap">' + esc(x[1]) + '</span></div>').join('') + '</div><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:10px"><span class="bd ' + (g ? 'grn' : 'gry') + '">' + ic('people') + ' ' + ringkasTxt(g) + '</span>' + (g && g.tidak.length ? '<small class="muted">Tidak hadir: ' + esc(g.tidak.join(', ')) + '</small>' : '') + (r.linkFoto ? '<img class="thumb" style="margin-left:auto;cursor:zoom-in;width:72px;height:54px" src="' + esc(r.linkFoto) + '" alt="Dokumentasi" data-act="zoomImg" data-src="' + esc(r.linkFoto) + '" loading="lazy" referrerpolicy="no-referrer">' : '') + '</div></article>';
  }).join('');
  return head + '<div class="card" style="margin-bottom:16px"><div class="filters" style="grid-template-columns:1fr 1fr;margin:0"><div class="field" style="margin:0"><label>Kelas</label><select class="sel" data-ch="jnK" aria-label="Kelas">' + kOpts(jn.kelas) + '</select></div><div class="field" style="margin:0"><label for="jnB">Bulan</label><input id="jnB" type="month" class="inp" value="' + jn.bulan + '" data-ch="jnB"></div></div></div>' + list;
}
R.jurnal = jurnalGuru;
AFTER.jurnal = () => { if (role() === 'guru') { const jn = jnState(); if (jn.kelas && !jn.loaded && !jn.loading) loadJurnal(); } };
async function loadJurnal() {
  const jn = jnState(), key = jn.kelas + '|' + jn.bulan, a = jn.bulan + '-01', b = jn.bulan + '-31'; jn.loading = key;
  try { const [r, ab] = await Promise.all([rpc('getJurnal', { kelasId: jn.kelas, dari: a, sampai: b }), rpc('getAbsensi', { kelasId: jn.kelas, dari: a, sampai: b })]); if (jn.loading !== key) return; jn.rows = r; jn.abs = ab; jn.loaded = true; jn.loading = false; if (S.route === 'jurnal') renderRoute(false); }
  catch (e) { jn.loading = false; jn.loaded = true; toast(e.message, 'er'); if (S.route === 'jurnal') renderRoute(false); }
}
CH.jnK = el => { const jn = jnState(); jn.kelas = el.value; jn.loaded = false; jn.loading = false; jn.rows = []; renderRoute(false); };
CH.jnB = el => { const jn = jnState(); if (!el.value) return; jn.bulan = el.value; jn.loaded = false; jn.loading = false; jn.rows = []; renderRoute(false); };
ACT.jnNew = () => jurnalForm(null); ACT.jnEdit = el => jurnalForm(el.dataset.id);
ACT.jnDel = async el => { if (!await confirmBox('Hapus jurnal ini?', { ok: 'Hapus', danger: true })) return; try { await rpc('hapusJurnal', { id: el.dataset.id }); const jn = jnState(); jn.rows = jn.rows.filter(x => x.id !== el.dataset.id); renderRoute(false); toast('Jurnal dihapus'); } catch (e) { toast(e.message, 'er'); } };
function jurnalForm(id) {
  const jn = jnState(), r = id ? jn.rows.find(x => x.id === id) : { tanggal: todayStr(), kelasId: jn.kelas, jam: '', materiId: '', topik: '', metode: '', kendala: '', tindakLanjut: '', linkFoto: '' };
  let foto = null, hapus = false;
  const modOpts = k => '<option value="">— tanpa modul —</option>' + S.d.materi.filter(m => !m.kelasId || m.kelasId === k).map(m => '<option value="' + m.id + '"' + (m.id === r.materiId ? ' selected' : '') + '>' + esc(m.judul) + '</option>').join('');
  const w = modal({ size: 'lg', title: id ? 'Ubah Jurnal Harian' : 'Tulis Jurnal Harian', body:
    '<div class="row2"><div class="field"><label for="jnT">Tanggal</label><input id="jnT" type="date" class="inp" value="' + r.tanggal + '"></div><div class="field"><label>Kelas</label><select id="jnKs" class="sel"' + (id ? ' disabled' : '') + '>' + kOpts(r.kelasId) + '</select></div></div>' +
    '<div class="row2"><div class="field"><label for="jnJ">Jam ke-</label><input id="jnJ" class="inp" maxlength="20" placeholder="mis. 1-2" value="' + esc(r.jam) + '"></div><div class="field"><label>Modul terkait (opsional)</label><select id="jnM" class="sel">' + modOpts(r.kelasId) + '</select></div></div>' +
    '<div id="jnAbs" class="alert info" style="margin:0 0 14px"><i class="bi bi-people"></i><div><b style="color:var(--tx)">Kehadiran</b><span>Memuat dari Absensi…</span></div></div>' +
    '<div class="field"><label for="jnP">Topik / kegiatan pembelajaran</label><textarea id="jnP" class="txa" maxlength="1500">' + esc(r.topik) + '</textarea></div>' +
    '<div class="field"><label for="jnMt">Metode</label><input id="jnMt" class="inp" list="jnMl" maxlength="200" value="' + esc(r.metode) + '" placeholder="Ceramah, diskusi, praktik…"><datalist id="jnMl"><option>Ceramah</option><option>Diskusi</option><option>Praktik</option><option>Proyek</option><option>Tanya jawab</option><option>Demonstrasi</option></datalist></div>' +
    '<div class="field"><label for="jnKd">Kendala / refleksi</label><textarea id="jnKd" class="txa" style="min-height:70px" maxlength="1500">' + esc(r.kendala) + '</textarea></div><div class="field"><label for="jnTl">Tindak lanjut</label><textarea id="jnTl" class="txa" style="min-height:70px" maxlength="1500">' + esc(r.tindakLanjut) + '</textarea></div>' +
    '<div class="field"><label>Foto dokumentasi (opsional)</label><label class="drop" for="jnF">' + ic('camera') + ' <b>Pilih atau ambil foto</b><div id="jnPv">' + (r.linkFoto ? '<img src="' + esc(r.linkFoto) + '" alt="Foto sebelumnya" referrerpolicy="no-referrer">' : '') + '</div></label><input type="file" id="jnF" accept="image/*" class="sr-only">' + (r.linkFoto ? '<button class="btn btn-sm btn-dl" type="button" id="jnRm" style="margin-top:8px">' + ic('trash') + ' Hapus foto</button>' : '') + '</div><div id="jnE" class="ferr hide"></div>',
    foot: '<button class="btn btn-s" data-close>Batal</button><button class="btn btn-p" id="jnS">' + ic('check2-circle') + ' Simpan Jurnal</button>' });
  const loadAbs = async () => { const k = $('#jnKs', w).value, t = $('#jnT', w).value, box = $('#jnAbs', w); if (!k || !t) return; try { const a = await rpc('getAbsensi', { kelasId: k, dari: t }); const g = absRingkas(a, t); box.innerHTML = '<i class="bi bi-people"></i><div><b style="color:var(--tx)">Kehadiran ' + (g ? '(dari menu Absensi)' : '') + '</b><span>' + esc(ringkasTxt(g)) + (g && g.tidak.length ? '<br>Tidak hadir: ' + esc(g.tidak.join(', ')) : '') + (g ? '' : ' — isi di menu Absensi agar tercatat di jurnal.') + '</span></div>'; } catch (e) { box.querySelector('span').textContent = 'Gagal memuat absensi.'; } };
  loadAbs();
  $('#jnKs', w).onchange = () => { $('#jnM', w).innerHTML = modOpts($('#jnKs', w).value); loadAbs(); }; $('#jnT', w).onchange = loadAbs;
  $('#jnF', w).onchange = async e => { const f = e.target.files[0]; if (!f) return; if (!/^image\//.test(f.type)) return toast('Berkas harus gambar', 'er'); try { foto = await compressImg(f); hapus = false; $('#jnPv', w).innerHTML = '<img src="' + foto + '" alt="Pratinjau foto">'; } catch (x) { toast('Gagal memproses gambar', 'er'); } };
  if ($('#jnRm', w)) $('#jnRm', w).onclick = () => { hapus = true; foto = null; $('#jnPv', w).innerHTML = ''; $('#jnRm', w).remove(); };
  $('#jnS', w).onclick = async e => {
    busy(e.currentTarget, true, 'Menyimpan…');
    try {
      const k = $('#jnKs', w).value, t = $('#jnT', w).value, rec = await rpc('simpanJurnal', { id: id, tanggal: t, kelasId: k, jam: $('#jnJ', w).value, materiId: $('#jnM', w).value, topik: $('#jnP', w).value, metode: $('#jnMt', w).value, kendala: $('#jnKd', w).value, tindakLanjut: $('#jnTl', w).value, foto: foto || '', hapusFoto: hapus });
      jn.kelas = k; jn.bulan = t.slice(0, 7); jn.loaded = false; jn.loading = false; closeM(w, 'force'); renderRoute(false); toast('Jurnal tersimpan');
    } catch (x) { $('#jnE', w).textContent = x.message; $('#jnE', w).classList.remove('hide'); busy(e.currentTarget, false); }
  };
}
function jnTable() {
  const jn = jnState();
  return { head: ['No', 'Tanggal', 'Jam ke-', 'Modul', 'Topik / Kegiatan', 'Metode', 'Kehadiran', 'Kendala / Refleksi', 'Tindak Lanjut'], rows: jn.rows.map((r, i) => { const m = r.materiId ? mt(r.materiId) : null, g = absRingkas(jn.abs, r.tanggal); return [i + 1, fTgl(r.tanggal), r.jam || '', m ? m.judul : '', r.topik, r.metode, g ? ringkasTxt(g) + (g.tidak.length ? '\nTidak hadir: ' + g.tidak.join(', ') : '') : 'Absensi belum diisi', r.kendala, r.tindakLanjut]; }) };
}
ACT.jnXlsx = () => { const jn = jnState(), t = jnTable(); if (!t.rows.length) return toast('Belum ada jurnal untuk diekspor', 'er'); exportXlsx('Jurnal_' + kls(jn.kelas).replace(/\W+/g, '_') + '_' + jn.bulan, t.head, t.rows); };
ACT.jnPdf = async () => {
  const jn = jnState(), t = jnTable(), c = S.cfg; if (!t.rows.length) return toast('Belum ada jurnal untuk dicetak', 'er');
  try {
    await lib('jspdf'); await lib('autotable'); const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(c.namaMadrasah || MADRASAH, W / 2, 34, { align: 'center' }); doc.setFontSize(11); doc.text('JURNAL HARIAN MENGAJAR — ' + (c.namaApp || 'Informatika'), W / 2, 52, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Kelas ' + kls(jn.kelas) + ' · Bulan ' + jn.bulan + ' · Tahun ajaran ' + c.tahunAjaran + ' · Semester ' + c.semester, W / 2, 66, { align: 'center' });
    doc.autoTable({ head: [t.head], body: t.rows.map(r => r.map(v => v == null || v === '' ? '–' : String(v))), startY: 80, styles: { fontSize: 7.5, cellPadding: 3, valign: 'top' }, headStyles: { fillColor: [59, 31, 163] }, alternateRowStyles: { fillColor: [243, 244, 248] }, columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 62 }, 2: { cellWidth: 34 }, 4: { cellWidth: 150 }, 6: { cellWidth: 100 } }, didDrawPage: () => { doc.setFontSize(8); doc.setTextColor(120); doc.text('© ' + new Date().getFullYear() + ' Ufi Syaiful Ulum, Gr.', W / 2, H - 16, { align: 'center' }); doc.setTextColor(0); } });
    let y = doc.lastAutoTable.finalY + 26; if (y > H - 150) { doc.addPage(); y = 70; }
    const L = W * 0.25, Rr = W * 0.75, tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), blank = '..............................', nm = (a) => a || blank;
    doc.setFontSize(10); doc.text('Mengetahui,', L, y, { align: 'center' }); doc.text('Kepala Madrasah', L, y + 13, { align: 'center' }); doc.text((c.kotaTTD || 'Muria') + ', ' + tgl, Rr, y, { align: 'center' }); doc.text('Guru Mata Pelajaran Informatika', Rr, y + 13, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.text(nm(c.namaKepala), L, y + 72, { align: 'center' }); doc.text(nm(c.namaGuru), Rr, y + 72, { align: 'center' }); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('NIP. ' + (c.nipKepala || '-'), L, y + 85, { align: 'center' }); doc.text('NIP. ' + (c.nipGuru || '-'), Rr, y + 85, { align: 'center' });
    doc.save('Jurnal_' + kls(jn.kelas).replace(/\W+/g, '_') + '_' + jn.bulan + '.pdf'); toast('PDF jurnal diunduh');
  } catch (e) { toast('Gagal membuat PDF: ' + e.message, 'er'); }
};

/* ---------- NILAI: tab Modul | Asesmen | Rekap Semester ---------- */
function nilaiGuru() {
  const t = S.ui.f.nv || 'modul';
  return '<div class="tabs"><button class="tab ' + (t === 'modul' ? 'on' : '') + '" data-act="nv" data-v="modul">Nilai Modul</button><button class="tab ' + (t === 'asesmen' ? 'on' : '') + '" data-act="nv" data-v="asesmen">Asesmen STS / SAS</button><button class="tab ' + (t === 'rekap' ? 'on' : '') + '" data-act="nv" data-v="rekap">Rekap Semester &amp; Tahun</button></div>' + (t === 'asesmen' ? asesmenTab() : t === 'rekap' ? rekapTab() : nilaiModulGuru());
}
ACT.nv = el => { setF('nv', el.dataset.v); renderRoute(false); };
const tahunOpts = () => {
  const set = {}, c = S.cfg.tahunAjaran || ''; if (c) set[c] = 1; const p = c.split('/').map(Number); if (p[0]) { set[(p[0] - 1) + '/' + (p[1] - 1)] = 1; set[(p[0] + 1) + '/' + (p[1] + 1)] = 1; }
  (S.d.asesmen || []).forEach(r => set[r.tahun] = 1); S.d.materi.forEach(m => { if (m.periode) set[m.periode.tahun] = 1; }); return Object.keys(set).sort();
};
const semLbl = s => s === 'ganjil' ? 'Ganjil' : 'Genap';
function asState() { if (!S.ui.as) S.ui.as = { kelas: (S.d.kelas[0] || {}).id || '', tahun: S.cfg.tahunAjaran, semester: String(S.cfg.semester || 'Ganjil').toLowerCase(), jenis: 'sts', draft: {}, dkey: '', dirty: false }; return S.ui.as; }
function asEnsure() { const a = asState(), key = [a.kelas, a.tahun, a.semester, a.jenis].join('|'); if (a.dkey !== key) { a.dkey = key; a.dirty = false; a.draft = {}; S.d.asesmen.forEach(r => { if (r.tahun === a.tahun && r.semester === a.semester && r.jenis === a.jenis) a.draft[r.userId] = { nilai: r.nilai, catatan: r.catatan }; }); } return a; }
const asPeriodeRow = a => (S.d.asesmenPeriode || []).find(x => x.id === [a.tahun, a.semester, a.jenis, a.kelas].join('|'));
function asesmenTab() {
  const a = asEnsure(), sis = S.d.murid.filter(u => u.kelasId === a.kelas && u.aktif), pr = asPeriodeRow(a), pub = !!(pr && pr.publik), isi = sis.filter(u => a.draft[u.id] && a.draft[u.id].nilai !== '' && a.draft[u.id].nilai != null).length;
  const sel = (k, opts) => '<select class="sel" data-ch="asSel" data-k="' + k + '" aria-label="' + k + '">' + opts + '</select>';
  return '<div class="page-head"><div><h1>Asesmen STS / SAS</h1><p class="muted" style="margin:4px 0 0">Nilai Sumatif Tengah Semester dan Akhir Semester per kelas. Murid melihat nilainya setelah dipublikasikan.</p></div></div><div class="card"><div class="filters">' +
    '<div class="field" style="margin:0"><label>Kelas</label>' + sel('kelas', kOpts(a.kelas)) + '</div><div class="field" style="margin:0"><label>Tahun ajaran</label>' + sel('tahun', tahunOpts().map(t => '<option' + (t === a.tahun ? ' selected' : '') + '>' + t + '</option>').join('')) + '</div><div class="field" style="margin:0"><label>Semester</label>' + sel('semester', ['ganjil', 'genap'].map(s => '<option value="' + s + '"' + (s === a.semester ? ' selected' : '') + '>' + semLbl(s) + '</option>').join('')) + '</div><div class="field" style="margin:0"><label>Jenis</label>' + sel('jenis', '<option value="sts"' + (a.jenis === 'sts' ? ' selected' : '') + '>STS (Tengah Semester)</option><option value="sas"' + (a.jenis === 'sas' ? ' selected' : '') + '>SAS (Akhir Semester)</option>') + '</div></div>' +
    '<div class="flow" style="margin:4px 0 12px"><span class="' + (isi === sis.length && sis.length ? 'd' : 'a') + '">Terisi ' + isi + ' / ' + sis.length + '</span><span class="' + (pub ? 'd' : '') + '">' + (pub ? 'Dipublikasikan ke murid' : 'Belum dipublikasikan') + '</span>' + (a.dirty ? '<span class="r">Ada perubahan belum disimpan</span>' : '') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn btn-p btn-sm" data-act="asSave" ' + (sis.length ? '' : 'disabled') + '>' + ic('check2-circle') + ' Simpan Nilai</button><button class="btn btn-s btn-sm" data-act="asTpl">' + ic('file-earmark-excel') + ' Template Excel</button><label class="btn btn-s btn-sm" style="cursor:pointer">' + ic('cloud-upload') + ' Impor Excel<input type="file" class="sr-only" accept=".xlsx,.xls,.csv" data-ch="asImp"></label><button class="btn btn-sm ' + (pub ? 'btn-dl' : 'btn-o') + '" data-act="asPub">' + ic(pub ? 'eye-slash' : 'megaphone') + ' ' + (pub ? 'Tarik Publikasi' : 'Publikasikan ke Murid') + '</button></div>' +
    (sis.length ? '<div class="tw"><table class="tb" style="min-width:560px"><thead><tr><th>No</th><th>Murid</th><th style="width:130px">Nilai (0–100)</th><th>Catatan (opsional)</th></tr></thead><tbody>' + sis.map((u, i) => { const x = a.draft[u.id] || {}; return '<tr class="hv"><td>' + (i + 1) + '</td><td><div class="nm">' + avatarU(u.nama) + '<div><b>' + esc(u.nama) + '</b><small>' + esc(u.nisn || '@' + u.username) + '</small></div></div></td><td><input class="inp" style="min-height:40px" type="number" min="0" max="100" step="0.5" data-in="asN" data-u="' + u.id + '" value="' + (x.nilai == null ? '' : x.nilai) + '" aria-label="Nilai ' + esc(u.nama) + '"></td><td><input class="inp" style="min-height:40px" data-in="asC" data-u="' + u.id + '" maxlength="120" value="' + esc(x.catatan || '') + '" placeholder="mis. remedial / susulan" aria-label="Catatan ' + esc(u.nama) + '"></td></tr>'; }).join('') + '</tbody></table></div>' : emptyBox('people', 'Belum ada murid aktif di kelas ini.')) + '</div>';
}
CH.asSel = async el => { const a = asState(); if (a.dirty && !await confirmBox('Perubahan nilai belum disimpan. Pindah tanpa menyimpan?', { ok: 'Pindah', danger: true })) { renderRoute(false); return; } a[el.dataset.k] = el.value; a.dkey = ''; renderRoute(false); };
const asTouch = (el, k) => { const a = asState(), x = a.draft[el.dataset.u] = a.draft[el.dataset.u] || { nilai: '', catatan: '' }; x[k] = el.value; if (!a.dirty) { a.dirty = true; } };
IN.asN = el => asTouch(el, 'nilai'); IN.asC = el => asTouch(el, 'catatan');
ACT.asSave = async el => {
  const a = asState(), sis = S.d.murid.filter(u => u.kelasId === a.kelas && u.aktif), bad = sis.find(u => { const v = a.draft[u.id] && a.draft[u.id].nilai; return v !== '' && v != null && (isNaN(+v) || +v < 0 || +v > 100); });
  if (bad) return toast('Nilai ' + bad.nama + ' harus 0 – 100', 'er');
  busy(el, true, 'Menyimpan…');
  try {
    const items = sis.map(u => ({ userId: u.id, nilai: a.draft[u.id] ? a.draft[u.id].nilai : '', catatan: a.draft[u.id] ? a.draft[u.id].catatan : '' })), recs = await rpc('simpanAsesmen', { tahun: a.tahun, semester: a.semester, jenis: a.jenis, kelasId: a.kelas, items }, { retry: 1 }), ids = {}; sis.forEach(u => ids[u.id] = 1);
    S.d.asesmen = S.d.asesmen.filter(r => !(r.tahun === a.tahun && r.semester === a.semester && r.jenis === a.jenis && ids[r.userId])).concat(recs); a.dkey = ''; saveCache(); renderRoute(false); toast(recs.length + ' nilai ' + a.jenis.toUpperCase() + ' tersimpan');
  } catch (e) { toast(e.message, 'er'); busy(el, false); }
};
ACT.asPub = async el => {
  const a = asEnsure(); if (a.dirty) return toast('Simpan nilai terlebih dahulu sebelum mengubah publikasi', 'er'); const pr = asPeriodeRow(a), pub = !(pr && pr.publik);
  if (pub && !await confirmBox('Publikasikan nilai <b>' + a.jenis.toUpperCase() + ' ' + semLbl(a.semester) + ' ' + esc(a.tahun) + '</b> kelas ' + esc(kls(a.kelas)) + ' ke murid?', { ok: 'Publikasikan' })) return;
  busy(el, true);
  try { const r = await rpc('setPublikAsesmen', { tahun: a.tahun, semester: a.semester, jenis: a.jenis, kelasId: a.kelas, publik: pub }); S.d.asesmenPeriode = (S.d.asesmenPeriode || []).filter(x => x.id !== r.id).concat(r); saveCache(); renderRoute(false); toast(pub ? 'Nilai dipublikasikan ke murid' : 'Publikasi ditarik'); } catch (e) { toast(e.message, 'er'); busy(el, false); }
};
ACT.asTpl = async () => {
  const a = asEnsure(), sis = S.d.murid.filter(u => u.kelasId === a.kelas && u.aktif), head = ['No', 'NISN', 'Nama', 'Username', 'Nilai', 'Catatan (opsional)'], rows = sis.map((u, i) => [i + 1, u.nisn || '', u.nama, u.username, a.draft[u.id] && a.draft[u.id].nilai != null ? a.draft[u.id].nilai : '', a.draft[u.id] ? a.draft[u.id].catatan : '']), nm = 'Template_' + a.jenis.toUpperCase() + '_' + kls(a.kelas).replace(/\W+/g, '_') + '_' + a.semester;
  try { await lib('xlsx'); const ws = XLSX.utils.aoa_to_sheet([head].concat(rows)); ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 32 }, { wch: 18 }, { wch: 10 }, { wch: 26 }]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, a.jenis.toUpperCase()); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['PETUNJUK'], ['1. Isi kolom Nilai (0–100). Jangan mengubah NISN, Nama, dan Username.'], ['2. Kolom Catatan boleh diisi (mis. remedial, susulan).'], ['3. Kosongkan Nilai bila belum ada. Impor lewat tombol "Impor Excel", lalu klik "Simpan Nilai".'], ['4. Kelas: ' + kls(a.kelas) + ' · ' + a.jenis.toUpperCase() + ' ' + semLbl(a.semester) + ' ' + a.tahun]]), 'Petunjuk'); XLSX.writeFile(wb, nm + '.xlsx'); toast('Template diunduh'); }
  catch (e) { download(nm + '.csv', head.join(',') + '\n' + rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv;charset=utf-8'); toast('Pustaka Excel gagal dimuat — diunduh sebagai CSV', 'er'); }
};
CH.asImp = async el => {
  const f = el.files[0]; el.value = ''; if (!f) return; const a = asEnsure();
  try {
    await lib('xlsx'); const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    let hi = rows.findIndex(r => r.some(c => /^nilai/i.test(String(c).trim()))); if (hi < 0) hi = 0; const H = rows[hi].map(c => String(c).toLowerCase().trim()), ix = re => H.findIndex(h => re.test(h));
    const cN = ix(/^nilai/), cI = ix(/nisn/), cU = ix(/username/), cM = ix(/^nama/), cC = ix(/catatan/); if (cN < 0) throw new Error('Kolom "Nilai" tidak ditemukan. Gunakan template dari tombol Template Excel.');
    const sis = S.d.murid.filter(u => u.kelasId === a.kelas && u.aktif), norm = s => String(s).replace(/\D/g, '').replace(/^0+/, ''), find = r => { if (cI >= 0 && norm(r[cI])) { const u = sis.find(x => norm(x.nisn) === norm(r[cI])); if (u) return u; } if (cU >= 0 && String(r[cU]).trim()) { const u = sis.find(x => x.username.toLowerCase() === String(r[cU]).trim().toLowerCase()); if (u) return u; } if (cM >= 0 && String(r[cM]).trim()) return sis.find(x => x.nama.toLowerCase() === String(r[cM]).trim().toLowerCase()); return null; };
    let ok = 0; const err = [];
    rows.slice(hi + 1).forEach((r, i) => { const label = String(r[cM >= 0 ? cM : 0] || r[cI] || '').trim(); if (!label && String(r[cN]) === '') return; const u = find(r); if (!u) return err.push('Baris ' + (hi + i + 2) + ': murid "' + label + '" tidak ditemukan di kelas ini'); const raw = String(r[cN]).replace(',', '.').trim(); if (raw === '') return; const v = Number(raw); if (isNaN(v) || v < 0 || v > 100) return err.push('Baris ' + (hi + i + 2) + ': nilai "' + raw + '" tidak valid (0–100)'); a.draft[u.id] = { nilai: v, catatan: cC >= 0 ? String(r[cC] || '').trim() : (a.draft[u.id] ? a.draft[u.id].catatan : '') }; ok++; });
    a.dirty = ok > 0; renderRoute(false); toast(ok + ' nilai dimuat. Klik "Simpan Nilai" untuk menyimpan.');
    if (err.length) modal({ size: 'sm', title: 'Catatan impor', body: '<div class="alert" style="margin:0"><i class="bi bi-exclamation-triangle"></i><div><b>' + err.length + ' baris dilewati</b><span>' + err.slice(0, 10).map(esc).join('<br>') + (err.length > 10 ? '<br>…dan ' + (err.length - 10) + ' lainnya' : '') + '</span></div></div>', foot: '<button class="btn btn-p" data-close>Mengerti</button>' });
  } catch (x) { toast(x.message, 'er'); }
};

/* ---------- Rekap semester & tahun ---------- */
function rkState() { if (!S.ui.rk) S.ui.rk = { kelas: (S.d.kelas[0] || {}).id || '', tahun: S.cfg.tahunAjaran }; return S.ui.rk; }
function lapMap() { const L = {}; laporan().forEach(x => L[x.u.id + '|' + x.m.id] = x); return L; }
function semGuru(u, tahun, sem, L) {
  const mods = S.d.materi.filter(m => m.publikasi && (!m.kelasId || m.kelasId === u.kelasId) && periodeOf(m).tahun === tahun && periodeOf(m).semester === sem), bb = {}; S.d.bebas.forEach(b => { if (b.userId === u.id) bb[b.materiId] = b; });
  const as = { sts: null, sas: null }; S.d.asesmen.forEach(r => { if (r.userId === u.id && r.tahun === tahun && r.semester === sem) as[r.jenis] = r.nilai; });
  return hitungSemester(mods, m => L[u.id + '|' + m.id] || { akhir: null, lengkap: false, kurang: ['Tidak ada data'] }, m => !!bb[m.id], as);
}
function rekapRows() { const r = rkState(), L = lapMap(); return S.d.murid.filter(u => u.kelasId === r.kelas && u.aktif).map(u => { const g = semGuru(u, r.tahun, 'ganjil', L), n = semGuru(u, r.tahun, 'genap', L); return { u, g, n, th: nilaiTahun(g, n) }; }); }
function rekapTab() {
  const r = rkState(), rows = rekapRows(), kkm = S.cfg.kkm, sc = v => v == null ? '<span class="muted3">–</span>' : '<span class="sc ' + scCls(v, kkm) + '">' + num(v) + '</span>';
  const hs = x => x.harian != null ? sc(x.harian) : x.harianSementara != null ? '<span class="muted3" title="Sementara: belum semua modul lengkap">~' + num(x.harianSementara) + '</span>' : '<span class="muted3">–</span>', ns = x => x.nilai != null ? '<b class="num">' + num(x.nilai) + '</b>' : '<span class="muted3" title="Kurang: ' + esc(x.kurang.join(', ')) + '">–</span>';
  return '<div class="page-head"><div><h1>Rekap Nilai Semester &amp; Tahun</h1><p class="muted" style="margin:4px 0 0">Nilai semester = Harian ' + S.cfg.bobotHarian + '% + STS ' + S.cfg.bobotSTS + '% + SAS ' + S.cfg.bobotSAS + '%. Nilai tahun = rata-rata Ganjil dan Genap. Muncul bila semua modul lengkap (kecuali yang dibebaskan) dan STS &amp; SAS terisi.</p></div><div class="acts"><button class="btn btn-s" data-act="rkXlsx">' + ic('file-earmark-excel') + ' Excel</button><button class="btn btn-p" data-act="rkPdf">' + ic('file-earmark-pdf') + ' PDF</button></div></div><div class="card"><div class="filters" style="grid-template-columns:1fr 1fr"><div class="field" style="margin:0"><label>Kelas</label><select class="sel" data-ch="rkSel" data-k="kelas">' + kOpts(r.kelas) + '</select></div><div class="field" style="margin:0"><label>Tahun ajaran</label><select class="sel" data-ch="rkSel" data-k="tahun">' + tahunOpts().map(t => '<option' + (t === r.tahun ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div></div>' +
    (rows.length ? '<div class="tw"><table class="tb stickyc" style="min-width:900px"><thead><tr><th rowspan="2">Murid</th><th colspan="4" style="text-align:center">Semester Ganjil</th><th colspan="4" style="text-align:center">Semester Genap</th><th rowspan="2">Nilai Tahun</th></tr><tr><th>Harian</th><th>STS</th><th>SAS</th><th>Nilai</th><th>Harian</th><th>STS</th><th>SAS</th><th>Nilai</th></tr></thead><tbody>' + rows.map(x => '<tr class="hv"><td><a style="cursor:pointer;font-weight:700" data-act="rkDetail" data-u="' + x.u.id + '">' + esc(x.u.nama) + '</a></td><td>' + hs(x.g) + '</td><td>' + sc(x.g.sts) + '</td><td>' + sc(x.g.sas) + '</td><td>' + ns(x.g) + '</td><td>' + hs(x.n) + '</td><td>' + sc(x.n.sts) + '</td><td>' + sc(x.n.sas) + '</td><td>' + ns(x.n) + '</td><td>' + (x.th != null ? '<b class="num">' + num(x.th) + '</b>' : '<span class="bd gry">–</span>') + '</td></tr>').join('') + '</tbody></table></div><p class="muted" style="font-size:12px;margin:10px 0 0">Klik nama murid untuk melihat rincian modul dan membebaskan modul. “~” = nilai harian sementara (belum semua modul lengkap).</p>' : emptyBox('people', 'Belum ada murid aktif di kelas ini.')) + '</div>';
}
CH.rkSel = el => { rkState()[el.dataset.k] = el.value; renderRoute(false); };
let RKW = null, RKU = null;
function rkDetailHtml() {
  const r = rkState(), u = mu(RKU), L = lapMap();
  return '<p class="muted" style="margin:0 0 12px">' + esc(kls(u.kelasId)) + ' · Tahun ajaran ' + esc(r.tahun) + '</p>' + ['ganjil', 'genap'].map(s => {
    const x = semGuru(u, r.tahun, s, L), bb = {}; S.d.bebas.forEach(b => { if (b.userId === u.id) bb[b.materiId] = b; });
    return '<div class="card" style="box-shadow:none;background:var(--card-2);margin-bottom:12px"><div class="card-h"><h3 style="font-size:15px">Semester ' + semLbl(s) + '</h3>' + (x.nilai != null ? '<span class="bd grn">Nilai semester: ' + num(x.nilai) + '</span>' : '<span class="bd gry">Belum lengkap</span>') + '</div>' +
      (x.list.length ? '<div class="tw"><table class="tb" style="min-width:420px"><tbody>' + x.list.map(e => '<tr><td><b>' + esc(e.m.judul) + '</b></td><td>' + (e.bebas ? '<span class="bd amb">Dibebaskan</span>' + (bb[e.m.id] && bb[e.m.id].alasan ? '<br><small class="muted">' + esc(bb[e.m.id].alasan) + '</small>' : '') : e.na ? '<span class="bd gry">Tanpa tahap bernilai</span>' : e.n.lengkap ? '<span class="bd grn">Lengkap · ' + num(e.n.akhir) + '</span>' : '<span class="bd gry">Belum lengkap</span><br><small class="muted3">Kurang: ' + esc(e.n.kurang.join(', ')) + '</small>') + '</td><td style="text-align:right">' + (e.bebas ? '<button class="btn btn-sm btn-s" data-act="rkBebas" data-m="' + e.m.id + '" data-b="0">Batalkan bebas</button>' : (!e.na && !e.n.lengkap ? '<button class="btn btn-sm btn-o" data-act="rkBebas" data-m="' + e.m.id + '" data-b="1">Bebaskan modul</button>' : '')) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted" style="margin:0">Belum ada modul pada semester ini.</p>') +
      '<div class="flow" style="margin-top:10px"><span class="' + (x.harian != null ? 'd' : '') + '">Harian ' + (x.harian != null ? num(x.harian) : x.harianSementara != null ? '~' + num(x.harianSementara) : '–') + '</span><span class="' + (x.sts != null ? 'd' : '') + '">STS ' + (x.sts != null ? num(x.sts) : '–') + '</span><span class="' + (x.sas != null ? 'd' : '') + '">SAS ' + (x.sas != null ? num(x.sas) : '–') + '</span></div>' + (!x.lengkap ? '<p class="muted" style="font-size:12px;margin:8px 0 0">Kurang: ' + esc(x.kurang.join(', ')) + '</p>' : '') + '</div>';
  }).join('');
}
ACT.rkDetail = el => { RKU = el.dataset.u; RKW = modal({ size: 'lg', title: 'Rincian Nilai — ' + mu(RKU).nama, body: rkDetailHtml(), foot: '<button class="btn btn-p" data-close>Tutup</button>', onClose: () => { RKW = null; return true; } }); };
ACT.rkBebas = el => {
  const mid = el.dataset.m, un = el.dataset.b === '1', m = mt(mid), u = mu(RKU);
  const apply = async alasan => { const r = await rpc('setBebas', { materiId: mid, userId: u.id, bebas: un, alasan }); S.d.bebas = S.d.bebas.filter(b => !(b.materiId === mid && b.userId === u.id)); if (r.bebas) S.d.bebas.push({ id: r.id, materiId: mid, userId: u.id, alasan: r.alasan, dicatat: Date.now() }); saveCache(); if (RKW) $('.mb', RKW).innerHTML = rkDetailHtml(); renderRoute(false); toast(un ? 'Modul dibebaskan untuk ' + u.nama : 'Pembebasan dibatalkan'); };
  if (!un) return apply('').catch(e => toast(e.message, 'er'));
  const w = modal({ size: 'sm', title: 'Bebaskan modul', body: '<p style="margin-top:0">Modul <b>' + esc(m.judul) + '</b> tidak akan dihitung dalam nilai harian semester untuk <b>' + esc(u.nama) + '</b>.</p><div class="field"><label for="bbA">Alasan (opsional)</label><input id="bbA" class="inp" maxlength="200" placeholder="mis. sakit, pindahan, izin lama"></div><div id="bbE" class="ferr hide"></div>', foot: '<button class="btn btn-s" data-close>Batal</button><button class="btn btn-p" id="bbS">Bebaskan</button>' });
  $('#bbS', w).onclick = async e => { busy(e.currentTarget, true); try { await apply($('#bbA', w).value); closeM(w, 'force'); } catch (x) { $('#bbE', w).textContent = x.message; $('#bbE', w).classList.remove('hide'); busy(e.currentTarget, false); } };
};
function rekapExportData() {
  const r = rkState(), f = v => v == null ? '–' : num(v);
  return { name: 'Rekap_Nilai_' + kls(r.kelas).replace(/\W+/g, '_') + '_' + r.tahun.replace('/', '-'), title: 'Rekap Nilai Tahun Ajaran ' + r.tahun + ' — Kelas ' + kls(r.kelas), head: ['No', 'Nama', 'NISN', 'G-Harian', 'G-STS', 'G-SAS', 'G-Nilai', 'Gn-Harian', 'Gn-STS', 'Gn-SAS', 'Gn-Nilai', 'Nilai Tahun'],
    rows: rekapRows().map((x, i) => [i + 1, x.u.nama, x.u.nisn || '', f(x.g.harian != null ? x.g.harian : x.g.harianSementara), f(x.g.sts), f(x.g.sas), f(x.g.nilai), f(x.n.harian != null ? x.n.harian : x.n.harianSementara), f(x.n.sts), f(x.n.sas), f(x.n.nilai), f(x.th)]) };
}
ACT.rkXlsx = () => { const d = rekapExportData(); exportXlsx(d.name, d.head, d.rows); };
ACT.rkPdf = () => { const d = rekapExportData(); exportPdf(d.title + ' (G = Ganjil, Gn = Genap)', d.head, d.rows, 'landscape'); };

/* =====================================================================
 * BAGIAN D — Ekspor Excel/PDF & inisialisasi
 * ===================================================================== */
async function exportXlsx(name, head, rows) {
  try { await lib('xlsx'); const ws = XLSX.utils.aoa_to_sheet([[S.cfg.namaMadrasah || MADRASAH], [name.replace(/_/g, ' ') + ' — ' + new Date().toLocaleDateString('id-ID')], [], head].concat(rows)); ws['!cols'] = head.map(() => ({ wch: 22 })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Laporan'); XLSX.writeFile(wb, name + '.xlsx'); toast('Excel diunduh'); }
  catch (e) { download(name + '.csv', head.join(',') + '\n' + rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv;charset=utf-8'); toast('Pustaka Excel gagal dimuat — diunduh sebagai CSV', 'er'); }
}
async function exportPdf(title, head, rows, orient) {
  try { await lib('jspdf'); await lib('autotable'); const doc = new window.jspdf.jsPDF({ orientation: orient || 'landscape', unit: 'pt', format: 'a4' }), W = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(S.cfg.namaMadrasah || MADRASAH, W / 2, 34, { align: 'center' }); doc.setFontSize(11); doc.text((S.cfg.namaApp || 'Portal Informatika') + ' — ' + title, W / 2, 52, { align: 'center' }); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Tahun ajaran ' + S.cfg.tahunAjaran + ' · Dicetak ' + new Date().toLocaleString('id-ID'), W / 2, 66, { align: 'center' });
    doc.autoTable({ head: [head], body: rows.map(r => r.map(v => v == null ? '–' : String(v))), startY: 80, styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [59, 31, 163] }, alternateRowStyles: { fillColor: [243, 244, 248] }, didDrawPage: () => { doc.setFontSize(8); doc.setTextColor(120); doc.text('© ' + new Date().getFullYear() + ' Ufi Syaiful Ulum, Gr.', W / 2, doc.internal.pageSize.getHeight() - 16, { align: 'center' }); } });
    doc.save(title.replace(/\W+/g, '_') + '.pdf'); toast('PDF diunduh'); } catch (e) { toast('Gagal membuat PDF: ' + e.message, 'er'); }
}
function reportData(m) {
  if (m === 'murid') { const r = S.d.materi.map(mm => { const n = nilaiMateri(mm), st = stg(mm); return [mm.judul, st.vis.materi ? (st.done.materi ? 'Dipelajari' : 'Belum dibaca') : '–', num(n.pre), num(n.tug), num(n.pos), akhirTxt(n), n.akhir == null ? 'Belum lengkap' : n.akhir >= S.cfg.kkm ? 'TUNTAS' : 'REMEDIAL']; }); return { name: 'Rekap_Nilai_' + S.d.me.nama.replace(/\W+/g, '_'), title: 'Rekap Nilai — ' + S.d.me.nama + ' (' + S.d.kelasNama + ')', head: ['Modul', 'Status Materi', 'Pretes', 'Tugas', 'Postes', 'Nilai Akhir', 'Kelulusan'], rows: r }; }
  const r = filteredLaporan().map(x => [x.u.nama, kls(x.u.kelasId), x.m.judul, x.done ? 'Dipelajari' : x.red ? 'Belum dibaca' : 'Belum', num(x.pre), num(x.tug), num(x.pos), akhirTxt(x), x.keluar ? 'Keluar aplikasi' : '']);
  return { name: 'Laporan_Nilai', title: 'Laporan Nilai', head: ['Murid', 'Kelas', 'Materi', 'Status Materi', 'Pretes', 'Tugas', 'Postes', 'Akhir', 'Catatan'], rows: r };
}
ACT.expXlsx = el => { const r = reportData(el.dataset.m); exportXlsx(r.name, r.head, r.rows); };
ACT.expPdf = el => { const r = reportData(el.dataset.m); exportPdf(r.title, r.head, r.rows, el.dataset.m === 'murid' ? 'portrait' : 'landscape'); };

/* ---------- Prefetch guru: data menu berikutnya sudah siap sebelum diklik (1 permintaan batch) ---------- */
let _pf = false;
function schedPrefetch() {
  if (_pf || !S.d || S.imp || role() !== 'guru') return; _pf = true;
  if (navigator.connection && navigator.connection.saveData) return;
  const run = () => {
    if (!S.d || role() !== 'guru') return;
    const k = (S.d.kelas[0] || {}).id, b = todayStr().slice(0, 7), q = { quiet: true }, nop = () => { };
    if (k) {
      rpc('getAbsensi', { kelasId: k, dari: todayStr() }, q).catch(nop);
      rpc('getAbsensi', { kelasId: k, dari: b + '-01', sampai: b + '-31' }, q).catch(nop);
      rpc('getJurnal', { kelasId: k, dari: b + '-01', sampai: b + '-31' }, q).catch(nop);
    }
    (S.d.materi || []).slice(0, 4).forEach(m => rpc('getSoal', { materiId: m.id }, q).catch(nop));
  };
  setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(run, { timeout: 4000 }) : run()), 2500);
}

/* ---------- PWA: pasang di HP + Service Worker (gas-pwa-github) ---------- */
let _ip = null, _swHad = false;
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
function pwaUi() { const hide = isStandalone(); $$('[data-pwa]').forEach(b => b.classList.toggle('hide', hide)); }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _ip = e; pwaUi(); });
window.addEventListener('appinstalled', () => { _ip = null; pwaUi(); toast('Aplikasi terpasang di layar utama'); });
ACT.pwa = async () => {
  if (_ip) { try { _ip.prompt(); await _ip.userChoice; } catch (e) { } _ip = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const st = (i, t, d) => '<div class="pwa-step">' + ic(i) + '<div><b>' + t + '</b><span class="muted">' + d + '</span></div></div>';
  modal({ size: 'sm', title: 'Pasang Portal Informatika di HP', body: (ios
    ? st('browser-safari', 'Buka lewat Safari', 'Di iPhone/iPad, pemasangan hanya bisa dari Safari (bukan aplikasi lain).') + st('box-arrow-up', 'Ketuk tombol Bagikan', 'Ikon kotak dengan panah ke atas di bilah bawah Safari.') + st('plus-square', 'Pilih “Tambah ke Layar Utama”', 'Lalu ketuk <b>Tambah</b>. Ikon Portal Informatika muncul di layar utama.')
    : st('browser-chrome', 'Buka lewat Chrome', 'Gunakan Chrome (Android) atau Edge/Chrome (laptop).') + st('three-dots-vertical', 'Ketuk menu ⋮', 'Pojok kanan atas browser.') + st('download', 'Pilih “Pasang aplikasi” / “Tambahkan ke layar utama”', 'Jika opsi belum muncul, tunggu beberapa detik hingga halaman selesai dimuat lalu coba lagi.'))
    + '<p class="muted" style="font-size:12px;margin:10px 0 0">Setelah terpasang, aplikasi terbuka layar penuh seperti aplikasi biasa dan memuat lebih cepat.</p>', foot: '<button class="btn btn-p" data-close>Mengerti</button>' });
};
if ('serviceWorker' in navigator) {
  _swHad = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (_swHad && !T) toast('Versi baru aplikasi terpasang. Muat ulang halaman untuk memakainya.'); _swHad = true; });
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW gagal:', e.message)));
}

/* ---------- Mulai ---------- */
window.addEventListener('error', e => { if (e && e.message && !/ResizeObserver/.test(e.message)) console.error(e.message); });
init();
setTimeout(() => lib('chart').catch(() => { }), 1500);