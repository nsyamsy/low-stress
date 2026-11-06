# Konsep game: "Riot" (judul dipilih pemilik, 2026-11-05)

Versi: 0.2 (konsep) · Tanggal: 2026-11-05 · Status: **belum ada kode, belum ada aset diunduh**. Keputusan pemilik tercatat di §2.

Game deduksi sosial 3D multiplayer untuk Low Stress: sebagian pemain adalah **Kru** yang menyelesaikan tugas, sebagian kecil adalah **Penyusup** yang menyabotase, dan semua saling menebak lewat rapat dan voting. Setelah disetujui, dokumen ini dipecah menjadi tugas eksekusi gaya [ROADMAP.md](../ROADMAP.md).

Dokumen terkait: [PRD.md](../PRD.md) · [Architecture.md](../Architecture.md) · [TASKS_DEBUG_REFACTOR.md](../TASKS_DEBUG_REFACTOR.md)

---

## 1. Batasan hak cipta (wajib dibaca)

Genre dan mekanik dasar deduksi sosial (peran tersembunyi, tugas, rapat, voting) adalah gagasan umum. Yang dilindungi adalah ekspresi spesifik: **nama, karakter, peta, antarmuka, suara, dan aset** Among Us. Innersloth menyatakan klon dan port dilarang dan tidak menerima permintaan lisensi; karya penggemar nonkomersial hanya ditoleransi tanpa lisensi ([kebijakan mod](https://innersloth.com/modpolicy.php), [kebijakan karya penggemar](https://innersloth.com/fanpolicy.php)). Dokumen ini bukan nasihat hukum.

**Catatan keputusan pemilik:** pemilik menyatakan memakai tema Among Us "tidak apa-apa". Tema **luar angkasa** memang bebas dipakai (setting umum). Namun **nama "Among Us", denah/peta The Skeld, karakter, antarmuka, suara, dan aset milik Innersloth tidak dipakai**: hanya pemegang haknya yang bisa mengizinkannya, dan pemilik situs tidak bisa memberi izin itu. Mengganti karakter saja juga tidak cukup. Agar game ini orisinal dalam genre yang sama, semua hal berikut harus berbeda:

| Aspek | Aturan |
|---|---|
| Nama | Bukan "Among Us"; hindari "Impostor", "Crewmate", "Sus". Pakai "Penyusup", "Kru", "Rapat" |
| Karakter | Bukan "kacang" bervisor. Siluet, wajah, dan proporsi orisinal (§4) |
| Peta | Stasiun luar angkasa boleh, tetapi **denah, nama ruangan, dan bentuk modul orisinal**; jangan meniru peta Among Us mana pun |
| Tugas | Mini-game sendiri (§6); jangan menyalin tugas Among Us (kabel, geser kartu, unduh/unggah data, bahan bakar mesin, buang sampah, dan sejenisnya) |
| Antarmuka dan ikon | Gaya Low Stress (token desain); bukan tiruan HUD, tombol, atau layar peran Among Us |
| Suara dan musik | Orisinal atau CC0; tidak meniru efek khas Among Us |
| Aset | Hanya aset sendiri atau berlisensi bebas yang tercatat (§8) |
| Pemasaran | Tidak menyebut atau menyiratkan hubungan dengan Among Us/Innersloth |

Karena situs dapat dideploy **Public**, pertimbangkan tinjauan hukum singkat sebelum rilis publik.

## 2. Keputusan pemilik

| Topik | Keputusan |
|---|---|
| Arah | Genre seperti Among Us; elemen lain dibuat berbeda sesuai §1 |
| Karakter | **Gabungan (arah C, §4)**: dapat dipilih dan dikustomisasi; aset karakter disediakan |
| Jumlah pemain | Tidak dikunci. Master room (host) yang menyetujui dan memulai; 4 pemain boleh, 20 pemain tidak masalah |
| Mobile | Didukung sejak awal |
| Aset 3D | Gratis atau sumber terbuka dari internet, lisensi tercatat |
| Tema peta | **Stasiun luar angkasa** dengan denah orisinal (§5) |
| Aksi penyusup | **Visual netral** (§6): tanpa darah, tanpa efek kekerasan |

| Judul | **"Riot"** (dipilih pemilik 2026-11-05). Catatan risiko nama di §10 |

Masih terbuka: nama stasiun dan ruangan, dan daftar spesies/aksesori awal.

---

### USULAN (RT-05, Menunggu Persetujuan Pemilik)

Berikut adalah usulan detail untuk keputusan terbuka di atas. Seluruh poin di bawah berstatus **USULAN, menunggu persetujuan pemilik** (belum disetujui sampai pemilik memutuskannya):

#### A. Judul Publik Penuh (Mitigasi Risiko Merek Riot Games §10)
- **Usulan 1 (Direkomendasikan):** `Low Stress: Riot di Stasiun Hening` (*Low Stress: Riot on Silent Station*) — Mempertahankan nama "Riot" dengan deskriptor stasiun luar angkasa dan payung Low Stress agar jelas tidak terafiliasi dengan Riot Games.
- **Usulan 2:** `Riot: Sabotase Luar Angkasa` (*Riot: Deep Space Sabotage*).
- **Usulan 3:** `Stasiun Hening: Sabotase Antariksa` (dengan slug teknis dan namespace tetap `riot`).

#### B. Nama Stasiun
- **Usulan:** **Stasiun Orbital Hening (Silent Orbital Station / SOS)** — Stasiun penelitian ilmiah terpencil di tepi sabuk asteroid Nusantara.

#### C. Denah Orisinal: 10 Ruangan Stasiun
1. **Ruang Komando (Command Center):** Lokasi meja konsol utama dan tombol rapat darurat (*emergency meeting*).
2. **Kebun Hidroponik (Hydroponics Bay):** Ruang pembibitan botani dan pasokan oksigen stasiun.
3. **Dok Kargo (Cargo Dock):** Area muatan logistik, peti kontainer, dan pintu air pendaratan.
4. **Laboratorium Biologi (Bio Lab):** Fasilitas analisis sampel kristal dan mikroorganisme antariksa.
5. **Ruang Antena Komunikasi (Comms Array):** Konsol sinyal komunikasi sub-ruang dan piringan pemancar.
6. **Mesin Pendingin Reaktor (Cooling Core):** Ruang tabung pendingin reaktor plasma stasiun.
7. **Asrama Kru (Crew Quarters):** Ruang istirahat dan kapsul tidur awak stasiun.
8. **Kubah Observasi (Observation Dome):** Kubah kaca transparan untuk mengamati luar angkasa dan navigasi.
9. **Ruang Generator Daya (Power Grid):** Panel sakelar distribusi listrik dan baterai cadangan.
10. **Lorong Ventilasi & Servis (Maintenance Tunnels):** Lorong sempit di sekeliling stasiun dengan sudut buta.

#### D. 6 Spesies Mochi Awal (Prosedural §4)
1. **Kucing (Cat):** Telinga lancip segitiga dan ekor lentur melengkung.
2. **Kelinci (Rabbit):** Telinga panjang tegak dan ekor pom-pom bulat.
3. **Burung (Bird):** Paruh mungil dan siluet sayap kecil di samping badan.
4. **Katak (Frog):** Mata bulat menonjol di atas kepala dan pipi tembam.
5. **Beruang (Bear):** Telinga bulat setengah lingkaran dan moncong halus.
6. **Rubah (Fox):** Telinga segitiga lebar dan ekor mengembang lebat.

#### E. 8 Aksesori Awal (Tema Luar Angkasa & Santai §4)
1. **Helm Kosmonot Gelembung (Cosmo Bubble Helmet)**
2. **Topi Radar Mini (Mini Radar Dish)**
3. **Kacamata Peneliti Lab (Lab Goggles)**
4. **Bando Antena Berkedip (Blinking Antenna Headband)**
5. **Syal Galaksi Berbintang (Starlight Scarf)**
6. **Headset Komunikasi Kru (Comms Headset)**
7. **Mahkota Kristal Kosmik (Cosmic Crystal Crown)**
8. **Jepit Bunga Hidroponik (Hydroponic Flower Clip)**

---

## 3. Aturan permainan

**Peran:** Kru dan Penyusup. Jumlah penyusup diatur host; bawaan `ceil(pemain / 6)` (4 pemain = 1, 12 = 2, 20 = 4); batas atas `floor((pemain - 1) / 2)` agar penyusup selalu lebih sedikit dari kru saat mulai.

**Mulai:** host membuka room, pemain bergabung (undangan atau daftar room, memakai pola lobi Ludo), host mengatur opsi lalu menekan **Mulai**. Minimal 4 pemain; tidak ada batas atas tetap (batas praktis di §7).

**Ronde:**
1. Peran dibagikan secara rahasia (server hanya mengirim peran ke pemiliknya).
2. Pemain berjalan di stasiun, Kru mengerjakan tugas; Penyusup berpura-pura mengerjakan.
3. Penyusup dapat **beraksi** (§6) dengan waktu tunggu, dan **sabotase** (pemadaman, kunci pintu, alarm).
4. Siapa pun yang menemukan **penanda tersingkir** dapat **melapor**, atau menekan **tombol rapat** di ruang komando (jumlah terbatas per pemain).
5. **Rapat:** diskusi lewat chat teks (disensor server, maksimal 300 karakter) selama waktu yang diatur host, lalu **voting** (pilih pemain atau lewati). Pemain dengan suara terbanyak tersingkir; seri berarti tidak ada yang tersingkir.
6. Pemain yang tersingkir menjadi **hantu penonton**: tetap bisa berjalan dan menyelesaikan tugas, tidak bisa bicara dengan pemain hidup.

**Menang:**
- Kru menang bila **semua tugas selesai** atau **semua penyusup tersingkir**.
- Penyusup menang bila jumlahnya **sama dengan atau melebihi** kru hidup, atau bila sabotase kritis tidak diperbaiki tepat waktu.

**Opsi host:** jumlah penyusup, jumlah tugas per pemain, kecepatan jalan, radius pandang, waktu tunggu aksi, durasi diskusi dan voting, jumlah rapat darurat.

**Poin leaderboard** (memakai sistem skor generik): menang +10, tugas selesai +1 per tugas (batas per ronde), menebak penyusup dengan benar +2. Papan mingguan, bulanan, dan sepanjang waktu seperti game lain.

## 4. Karakter dan kustomisasi

Keputusan pemilik: **arah C (gabungan)**. Karakter harus orisinal dan **berbeda siluet** dari "kacang bervisor".

| | Arah | Isi | Aset |
|---|---|---|---|
| A | Karakter prosedural "Mochi" | Tubuh bulat gemuk berwajah sederhana; **spesies** ditentukan telinga/ekor/paruh (kucing, kelinci, burung, katak, beruang, rubah) | Dibuat dengan kode; tanpa unduhan |
| B | Humanoid imut berlisensi bebas | Mis. Kenney "Mini Characters" dengan pewarnaan | Unduhan CC0; animasi perlu dicek |
| **C (dipilih)** | **Gabungan** | Dasar Mochi prosedural (A) sebagai tipe tubuh utama, plus tipe tubuh **humanoid** (B) sebagai pilihan kedua, plus aksesori dari paket CC0 | Sebagian unduhan |

**Cara kerja gabungan:** pemain memilih **tipe tubuh** (Mochi atau Humanoid), lalu spesies atau model, warna, aksesori, dan nama. Kedua tipe memakai sistem kustomisasi, penamaan, dan penyimpanan profil yang sama; tipe humanoid memakai aset hasil unduhan yang lisensinya tercatat.

**Kenapa dasarnya A:** orisinal (tidak ada pihak lain yang punya), kustomisasi hampir tak terbatas, dan ringan untuk 20 pemain di ponsel (instance dengan warna per-instance). Generator karakter Mochi dibangun sebagai bagian pekerjaan, termasuk ekspor ke GLB bila dibutuhkan.

**Kustomisasi:** tipe tubuh, spesies/model (6 awal untuk Mochi), warna badan (12), warna aksen, aksesori termasuk helm dan topi bertema luar angkasa (8 awal), nama tampil. **Keterbacaan:** pemain dibedakan dengan warna **dan** nama dan aksesori, bukan warna saja (demi buta warna). Pilihan disimpan di profil.

**Animasi:** Mochi prosedural (goyang jalan, memantul, squash saat berhenti, melambai saat rapat). Tipe humanoid memakai animasi dari paketnya (bila ada) atau animasi prosedural sederhana.

## 5. Peta: stasiun luar angkasa (denah orisinal)

Satu level low-poly dengan 9–11 ruangan bernama sendiri, mis. **ruang komando** (tombol rapat), **kebun hidroponik**, **dok kargo**, **laboratorium**, **ruang antena**, **ruang mesin pendingin**, **asrama**, **kubah observasi**, dan lorong penghubung. Denah **harus digambar sendiri** dan tidak boleh meniru peta Among Us mana pun. Peta dirancang agar:
- ada beberapa jalur alternatif (lorong servis dan ventilasi) dan sudut buta;
- jumlah titik muncul (spawn) ≥ 24 untuk 20+ pemain;
- dapat diperluas dengan peta kedua kelak (mis. kantor).

Peta dibangun dari modul kecil (lantai, dinding, pintu, panel, kontainer) yang digabung atau di-instance agar draw call rendah. Kit modular luar angkasa CC0 tersedia (§8).

## 6. Aksi penyusup, tugas, dan sabotase

**Aksi penyusup (visual netral):** pada jarak dekat dan setelah waktu tunggu (bawaan 25 detik, diatur host), penyusup menyingkirkan satu pemain. Mekaniknya sama seperti genre ini, tetapi tampilannya netral: pemain **memudar menjadi hantu** dan meninggalkan **penanda hologram** berbentuk siluet di lokasi itu. Penanda inilah yang dapat dilaporkan. Tidak ada darah, tubuh, atau animasi kekerasan.

**Tugas (usulan awal, mini-game 10–25 detik, orisinal dan bertema stasiun):**

| Tugas | Mekanik |
|---|---|
| Kalibrasi antena | putar kenop sampai sinyal cocok dengan target |
| Kebun hidroponik | ketuk berirama mengikuti pola penyiraman |
| Susun kargo | seret blok ke grid sampai padat |
| Sinkronkan jam stasiun | geser tiga slider ke angka target |
| Cocokkan kristal | pasangkan bentuk yang sama |
| Rapikan arsip data | urutkan kartu berdasarkan warna |
| Seduh minuman | tahan tombol, lepas di zona hijau |
| Atur lampu kubah | cocokkan warna dengan pola |
| Bersihkan kaca observasi | gosok area kotor |
| Pindahkan sampel | bawa benda dari satu ruang ke ruang lain (tugas multi-langkah) |

Daftar ini sengaja berbeda dari tugas Among Us. Semua tugas punya area sentuh ≥ 44px dan tidak bergantung pada hover.

**Sabotase:** pemadaman (radius pandang mengecil), kunci pintu sementara, alarm yang harus dimatikan di dua titik sebelum waktu habis.

## 7. Arsitektur teknis

| Hal | Rencana |
|---|---|
| Render | three.js + `@react-three/fiber` (+ `drei`), dimuat **lazy** hanya saat game dibuka; kamera dari atas bersudut ~55° mengikuti pemain |
| Kontrol | Desktop: WASD/panah + tombol aksi; **mobile: joystick virtual kiri + tombol Gunakan/Lapor/Aksi kanan** (lanskap disarankan, potret tetap bisa) |
| Realtime | Socket.IO, room `<id>:<roomId>`; **server otoritatif**: tick ~15 Hz, klien mengirim input ~20 Hz dan meng-interpolasi posisi |
| Anti-curang | Server memeriksa kecepatan dan tabrakan; peran dan posisi pemain di luar jangkauan pandang **tidak dikirim** |
| Skala 20+ pemain | *Interest management*: tiap klien hanya menerima pemain dalam radius pandang (+ saat rapat); karakter Mochi dirender dengan `InstancedMesh` |
| Anggaran performa ponsel | target 30 fps; ≤ ~150 draw call (ukur dengan `renderer.info`); adegan ≤ ~100 ribu segitiga; atlas tekstur ≤ 2048px; total aset ≤ ~8–10 MB terkompresi; DPR turun otomatis saat fps rendah |
| Kompresi aset | `gltf-transform`/`gltfpack` (meshopt) dan tekstur WebP; di-host sendiri (tanpa CDN, jalan di LAN) |
| Koneksi putus | sambung ulang otomatis; pemain terputus > 60 detik diambil alih bot sederhana atau dianggap pergi |
| Aksesibilitas | tidak bergantung warna saja; kurangi goyangan kamera dan kilat di `prefers-reduced-motion`; semua teks i18n `id`/`en` |
| Chat rapat | disensor server (`sdk.profanity`), batas 300 karakter, rate limit |
| Admin | daftar room, hapus/reset, kick, lihat chat (pola moderasi Ludo) |

**Struktur di repositori:** `games/<id>/{manifest.ts, client/, server/, shared/, db/, locales/, assets/, thumbnail.svg}`; manifest `mode: "multiplayer"`, `mobile.supported: true`, orientasi `any`. Aturan murni (peran, pemenang, voting) di `shared/` dengan tes unit.

**Prasyarat dari [TASKS_DEBUG_REFACTOR.md](../TASKS_DEBUG_REFACTOR.md):**
- **R-04:** kontrak "logika server di dalam folder game" belum ada (server Ludo masih di inti). Game ini memerlukannya.
- **D-01:** database uji terpisah, agar tes room dan skor tidak menyentuh database pengembangan.
- **Kit room bersama:** pola lobi/undangan/host Ludo diekstrak ke `packages/sdk` (game tidak boleh mengimpor game lain) sebelum dipakai game kedua.

## 8. Aset: daftar pendek dan lisensi

**Status verifikasi:** lisensi di bawah diperiksa lewat hasil pencarian (halaman penerbit, itch.io, OpenGameArt) pada 2026-11-05, **bukan** dengan membaca berkas lisensi di dalam unduhan. **Sebelum mengunduh apa pun:** buka halaman resmi paket, periksa lisensi dan daftar berkas, lalu catat di `games/<id>/assets/LICENSES.md` (nama, pembuat, URL, lisensi, tanggal, berkas yang dipakai). Tidak ada yang diunduh saat ini.

| Sumber | Paket | Lisensi (hasil pencarian) | Kegunaan | Catatan |
|---|---|---|---|---|
| Kenney | [Space Station Kit](https://www.kenney.nl/assets/space-station-kit) | CC0 (90 berkas) | **Modul interior stasiun (peta utama)** | Tag: space station, sci-fi, interior; cek format GLB |
| Kenney | [Space Kit](https://kenney.nl/assets/space-kit) | CC0 (150 berkas) | Pelengkap: prop, roket, panel | Cek format |
| Kenney | [Mini Characters](https://kenney.nl/assets/mini-characters) | CC0 (25 berkas) | Tipe tubuh **humanoid** | Sumber berbeda soal animasi; cek berkas |
| KayKit (Kay Lousberg) | [Prototype Bits](https://kaylousberg.itch.io/prototype-bits), [Furniture Bits](https://kaylousberg.itch.io/furniture-bits) | Umumnya CC0 | Blok dasar, furnitur pelengkap | **Cek lisensi tiap paket**; sebagian seri berbayar (jangan dipakai) |
| Quaternius | [Ultimate Space Kit](https://opengameart.org/content/ultimate-space-kit-by-quaternius) | Kemungkinan CC0; satu daftar Sketchfab menulis CC-BY | Opsional | **Konfirmasi di quaternius.com** |
| Quaternius | Universal Animation Library 2 | CC0, glTF | Animasi untuk humanoid bila perlu | Cek kecocokan rig |
| Poly Pizza | katalog | **Per model**: campuran CC0 dan CC-BY | Aksesori tambahan | CC-BY wajib atribusi; catat per model |
| Sketchfab | katalog | Per model | Aksesori tambahan | Hindari NonCommercial/NoDerivatives |

**Aturan lisensi:**
1. Utamakan **CC0** (tanpa kewajiban atribusi).
2. CC-BY boleh bila dicatat; tambahkan layar **Kredit** di dalam game.
3. **Hindari** NonCommercial dan NoDerivatives (situs dapat dideploy Public).
4. Jangan memakai aset berbayar, unggahan ulang pihak ketiga tanpa sumber asli, atau model yang menggambarkan merek dagang nyata.
5. Setiap aset tercatat di `LICENSES.md`; CI memeriksa bahwa setiap berkas di `assets/` tercantum.

**Alat (konfirmasi lisensi saat dipasang; umumnya MIT):** three.js, `@react-three/fiber`, `@react-three/drei`, `gltf-transform`/`gltfpack`.

**Catatan:** Mochi dan aksesori buatan sendiri tidak memerlukan unduhan; unduhan hanya untuk modul peta, tipe humanoid, dan aksesori tambahan. Peta memakai **modul** dari Kenney tetapi **denahnya dirancang sendiri**.

## 9. Fase usulan

| Fase | Isi | Keluaran |
|---|---|---|
| 0 | Keputusan terbuka §2, nama akhir, verifikasi aset, prasyarat R-04/D-01 | Dokumen disetujui |
| 1 | Prototipe: peta kosong dari modul stasiun, jalan multi-pemain (WASD dan joystick), kamera, interpolasi, 20 klien simulasi | Uji jaringan dan fps ponsel (gerbang go/no-go) |
| 2 | Peran, 3 tugas, aksi penyusup (visual netral), kondisi menang | Satu ronde utuh tanpa rapat |
| 3 | Rapat, chat, voting, hantu penonton, sabotase | Permainan lengkap |
| 4 | Kustomisasi karakter (Mochi + humanoid), 10 tugas, denah final, suara, kredit | Fitur lengkap |
| 5 | QA mobile (iOS/Android), uji beban 20+ pemain, aksesibilitas, poin ke leaderboard, moderasi admin | Rilis |

Game ini adalah **yang terbesar** di Low Stress; Fase 1 sengaja berupa uji kelayakan sebelum investasi besar.

## 10. Risiko

| Risiko | Penanganan |
|---|---|
| Tuduhan klon / pelanggaran merek | Daftar §1 dipatuhi; tidak memakai nama atau aset Innersloth; tinjauan hukum bila Public |
| Judul "Riot" bersinggungan dengan merek Riot Games | Riot Games memegang beberapa pendaftaran merek "RIOT" dan "RIOT GAMES", termasuk untuk perangkat lunak game, dan pernah menggugat pihak lain yang memakai kata itu (esports dan pengendali game) ([Heitner Legal](https://heitnerlegal.com/2019/10/09/riot-games-is-not-cool-with-anyone-else-using-riot-in-the-esports-industry/)). Hasil pencarian tidak menunjukkan tindakan terhadap judul game lain, tetapi itu tidak membuktikan aman. Mitigasi: jangan memakai "Riot" polos sebagai merek dagang atau logo (mis. judul penuh "Riot: Stasiun Hening"), jangan memakai warna, huruf, atau gaya logo Riot Games, jangan menyiratkan hubungan dengan mereka, dan masukkan pemeriksaan nama ke tinjauan hukum sebelum rilis Public. Alternatif bila berisiko: "Riot" tetap sebagai nama internal, judul publik diganti |
| Denah terlalu mirip peta yang ada | Denah dirancang dari nol dan ditinjau pemilik terhadap peta Among Us |
| Performa ponsel dengan 20 pemain | Instancing, interest management, anggaran §7, uji awal di Fase 1 |
| Kecurangan (peran/posisi bocor) | Server otoritatif dan data dipersempit per klien |
| Lisensi aset | `LICENSES.md` dan pemeriksaan CI, utamakan CC0 |
| Kompleksitas | Fase bertahap; Fase 1 sebagai gerbang go/no-go |
| Pemain pasif/AFK menahan ronde | Pengatur waktu rapat, bot/pengambilalihan, host dapat mengeluarkan pemain |
| Perilaku di chat | Sensor server, batas laju, mute dan moderasi admin |
