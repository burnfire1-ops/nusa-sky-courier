# M8 Visual Upgrade — Log

Target: round 3 cutoff 27 Nov 2026 19:57 WIB. Benchmark: @halcyon-craft "Aether Ridge"
(laut biru-hijau, pegunungan hijau berlapis + salju, desa beratap merah, mercusuar,
viaduct, kokpit analog lengkap, debrief telemetri).

## Modul (modular-build: satu modul → verifikasi screenshot → baru lanjut)

- M8.0 Daftar modul + TDD RED (merge helper, toggle kokpit, flag cockpit di shots) — DONE
- M8.1 merge.js + toggle kokpit di input.js + field visual config.js — test hijau
- M8.2 Terrain berlapis (lathe + vertex color + beach + salju, noise seeded) — shot start
- M8.3 Landmark (desa atap merah, mercusuar, viaduct, hangar, windsock, ILS, palem rapat) — shot start
- M8.4 Laut + langit (glint CanvasTexture, sky dome gradient + sun disc, awan 2 tone) — shot start
- M8.5 Pesawat detail (merged vertex-color: livery + canopy + gear, prop disc, beacon instanced) — shot start
- M8.6 Kokpit view (tombol C, glareshield + 6 dial analog + compass tape, shot play = kokpit) — shot play
- M8.7 Re-capture 4 shot, JPEG, dossier, test, commit + push

## Anggaran draw call (diukur per shot via renderer.info)

- Baseline M6: 22 calls / 4474 tris. Budget keras: <30 calls, <40k tris.
- Estimasi M8 akhir: ~25 main + ~4 shadow = ~29. Bila ≥30: cabut ILS dulu, lalu windsock.

## Aturan yang dipegang

- VISUAL-ONLY: world.js / economy.js / missions.js tidak disentuh. ISLANDS x/z/radius/height tetap.
- Semua landmark instanced / merged (merge.js array murni, tanpa import three).
- Deterministik seed 1. Tanpa network. Three r187 tetap dari game/vendor/.

## Per modul

### M8.0 — DONE 27 Nov ~01:35 WIB
Baseline 06fa2ed, test 22/22 hijau. Test RED ditulis dulu (merge, toggle kokpit, flag cockpit).

### M8.1 — DONE 27 Nov ~01:35 WIB
`game/src/merge.js` (pure array merge, no THREE import), cockpit state + `isCockpit/setCockpit/toggleCockpit` + key 'c' di `input.js`, `cockpit` flag di semua return `shots.js` (play=true), field visual baru di `config.js` (PALETTE + LANDMARKS). Test 29/29 hijau.

### M8.2 — DONE 27 Nov ~01:4x WIB (terrain berlapis)
`render.js`: `hash2`, `tierColor` (sand → hijau → batu → salju), `islandProfile`, `buildIslandGeometry` (LatheGeometry 28 segmen, noise radial seeded, vertex colour + jitter), `islandSurfaceY` (eksport untuk penempatan landmark). Fix 1: tier volcano terlalu gelap + veil title 55% → rockDark/light dicerahkan, ambang salju 0.82→0.75. Fix 2: play staging 40s overshoot Bara + Tanjung jadi pancake oranye → PLAY_SECONDS 40→25, Tanjung jadi bukit hijau + crown kota abu-abu. Verifikasi: start 22 calls / 5.194 tris; play 20 / 5.084.

