# Daftar Lisensi Aset Game Riot

Dokumen ini mencatat seluruh aset yang digunakan oleh game **Riot** (`games/riot/`) sesuai dengan ketentuan [ROADMAP_RIOT.md](../../docs/ROADMAP_RIOT.md) §0 dan diperiksa otomatis oleh `tools/check-assets`.

## Aturan:
1. Hanya aset berlisensi bebas (CC0 / Domain Publik atau CC-BY dengan atribusi) yang diizinkan.
2. Lisensi dengan batasan NC atau ND DILARANG.
3. Seluruh berkas aset di folder `games/riot/assets/` wajib terdaftar di bawah ini.

## Daftar Aset:

### Aset internal (dihasilkan sendiri oleh proyek)

| Berkas | Sumber | Lisensi |
|---|---|---|
| `models/mochi-orb.glb` | Dihasilkan prosedural oleh `games/riot/tools/export-mochi-glb.ts` (geometri asli, tanpa sumber eksternal) | Internal / milik proyek |
| `models/mochi-moth.glb` | idem | Internal / milik proyek |
| `models/mochi-newt.glb` | idem | Internal / milik proyek |
| `models/mochi-puff.glb` | idem | Internal / milik proyek |
| `models/mochi-sprite.glb` | idem | Internal / milik proyek |
| `models/mochi-crab.glb` | idem | Internal / milik proyek |

### Aset eksternal

#### Kenney — Mini Characters (2.0)

- **Pembuat:** Kenney (www.kenney.nl)
- **URL halaman resmi:** https://kenney.nl/assets/mini-characters
- **Lisensi:** Creative Commons Zero (CC0) — dibaca dari `License.txt` dalam paket dan halaman resmi; tanpa NC/ND.
- **Tanggal unduh:** 2026-11-08
- **Berkas yang dipakai:** `models/humanoid/character-*.glb` (20 varian tubuh) dan `models/humanoid/Textures/colormap.png` (tekstur palet bersama).
- **Catatan:** Model diubah hanya secara teknis (path tekstur dipetakan ulang oleh pemuat); tidak ada perubahan bentuk. Atribusi "Kenney" disematkan di layar Kredit (RT-44).

| Berkas | Keterangan |
|---|---|
| `models/humanoid/character-alien.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-female-a.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-female-b.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-female-c.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-female-d.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-female-e.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-female-f.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-knight.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-male-a.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-male-b.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-male-c.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-male-d.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-male-e.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-male-f.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-male-g.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-raider.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-robot.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-soldier.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-worker.glb` | Varian tubuh Humanoid |
| `models/humanoid/character-zombie.glb` | Varian tubuh Humanoid |
| `models/humanoid/Textures/colormap.png` | Tekstur palet bersama semua varian |

### Audio

| Sumber | Lisensi |
|---|---|
| Efek suara & musik latar | Disintesis orisinal oleh `games/riot/client/audio.ts` via WebAudio API (osilator). Tidak ada sampel audio eksternal. | Internal / milik proyek |
