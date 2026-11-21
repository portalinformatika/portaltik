# Portal Informatika (Metode PRO) — Panduan Instalasi
MA TAHFIDH PUTRI YANBU'UL QUR'AN 2 MURIA · © Ufi Syaiful Ulum, Gr.

**Arsitektur baru:** frontend statis di **GitHub Pages** (+ PWA bisa dipasang di HP) → memanggil **Google Apps Script** sebagai REST API JSON → **Google Sheets/Drive**. Tidak ada iframe dan tidak ada `google.script.run`.

Ada 3 bagian: **A. Backend**, **B. Frontend**, **C. Migrasi data lama**. Kerjakan berurutan.

---
## A. Backend (Google Apps Script) — pakai akun Google yang SAMA dengan aplikasi lama

1. Buka https://script.google.com → **Proyek baru** (nama: `Portal Informatika PRO`).
2. Ganti isi `Code.gs` dengan isi **Kode.gs**, ubah namanya jadi `Kode`.
3. Tambah file **Script** bernama `Migrasi` → tempel isi **Migrasi.gs**.
4. **Project Settings** → centang **Show "appsscript.json"** → ganti isinya dengan **appsscript.json** yang disediakan.
5. Pilih fungsi:
   - **Data lama akan dipindah (disarankan):** jalankan `setupMigrasiBersih` ▶ (tanpa data contoh).
   - **Mulai dari nol:** jalankan `setupAppEnvironment` ▶ (ada data contoh).

   Beri izin saat diminta, lalu buka **Execution log**. Catat **KODE AKTIVASI** (hanya muncul bila belum ada akun guru).
6. Jalankan `pasangWarmup` ▶ sekali (pemicu tiap 5 menit agar server selalu siap dan tanpa jeda).
7. **Deploy → New deployment → Web app** → *Execute as*: **Me**, *Who has access*: **Anyone** → Deploy → **salin URL `/exec`**.
8. (Opsional) jalankan `cekKonfigurasi` ▶ untuk memeriksa status tanpa menampilkan rahasia.

> Setiap kali kode backend berubah: **Deploy → Manage deployments → Edit (pensil) → Version: New version → Deploy**. URL `/exec` tetap sama.

## B. Frontend (GitHub Pages)

**Folder kerja = folder hasil ekstrak ZIP `portal-informatika`.** Di dalamnya langsung terlihat `index.html`, `css`, `js`, `icons`. Di folder inilah `git init` dijalankan (bukan folder di atasnya).