### M8.3 — DONE 27 Nov ~01:5x WIB (landmark)
`render.js`: `mergeParts` (satu mesh vertex-colour dari `[{geo, color}]`), `stripeTexture` (CanvasTexture merah-putih runtime). Desa: badan + atap prisma InstancedMesh (2 call). Palem: merged trunk+fronds, InstancedMesh 36×, ditanam di slope via `islandSurfaceY − 8` (1 call). Mercusuar: silinder + stripe texture. Viaduct: ExtrudeGeometry profil + 3 lubang arch. Hangar, windsock, ILS: merged (1 call masing-masing). World beacon: InstancedMesh sphere 4× (1 call). Fix 1: hangar (180,150) menjulang di jalur approach → pindah (350,320), pintu dicerahkan. Fix 2: mercusuar terlalu kecil/gelap → tinggi 260→380, radius 26/34→34/44. Fix 3: windsock (−140,−2900) menumpuk di titik freeze landing → pindah (−220,−2400). Verifikasi: start 27 calls / 7.266 tris; landing 28 / 7.314. Test 29/29.

### M8.4 — DONE 27 Nov ~01:5x WIB (laut + langit)
`render.js`: laut diganti CanvasTexture glint prosedural (hash2-seeded, repeat 48×48, roughness 0.28) + plane 1×1 segmen; sky dome SphereGeometry r=42000 vertex-colour gradient (zenith ungu → horizon oranye) + sun glow dibakar ke arah azimuth key light (SE) — 1 call, tanpa mesh sun disc terpisah; awan 12→18, dua tone via instanceColor (putih hangat + pink). Verifikasi: start 23 calls / 8.232 tris, test 29/29. Langit senja + laut glitter + glare matahari terbaca di screenshot.

### M8.5 — DONE 27 Nov ~01:5x WIB (pesawat detail)
`render.js`: pesawat 7 mesh → 3 call: badan merged vertex-colour (fuselage cream + stripe oranye + canopy gelap + sayap/tail/fin oranye + 4 kaki + 4 roda gelap), prop disc CircleGeometry r=26 transparan (opacity 0.12 + throttle×0.3, forceSinglePass), nav lights merged unlit (hijau kiri, merah kanan, putih ekor). `mergeParts` dapat opsi `basic: true`. `updateScene`: prop opacity (bukan rotasi), offset pesawat +8→+12 (roda menyentuh tanah tepat saat touchdown). Verifikasi: start 22 calls / 8.182 tris (turun dari 27), test 29/29. Livery + canopy + gear terbaca di shot landing.

### M8.6 — DONE 27 Nov ~02:0x WIB (kokpit view)
`render.js` `updateScene(..., cockpit)`: kamera kokpit rigid (tanpa smoothing) dari quaternion pesawat — posisi (0,15,12) lokal, lookAt (0,13,600), up ikut roll; `snapped=false` saat keluar kokpit supaya chase re-snap. `hud.js`: `updateCockpit(world, econ, missionText)` — 6 dial analog canvas (airspeed, attitude horizon, altitude, VSI, heading rose, fuel) + compass tape (label kardinal + caret + heading digital dalam kotak). `index.html`: `#cockpit-panel` (canvas 960×210) + `#compass-tape` (canvas 1280×40), CSS `body.cockpit` sembunyikan HUD chase. `main.js`: shot play → `setCockpit(staged.cockpit)`; loop pilih `updateCockpit` vs `updateHud`; `updateScene(..., isCockpit())`. Fix 1: PLAY_SECONDS 25→18 (pesawat sudah di atas puncak Bara di 25s). Fix 2: prop disc lebih redup di kokpit (0.05 + throttle×0.1) supaya tidak menutupi gunung. Fix 3: compass tape — heading digital pindah ke kotak sendiri (sebelumnya tabrakan dengan label N). Fix 4: salju 0xe8ecf2→0xdcd2c4 + ambang 0.75→0.82 (salju terlalu dominan di lereng atas). Verifikasi: play (kokpit) 19 calls / 8.030 tris, test 29/29. Dial menyala, ring + Bara di depan, laut + langit terbaca. Pixel-check: lereng Bara (218,142,103) tan hangat — bukan washout.

