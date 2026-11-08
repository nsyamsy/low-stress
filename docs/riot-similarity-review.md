# Tinjauan Kemiripan dan Nama — Game Riot ("Uproar on the Silent Station")

Tanggal: 2026-11-08 · Status: **DRAF — menunggu tanda tangan pemilik (RT-54)**
Game tetap `inactive` sampai dokumen ini disetujui. Dokumen ini bukan nasihat hukum.

Acuan: [konsep Riot](concepts/riot.md) §1 (batasan hak cipta) dan §10 (risiko merek).

## 1. Perbandingan dengan Among Us (Innersloth)

| Aspek | Among Us | Riot (implementasi saat ini) | Penilaian |
|---|---|---|---|
| Judul | "Among Us" | "Uproar on the Silent Station" / "Gaduh di Stasiun Hening" (slug teknis `riot`) | Berbeda; kata "Riot" tidak tampil ke pemain |
| Istilah peran | Crewmate / Impostor | Kru / Penyusup | Berbeda sesuai §1 |
| Karakter | "Kacang" bervisor | Mochi prosedural (6 spesies: orb/moth/newt/puff/sprite/crab) + Humanoid CC0 (Kenney) | Siluet berbeda; bukan kacang |
| Peta | The Skeld / Airship / dkk (denah Innersloth) | Stasiun Orbital Hening: 10 ruangan orisinal (Komando, Hidroponik, Antena, Kargo, Pendingin, Asrama, Biolab, Observasi, Generator, Ventilasi) — `games/riot/shared/collision.json` | Denah digambar sendiri; nama ruangan orisinal |
| Tugas | Kabel, geser kartu, unduh/unggah data, bahan bakar mesin, buang sampah, dsb | Kalibrasi antena, kebun hidroponik, susun kargo, sinkronkan jam, cocokkan kristal, rapikan arsip, seduh minuman, atur lampu kubah, bersihkan kaca, pindahkan sampel (10 tugas, `shared/tasks.ts`) | Daftar sengaja berbeda; tidak ada tugas yang disalin |
| Aksi penyusup | Kill dengan animasi kekerasan/darah | Visual netral: korban memudar jadi hantu + penanda hologram (R6, `shared/actions.ts`) | Tanpa darah/kekerasan |
| Antarmuka | HUD Innersloth | Token desain Low Stress, joystick virtual, panel rapat/voting sendiri | Gaya berbeda |
| Suara | Efek khas Among Us | Sintesis WebAudio orisinal (`client/audio.ts`), tanpa berkas pihak ketiga | Orisinal |
| Aset | Milik Innersloth | Mochi prosedural sendiri + GLB CC0 Kenney tercatat di `games/riot/assets/LICENSES.md`; `pnpm check:assets` hijau | Tidak memakai aset Innersloth |

**Kesimpulan kemiripan:** genre deduksi sosial (peran tersembunyi, tugas, rapat, voting) adalah gagasan umum yang tidak dilindungi; ekspresi spesifiknya (nama, karakter, denah, tugas, antarmuka, suara, aset) semuanya berbeda dari Among Us.

## 2. Pemeriksaan nama terhadap merek Riot Games

- Judul publik **tidak** memakai kata "Riot" secara polos, tidak memakai logo/gaya visual Riot Games, dan tidak menyiratkan afiliasi.
- Slug teknis `riot`, namespace soket `/riot`, rute `/games/riot`, dan tabel `riot_*` adalah pengenal internal yang tidak tampil sebagai merek ke pemain (teks pemain diperiksa otomatis di `games/riot/test/manifest.test.ts`).
- Risiko sisa: pemilik menilai risiko merek kecil untuk pengguna lokal (LAN). **Periksa ulang bila dideploy Public** (konsep §10). Ini bukan nasihat hukum; pertimbangkan tinjauan hukum singkat sebelum rilis publik.

## 3. Tanda tangan

- [ ] Pemilik menyetujui tinjauan ini.
- [ ] Pemilik menyetujui pengaktifan game (`inactive` → `active`).

Catatan: pengaktifan juga memerlukan RT-50 s.d. RT-53 selesai dan terverifikasi.