1. Ekstrak ZIP. Buka `js/config.js`, ganti `GANTI_DENGAN_URL_EXEC_ANDA` dengan URL `/exec` dari langkah A7. **Hanya itu satu-satunya isi konfigurasi**; tidak ada rahasia di frontend.
2. Pasang Git (https://git-scm.com/download/win). Cek: `git --version`.
3. Identitas Git (sekali saja):
   ```
   git config --global user.name "Nama Anda"
   git config --global user.email "email-akun-github@contoh.com"
   ```
4. Di github.com: **+ → New repository**, nama `portal-informatika`, **Public**, **jangan** centang README/.gitignore/license.
5. Buka PowerShell **di folder hasil ekstrak** (File Explorer → klik address bar → ketik `powershell` → Enter). Pastikan `dir` menampilkan `index.html` paling atas. Bila tidak, Anda satu level salah: `cd` ke folder yang benar.
6. Jalankan satu per satu:
   ```
   git init
   git add .
   git commit -m "Upload pertama"
   git branch -M main
   git remote add origin https://github.com/USERNAME/portal-informatika.git
   git push -u origin main
   ```
   Saat diminta *Password*, tempel **Personal Access Token** (https://github.com/settings/tokens → Generate new token (classic) → centang **repo**). Layar tampak kosong saat paste, itu normal.
7. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch **main** / **(root)** → Save. Tunggu 1–2 menit, situs aktif di `https://USERNAME.github.io/portal-informatika/`.
8. Buka situs → **Aktivasi akun guru pertama** → isi kode aktivasi, nama, username, sandi. (Lewati bila migrasi data lama sudah membawa akun guru.)

**Update berikutnya:** `git add .` → `git commit -m "pesan"` → `git push`. Bila tampilan lama masih muncul: Ctrl+Shift+R. Untuk memaksa semua pengguna memperbarui berkas, naikkan `VERSI` di `sw.js`.

## C. Migrasi data dari aplikasi lama (aman, lama tidak disentuh)
Prinsip: spreadsheet lama **hanya dibaca**, akun Google sama (ID file Drive tetap valid), pencocokan berdasar nama kolom, idempoten, bisa diulang.

1. Salin **ID spreadsheet lama** (bagian antara `/d/` dan `/edit` di URL; atau buka dari tombol "Buka Google Sheets" di dasbor guru lama).
2. Di editor proyek baru, jalankan **berurutan** (ganti ID, lalu ▶ fungsi lewat kotak "Run" atau tambahkan pembungkus sementara):
   - `migrasiSkema()` — memastikan semua sheet/kolom ada.
   - `migrasiPindai('ID_LAMA')` — **dry-run**: hanya menghitung tambah/ubah/lewati. Baca laporannya di Execution log.
   - `migrasiJalankan('ID_LAMA')` — menulis data. Boleh diulang sesaat sebelum peluncuran (**delta-sync**).
   - Data besar: `migrasiSheet('ID_LAMA', 'HasilTes', false)` per sheet (menghindari batas 6 menit).
3. Yang dibawa: kelas, murid (**sandi lama tetap berlaku**), materi, konten, soal, tugas, progres, hasil tes, pengumpulan, kelompok, absensi, jurnal, asesmen, pengumuman. **Tidak** dibawa: `Config` (pengaturan baru dipertahankan, atur ulang di menu Pengaturan) dan `LogAktivitas` (tetap di spreadsheet lama).
4. Murid cukup membuka URL baru dan login seperti biasa (sesi lama berakhir karena alamat baru).
5. Spreadsheet lama dibiarkan utuh sebagai cadangan.

> Catatan: aplikasi lama memakai id soal demo yang bentrok antara pretes/postes. Bila Anda masih memakai **soal demo** lama, soal postes demo hanya terbawa sebagian. Soal buatan Anda sendiri tidak terpengaruh.

## D. Pasang di HP (PWA)
- **Android (Chrome):** buka situs → tombol **Pasang di HP** di menu samping (atau menu ⋮ → *Pasang aplikasi*).
- **iPhone (Safari):** tombol **Bagikan** → **Tambah ke Layar Utama**.
- Setelah terpasang, aplikasi terbuka layar penuh, berkas statis dimuat dari cache perangkat sehingga terbuka lebih cepat. Data tetap diambil langsung dari server.

## E. Keamanan (ringkas)
- Semua rahasia (`SESSION_SECRET`, `SPREADSHEET_ID`, `ROOT_FOLDER_ID`, kode aktivasi) hanya di **Script Properties**, dibangkitkan otomatis, tidak ada di kode/Sheets/frontend/log.
- Token sesi ditandatangani HMAC, dikirim di body POST (bukan URL); perbandingan waktu-konstan.
- Akun guru terkunci 15 menit setelah 5x salah sandi; kode aktivasi sekali pakai.
- Lupa sandi guru: jalankan `resetSandiGuruPertama` ▶ di editor (sandi baru tampil sekali di log). Mencabut semua sesi: `rotasiSecretSesi` ▶.
- Batasi siapa yang punya akses **Edit** pada proyek Apps Script (hanya Anda).

## F. Performa — apa yang berubah
| Titik | Sebelum | Sekarang |
|---|---|---|
| Buka aplikasi | Halaman + iframe GAS | Halaman statis dari cache (SW) + data dari cache lokal, sinkron di latar |
| Boot server (cache hangat) | puluhan baca Sheets/cache | 3 panggilan cache, **0 baca Sheets** |
| Invalidasi cache | hapus per kunci | versi per tabel (tulis = versi naik) |
| Login | 1 tulis Sheets + 1 tulis log | waktu login & log rutin ditulis kolektif |
| Menu Absensi/Jurnal/Soal | 1 panggilan per klik | prefetch + cache 90 dtk + digabung 1 permintaan (batch) |
| Server "dingin" | 1–3 dtk | pemicu 5 menit + ping saat halaman dibuka |

Log aktivitas rutin kini **antrean kolektif** (kejadian penting seperti pelanggaran tes, reset, hapus tetap langsung). Ubah `LOG_MODE = 'langsung'` di `Kode.gs` bila ingin semuanya langsung.

## G. Troubleshooting cepat
| Gejala | Penyebab / solusi |
|---|---|
| "URL backend belum diisi" | `js/config.js` belum diisi URL `/exec`, lalu `git add . && git commit && git push` |
| "Respons server tidak valid" | Deploy belum "Anyone" / belum New version. Ulangi Deploy |
| Halaman tanpa gaya (CSS 404) | File rata di root repo; push ulang dari folder yang benar |
| 404 GitHub Pages | `git init` di folder induk; `index.html` harus terlihat di root repo |
| "Server sedang sibuk" | Banyak tulis bersamaan; klien mengulang otomatis |
| Tampil versi lama | Ctrl+Shift+R, atau naikkan `VERSI` di `sw.js` |