### M8.7 — DONE 27 Nov ~02:0x WIB (final)
Re-capture 4 shot, verifikasi scene-by-scene, JPEG q88 ≤256 KiB, dossier kebangun, test 29/29, commit + push. Stats akhir per shot (renderer.info, capture final deterministik — angka identik dengan capture sebelumnya): start 23 calls / 8.232 tris; play (kokpit) 19 / 8.030; landing 25 / 8.332; end 25 / 8.332. Semua <30 calls, <40k tris.

## M8-fix — DONE 27 Nov ~02:1x WIB (review 2-of-3 parent-verify + Gemini AGREE WITH FIXES)

Review: `~/workspace/makefun/best-flight-game/review-m8-gemini-2026-11-27.txt`.
Shot 1 CLEAR LOSS (panel tutupi volcano), shot 3 CLOSE LOSS (ekor "salib merah" + artefak
"salib kayu" kiri-bawah). Tier 1 wajib, Tier 2 bila <30 menit, Tier 3 dilarang.

### Diagnosis (probe proyeksi Node + three.js vendored, bukan tebak-tebak)
- "Salib kayu" kiri-bawah shot 3 = **ILS di (140,-2800)**, bukan windsock: mast top proyeksi
  (417,598), bar1 (335-500,612-617), pad (427,786) off-frame — mast cuma 35px di frame,
  terbaca sebagai salib melayang. Windsock (-220,-2400) justru di kanan-tengah (751-808,416-483)
  dan sudah terbaca benar sebagai sock oranye. Catatan: kamera chase menghadap utara (+z)
  membuat +x tampil di kiri layar (three.js right-handed) — itulah kenapa ILS (+x) di kiri.
- Probe juga membuktikan nudge kamera saja tidak bisa mengeluarkan ILS dari frame
  (butuh pitch +175, pesawat ikut keluar frame) dan tidak bisa menampilkan alasnya
  (alas di y≈786, mast 120ft di jarak 307ft terlalu tinggi untuk frame) — solusinya
  tarik mast ke ATAS frame (kamera lebih rendah) supaya mast terbaca penuh sebagai antena.

### Fix 1 (Tier 1) — shot 1 re-stage, 2 percobaan
- `game/index.html` CSS `body.shot-start #screen-title`: panel dock ke sepertiga kiri +
  veil gradient (gelap kiri → transparan kanan); `main.js` mode shot tambah class
  `shot-start` hanya bila `shotName === 'start'` (game normal tidak berubah).
- Percobaan 1: panel max-width 460 (berakhir x≈575) — volcano + laut + runway lolos,
  TAPI pesawat ~40% tertutup panel (ujung sayap kiri x≈405). Kriteria tertulis lolos,
  tapi cover dengan pesawat terpotong panel tetap cacat.
- Percobaan 2 (dipakai): panel max-width 300, padding-left 24, h1 28px — panel berakhir
  x≈370, pesawat utuh (sayap 520-880), volcano utuh (puncak + lava cap + ring emas +
  mercusuar di lereng kiri), laut glitter kanan, runway bawah-tengah, hangar utuh.
  Panel terbaca penuh, tidak terpotong tepi. **LOLOS.**

### Fix 2+3 (Tier 1+2, digabung) — shot 3 kamera chase
- `main.js` mode shot: `shotOrbit = shotName === 'landing' ? { yaw: 2, pitch: -80 } : { yaw: 0, pitch: 0 }`
  (hanya shot landing; shot 4/end tidak berubah, shot 1/2 tidak tersentuh).
- yaw 2° (three-quarter rear, sesuai spek 1-2°): taper fuselage cream + prop disc kini
  kelihatan di samping fin/tailplane — baca "salib merah" berkurang, bukan 100% hilang
  (fin + tailplane masih membentuk + sekilas, tapi kini berdimensi). **LOLOS (dengan catatan).**
- pitch -80 (kamera 22ft di bawah pesawat, nyaris sejajar): mast ILS naik ke y≈558,
  bar1 di 576-579, mast 75px di frame — terbaca sebagai antena mast, bukan glitch;
  bar2 (638) 5px di luar frame bawah, tidak kelihatan karena mast berlanjut ke tepi bawah.
  HUD tetap: ALT 241, SPD 91, HDG 357, HULL 100%. Runway tetap di depan. **LOLOS.**
- Stats shot 3: 25 calls / 8.332 tris (sama seperti M8.7 — orbit tidak tambah draw call).

### Fix 4 (Tier 2) — radar shot 3: DILEWATI (sudah terpenuhi)
Radar `hud.js` sudah menggambar blip: 2 cincin emas (ring 1+2) + panah pesawat putih
(keduanya kelihatan di PNG baru); blob pulau Bara tertutup cincin ring 1 di titik yang
sama. Radar tidak kosong — hanya kecil di JPEG. Tidak ada perubahan kode.

### Verifikasi akhir M8-fix
- Re-capture CDP shot 1 + 3, dibaca sendiri PNG-nya (start2 + landing), kriteria terima lolos.
- JPEG q88: 1-start.jpg 83 KiB, 3-landing.jpg 84 KiB (1280×633, ≤256 KiB).
- Dossier rebuild: 503.332 byte (naik dari 484.962 — screenshot baru lebih detail), 4 gambar, schema v1.
- Test 29/29 hijau. Kit check: 4 passed / 1 failed transcripts_present (urusan parent).
- Commit + push: `311c736` (local == remote, main). Server serve.ts dimatikan.
- TIDAK disentuh: world.js, economy.js, missions.js, ISLANDS, noise volcano, awan,
  geometri kokpit, shot 2-play, shot 4-end. Tidak ada draw call tambahan.

## M9 Detailing — DONE 27 Nov ~02:3x WIB (user: screenshot masih minimalis; arah "Detailin terrain + pesawat" + "HUD juga minimalis")

Skills (router step 0: three.js r187 vendored → threejs-scene-setup,
threejs-materials-lighting, threejs-geometry, game-ui-ux, game-feel,
performance-optimization — dikutip di header file yang diubah):
- threejs-geometry: lathe profile rings di batas tier + merged vertex-color
  parts pesawat (tanpa draw call baru); threejs-materials-lighting:
  vertex-color step + emissive lava cap + CanvasTexture radial prop disc;
  game-ui-ux: HUD chase edge-anchored (tape kiri/kanan, bar bawah-kiri,
  objective bawah-kanan, compass tape atas-tengah) supaya pesawat/runway/
  ring di tengah tetap bersih; game-feel: tape/bar adalah instrumen yang
  bergerak mengikuti penerbangan, bukan teks statis; performance-optimization:
  budget diukur per shot via renderer.info, 0 draw call WebGL baru (HUD
  murni DOM/canvas overlay).

### M9.1 Terrain (render.js + config.js, ISLANDS tidak berubah)
- `islandProfile`: ring tambahan tepat di batas tier (sand edge y=10 +
  batas 0.35/0.6/0.82 volcano, 0.35/0.7 city/green) via interpolasi pada
  garis profil lama — warna step jatuh di vertex (pita tegas), dan
  `islandSurfaceY` tidak berubah (titik sisipan segaris). Beach apron
  dilebarkan (1.10r/1.03r) + ambang pasir y<=8.
- `tierColor`: kontras tier dipertajam (rockDark 0x4a3423, rockMid baru
  0x7a4a28, rockLight 0xa88a5f, snow 0xefe9dc, sand 0xd8b47e,
  greenDeep 0x2a5c2e / greenBright 0x3f8a37); jitter dikecilkan
  (0.94–1.06) supaya pita, bukan noise, yang terbaca.
- Gully radial: wedge gelap per sudut (hash2 sudut, 0.88–1.08) di lereng
  saja (bukan beach/salju) — lereng terbaca terukir.
- Lava cap: 0.22r → 0.30r, emissive 1.6 → 2.4 (kawah kini terbaca jelas).
- Verifikasi shot 1: ring pasir pucat mengelilingi pulau, 4 zona terbaca
  (pasir / coklat gelap bawah / tan atas / puncak pucat + lava oranye),
  gully radial kelihatan. **LOLOS** (catatan: pita rockMid masih paling
  lembut — key light senja + ACES mengaburkan merah; 4 zona tetap terbaca).

### M9.2 Pesawat (render.js, merged mesh yang sama — 0 draw call baru)
- Fin oranye → cream + stripe oranye di atas; tailplane dipecah (tengah
  cream, ujung oranye); wingtip cream; canopy 0x1c2f4a → 0x0e1a2c
  (lebih gelap); prop disc pakai CanvasTexture radial (hub samar, rim
  terang) + opacity naik (chase 0.2+thr×0.35, kokpit 0.08+thr×0.12);
  nav light r 3 → 5; gear: kaki 2.5 → 3, roda r 5 → 6 (pusat y −6,
  dasar roda tetap −12 = menyentuh tanah).
- Registrasi/nomor ekor DILEWATI (tidak terbaca di 1280px dari 190 ft —
  sesuai izin brief).
- Verifikasi shot 3: salib merah pecah (fin cream, ujung sayap cream),
  lampu nav merah/hijau kelihatan di ujung sayap, prop disc halo putih
  terbaca. Shot 2 kokpit: dial + hidung tidak berubah. **LOLOS.**

### M9.3 HUD (hud.js + index.html + main.js, 0 draw call WebGL baru)
- Tape kecepatan kiri (0–200 kts, window ±60) + tape ketinggian kanan
  (0–5000 ft, window ±1000) — canvas 72×320, nilai di kotak amber.
- Compass tape chase (canvas 560×36, atas-tengah, pakai drawCompassTape
  yang sama dengan kokpit); `body.chase` di main.js (shot + loop normal);
  `body.cockpit` menyembunyikan semua elemen chase (dial kokpit utuh).
- Bar THR/FUEL/HULL bawah-kiri (DOM, merah bila rendah) + panel
  objective bawah-kanan (judul misi, Cincin x/3, timer, DAY · KR).
  Timer dari state nyata (`world.time - run.startedAt`, sisa bila
  timeLimit storm); `updateHud(world, econ, missionText, extra)` dengan
  `extra` opsional; `formatClock` diekspor + test baru
  `tests/hud.test.js` (2 test).
- Verifikasi shot 3: tape SPD 91 / ALT 241, compass 357°, bar THR 59% /
  FUEL 98% / HULL 100%, objective "Ring Run — Latihan Cincin, Cincin 0/3,
  Waktu 00:00, DAY 1 · KR 0" — semua nilai benar, tidak menutupi pesawat/
  runway/ring. **LOLOS.**

### Verifikasi akhir M9
- Re-capture CDP keempat shot (2 run, angka identik = deterministik):
  start 23 calls / 8.856 tris; play (kokpit) 19 / 8.654; landing 25 /
  8.956; end 25 / 8.956 — semua <30 calls, <40k tris.
- JPEG q88: 1-start 87 KiB, 2-play 92 KiB, 3-landing 106 KiB, 4-end
  64 KiB (1280×633, ≤256 KiB). Dossier rebuild: 551.722 byte, 4 gambar,
  schema v1.
- Test 31/31 hijau (29 lama + 2 hud baru). Kit check: 4 passed /
  1 failed transcripts_present (urusan parent).
- Commit + push: `M9` (local == remote, main). Server serve.ts dimatikan.
- TIDAK disentuh: world.js, economy.js, missions.js, ISLANDS, awan,
  langit, laut, panel title/debrief, staging shot (posisi/kamera tetap).
- Catatan jujur: (1) salib kayu ILS kiri-bawah shot 3/4 masih ada
  (sisa M8-fix, di luar scope M9) — kini terbaca sebagai struktur tanah,
  bukan glitch melayang; (2) pita rockMid paling lembut dari 4 zona;
  (3) prop disc halo putih di shot 1/3 cukup dominan, tapi terbaca
  sebagai putaran baling-baling.

## M9-fix — DONE 27 Nov ~02:35 WIB (review 2-of-3 Gemini AGREE WITH FIXES)

### Fix 1 (Rank 1, MUST) — Prop disc (render.js)
- `propTexture()`: gradient dibalik — rim terang 0.75 → transparan 0.0,
  puncak mid-disc 0.25 (0.06 hub / 0.25 @0.5 / 0.0 rim). Rim terang
  adalah penyebab disc terbaca sebagai lingkaran putih solid.
- `updateScene`: chase `0.2 + thr×0.35` (maks 0.55) → `0.15 + thr×0.13`
  (maks 0.28, sesuai rentang Gemini 0.20–0.28); kokpit tetap
  `0.08 + thr×0.12` (maks 0.20, sudah dalam rentang). Opacity awal
  material 0.3 → 0.25.
- Verifikasi shot 1/3: disc kini smudge putih samar di hidung pesawat,
  livery cream/oranye + nav light merah/hijau terbaca jelas. **LOLOS.**

### Fix 2 (Rank 2) — ILS kiri-bawah shot 3/4 (main.js shotOrbit)
- Diagnosis dulu via probe proyeksi Node + three.js vendored (bukan
  tebak): Y+2 menggeser bar2 cuma ~2 px (no-op — sesuai dugaan),
  pitch −60 (kamera +20) juga tidak membantu; zoom+40 mengangkat bar2
  ~35 px ke dalam frame. Pad ILS tidak pernah bisa masuk frame tanpa
  perubahan kamera drastis (proyeksi y 711–834 vs frame 633) — jadi
  targetnya "mast + kedua bar terbaca utuh sebagai antena tanah",
  bukan "pad kelihatan".
- Percobaan 1 (langsung dipakai): landing `{ yaw: 2, pitch: -80,
  zoom: 40 }`, end `{ yaw: 0, pitch: 0, zoom: 40 }` — end juga
  karena cross yang sama kelihatan di shot 4 (kamera straight chase).
- Verifikasi shot 3/4: mast + bar1 + bar2 SEMUA dalam frame, mast
  berlanjut ke tepi bawah seperti tiang yang berdiri di tanah —
  terbaca sebagai struktur antena tanah, bukan glitch melayang.
  Pesawat sedikit lebih kecil (pull-back 40 ft) tapi tetap hero;
  runway + HUD shot 3 utuh (ALT 241 / SPD 91 / HDG 357 / HULL 100%).
  **LOLOS** (catatan jujur: mast tetap terpotong tepi bawah karena
  pad di luar frame — itu cara tiang tinggi dekat kamera terbaca,
  bukan glitch; menghilangkan total butuh geser landmark, di luar
  scope fix ini).
- Rank 3 Gemini (kontras lereng volcano) DILEWATI sesuai instruksi —
  risiko regresi pencahayaan global.

### Verifikasi akhir M9-fix
- Re-capture CDP shot 1/3/4 (shot 2 tidak berubah, tidak di-capture):
  start 23 calls / 8.856 tris; landing 25 / 8.956; end 25 / 8.956 —
  semua <30 calls, <40k tris.
- JPEG q88: 1-start 87 KiB, 3-landing 104 KiB, 4-end 63 KiB
  (1280×633, ≤256 KiB). Dossier rebuild: 549.671 byte, 4 gambar,
  schema v1.
- Test 31/31 hijau. Kit check di commit baru: 4 passed /
  1 failed transcripts_present (urusan parent).
- Commit + push: `ada7f05` (local == remote, main). Server serve.ts
  dimatikan.
- TIDAK disentuh: world.js, economy.js, missions.js, ISLANDS, awan,
  langit, laut, HUD, dial kokpit, panel title/debrief, pencahayaan
  global, staging penerbangan.
