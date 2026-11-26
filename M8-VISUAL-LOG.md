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

## M10 Polish Total — DONE 27 Nov ~02:5x WIB (user: gunung, runway,
## visual lainnya masih kasar; arah "Polish total" + pesawat siluman +
## HUD siluman; riset referensi dulu)

Skills (router step 0: three.js r187 vendored → threejs-scene-setup,
threejs-materials-lighting, threejs-geometry, performance-optimization,
game-feel — dikutip di header render.js/hud.js):
- threejs-geometry: lathe 28→48 segmen, blend rings di batas tier,
  swept wing + V-tail dari box ter-rotasi, foam RingGeometry;
- threejs-materials-lighting: vertex-color tier blend, CanvasTexture
  (asphalt, soft cloud, exhaust glow), emissive lava (tetap);
- performance-optimization: budget diukur per shot via renderer.info
  (2 run CDP, angka identik = deterministik); +2 draw call total
  (marking runway + foam), 0 call baru untuk HUD (DOM/canvas overlay);
- game-feel: pitch ladder + FPM + gun cross sebagai juice instrumen
  kokpit; exhaust glow tumbuh dengan throttle.

### Riset referensi (~10 menit, sebelum desain M10.5/M10.6)
- Ace Combat 7 (acecombat.fandom.com/wiki/Ace_Combat_7:_Skies_Unknown/
  Aircraft; FB-22 Strike Raptor): F-22A Raptor (stealth, twin tails,
  air-superiority gray), F-35C, YF-23 Black Widow II, FB-22 (delta
  wings, longer fuselage, twin engines, stealth body, skins: air
  superiority gray, Razgriz black + red tail tips).
- Project Wingman (projectwingman.fandom.com/wiki/ACG-01_Chimera;
  nexusmods FA-23/YF-23): Chimera "dark gray body with white leading
  edges"; PW-Mk.1 "Oh, and don't forget the color ORANGE"; SP-34R
  variable wing; F/A-23 "pure stealth, refined aerodynamics".
- DCS World (digitalcombatsimulator.com MiG-29 manual; Hoggit F/A-18
  wiki; Falcon 4 HUD guide web.deu.edu.tr): HUD symbology — flight
  path marker / velocity vector (circle + wings + dot), pitch ladder
  5° steps (solid above horizon, dashed below, 0° longest), gun cross
  (nose reference), heading tape top, airspeed left, altitude right,
  bank scale; primary colour GREEN (F/A-18 DDIs, Falcon 4).
- Diadopsi: V-tail canted + swept trapezoidal wings + blended body
  (F-22/YF-23/FB-22), dark-grey livery + thin orange accents (Chimera
  + PW-Mk.1 orange), twin exhaust glow; HUD hijau klasik + pitch
  ladder/FPM/gun cross + framing angular. Semua geometri/tekstur
  buatan sendiri di repo — tidak ada aset game yang diunduh.

### M10.1 Gunung (render.js, ISLANDS tidak berubah)
- Lathe 28 → 48 segmen; tierColor di-refactor (tierHex murni) + blend
  ±0.04 di tiap batas tier (lerp 0.5 ke warna tetangga); blend rings
  b±0.04 disisipkan di islandProfile (segaris profil lama, jadi
  islandSurfaceY tidak berubah).
- Verifikasi shot 1: lereng halus (facet tidak mencolok), 4 zona tetap
  terbaca (pasir / coklat gelap / tan / puncak pucat + lava). Shot 3:
  zona lebih samar dari jarak landing (sudut + jarak), tapi puncak +
  sand ring terbaca. **LOLOS.**

### M10.2 Runway (render.js, koordinat RUNWAY z0 −3000 / z1 0 tetap)
- asphaltTexture(): speckle seeded + twin tyre streaks (repeat 1×10);
  marking merged 1 call: edge lines (x ±96), threshold bars 8× di
  kedua ujung (z −2920/−80), touchdown-zone pairs (z −2400/−2000).
- Verifikasi shot 3: edge lines + threshold + dashes terbaca sebagai
  landasan sungguhan; shot 1: threshold kelihatan di bawah panel.
  **LOLOS.**

### M10.3 Awan (render.js, 1 InstancedMesh tetap)
- cloudTexture() radial falloff (soft edge); 18 → 28: low band 18
  (layout lama) + high band 6 (y 5000–5500, lebih kecil/redup 0.7) +
  4 multi-lobe companions menempel di awan low-band.
- Verifikasi shot 1/2/3: langit berlapis, awan blob lembut, bukan
  potongan kertas. **LOLOS.**

### M10.4 Laut (render.js, warna dasar dusk tetap)
- Sea texture diperkaya: 12 warm patch besar (sun-path) + 8 dark swell
  besar; foam ring di waterline tiap pulau (RingGeometry 1.02–1.13r,
  opacity 0.35, 1 call merged).
- Verifikasi shot 1/3: laut punya kedalaman/tektur, foam ring
  kelihatan di garis pantai Bara. **LOLOS.**

### M10.5 Pesawat siluman (render.js, 3 call tetap)
- Fuselage ConeGeometry 12 segmen (halus) charcoal; spine stripe
  oranye tipis (2.5); canopy 0x0a0f16; sayap swept-back (box 62
  rotasi ±0.29 rad, span ~120); wingtip oranye; V-tail fin canted
  (tanpa fin tegak / tailplane — salib merah hilang by construction);
  nozzle kembar gelap; prop disc DIGANTI exhaust glow disc oranye
  (r 15, opacity 0.25+thr×0.35, di ekor menghadap belakang).
- Percobaan 1: charcoal 0x2e3238 + cant 35° + nozzle r5/6 + glow r18
  — GAGAL: pesawat terbaca sebagai "laba-laba hitam" (nozzle jadi 2
  lubang hitam dominan, fin menyebar, fuselage hilang lawan volcano).
- Percobaan 2 (dipakai): livery 0x4b5158 (F-22 air-superiority gray),
  cant 28° (0.49 rad, fin 18), nozzle r3.5/4.5, glow r15 redup,
  trailing-edge strip oranye 2 ft di tepi atas sayap (bukan full-height
  — percobaan 1.5: strip 4.5 menutupi seluruh tepi sayap jadi bar
  oranye dominan).
- Verifikasi shot 1/3: jet gelap sleek dengan aksen oranye, sayap
  swept, V-tail, exhaust glow, tanpa baling-baling, tanpa salib merah;
  kontras lawan langit senja + volcano terjaga. Shot 2 kokpit: hidung
  tetap terbaca (runcing, stripe oranye di tengah). **LOLOS** (catatan
  jujur: buritan fuselage agak "blob" karena tutup dasar cone menghadap
  kamera + kena key light hangat — terbaca sebagai badan pesawat,
  bukan glitch; glow ekor masih cukup terang di tengah).

### M10.6 HUD siluman (hud.js + index.html, 0 draw call WebGL baru)
- Warna diputuskan HIJAU taktis (#3dff7a, DCS/Falcon 4 klasik —
  kontras tertinggi lawan langit senja oranye; emas dipertahankan di
  panel menu, bukan HUD): AMBER → GREEN di semua canvas (tape,
  compass, radar bg hijau gelap, dial), CSS HUD (top-left, radar,
  tapes, bars, objective, bottom-center, toast, cockpit-panel)
  border hijau + radius 0 + chamfer clip-path (sudut terpotong).
- Dial kokpit: bezel oktagonal hijau (MFD-style); center HUD baru
  (#hud-center canvas 640×360, cockpit only): pitch ladder 5° (solid
  di atas horizon, dashed di bawah, label ±10/±20), flight-path
  marker (lingkaran + sayap + dot), gun cross — digerakkan pitch/roll
  nyata dari world.plane.
- Verifikasi shot 2: ladder + FPM + gun cross hijau terbaca, dial
  90/1661/−54/359/95% utuh; shot 3: semua nilai benar (ALT 241, SPD
  91, HDG 357, HULL 100%), tidak ada elemen menutupi pesawat/runway/
  ring. **LOLOS.** (Satu bug tertangkap sebelum capture: updateCockpit
  sempat memanggil el('hud-center') — div, bukan canvas — diperbaiki
  ke 'hud-center-canvas' sebelum capture pertama.)

### Verifikasi akhir M10
- Re-capture CDP keempat shot (2 run, angka identik = deterministik):
  start 25 calls / 12.980 tris; play (kokpit) 19 / 12.494; landing
  27 / 13.080; end 27 / 13.080 — semua <30 calls, <40k tris (+2 call
  vs M9: marking runway + foam; tris +~4k dari lathe 48 + awan 28).
- JPEG q88: 1-start 85 KiB, 2-play 98 KiB, 3-landing 107 KiB,
  4-end 65 KiB (1280×633, ≤256 KiB). Dossier rebuild: 575.111 byte,
  4 gambar, schema v1.
- Test 31/31 hijau. Kit check: 4 passed / 1 failed
  transcripts_present (urusan parent).
- Commit + push: `M10` (local == remote, main). Server serve.ts
  dimatikan.
- TIDAK disentuh: world.js, economy.js, missions.js, ISLANDS, staging
  shot, kamera, flight model, nilai HUD, logika HUD, panel title/
  debrief, pencahayaan global.
- Catatan jujur: (1) salib kayu ILS kiri-bawah shot 3/4 masih ada
  (sisa M8-fix) — terbaca sebagai struktur tanah; (2) zona tier
  volcano paling samar dari jarak landing; (3) buritan fuselage agak
  blob + glow ekor masih terang (lihat M10.5).

## M10-fix — DONE 27 Nov ~03:0x WIB (review 2-of-3 parent + Gemini
## AGREE WITH FIXES; Rank 1 exhaust glow, Rank 2 ILS verifikasi)

### Fix 1 — Exhaust glow "bola ping-pong putih" (render.js): LOLOS,
### 2 percobaan, root cause bukan cuma disc-nya
- Percobaan 1 (tidak cukup): satu disc r15 NormalBlending → DUA disc
  kecil r7.5 tepat di belakang nozzle kembar (±7, z −50), material
  AdditiveBlending (depthWrite false, transparent, opacity 0.2+thr×0.3,
  maks 0.5), tekstur core dilunakkan (0.95→0.9). Hasil: bola mengecil
  tapi TIDAK hilang — zoom 4x ke ekor membuktikan penyebab utamanya
  BUKAN glow disc, melainkan lampu nav ekor putih (SphereGeometry r5
  unlit di (0,2,−44), tepat di tengah buritan, celah di antara kedua
  disc) yang bersinar menembus disc.
- Percobaan 2 (dipakai): lampu nav ekor r5 → r2.5 (komentar di kode
  menjelaskan alasannya). Hasil: bola putih HILANG — yang tersisa titik
  putih kecil di tengah buritan yang terbaca sebagai tail position
  light (realistis), diapit dua nozzle gelap + halo oranye samar.
  Shot 1 & 3: V-tail + livery tetap terbaca, HUD shot 3 utuh
  (ALT 241 / SPD 91 / HDG 357 / HULL 100%).
- Biaya: +1 draw call (2 mesh glow). Stats capture final: start 26
  calls / 12.992 tris; landing 28 / 13.092 — semua <30 calls, <40k
  tris. Jujur: halo oranye kini samar di throttle staging (59%) —
  bukan afterburner menyala-nyala, tapi wajar untuk jet siluman di
  cruise; yang penting disonansi "bola putih" sudah hilang.

### Fix 2 — ILS "H" coklat pojok kiri-bawah shot 3/4: DIVERIFIKASI,
### TIDAK DIUBAH
- Cek kode + capture baru: ILS itu world-space murni (render.js:
  pad 40×6×40 di y 0–6 + mast 120 + bar1/bar2, posisi (140,−2800),
  alas di y=0 menyambung terrain). Di frame shot 3, mast berlanjut
  utuh sampai tepi bawah frame tanpa celah melayang — terbaca sebagai
  antena tanah yang alasnya di luar frame bawah, bukan glitch.
  Sesuai instruksi: tidak ada perubahan. Shot 4 tidak di-capture
  ulang (tidak ada yang berubah di sana).

### Verifikasi akhir M10-fix
- Re-capture CDP shot 1 + 3 (angka deterministik, 2 run identik di
  M10; capture fix 26/28 calls): JPEG q88 1-start 85 KiB,
  3-landing 107 KiB (1280×633, ≤256 KiB). Dossier rebuild: 575.981
  byte, 4 gambar, schema v1. Test 31/31 hijau. Kit check: 4 passed /
  1 failed transcripts_present (urusan parent).
- Commit + push: `M10-fix` (local == remote, main). Server serve.ts
  dimatikan.
- TIDAK disentuh: world.js, economy.js, missions.js, ISLANDS, staging
  shot, kamera, flight model, nilai HUD, logika HUD, panel title/
  debrief, pencahayaan global, smoothing fuselage, kontras tier
  volcano (Rank 3 Gemini: dilewati).

## M11 Natural Volcano — DONE 27 Nov ~04:0x WIB (user: bentuk gunung
## aneh — kerucut simetris sempurna, puncak rata, alas lingkaran
## sempurna; arah "Naturalin gunung: asimetris + kawah + ridge")

Skills (router step 0: three.js r187 vendored → threejs-geometry,
threejs-materials-lighting, threejs-scene-setup,
performance-optimization — dikutip di header render.js):
- threejs-geometry: LatheGeometry profile dengan puncak kawah (lipatan
  profil), displacment vertex per-sudut pasca-lathe, computeVertexNormals
  ulang; segment count tetap 48 (cukup untuk modulasi low-freq).
- threejs-materials-lighting: vertex-color lava flow + crater interior,
  emissive lava pool (2.4, sama seperti lava cap lama).
- threejs-scene-setup: renderer/loop tidak berubah; verifikasi via CDP
  real-time seperti M8-M10.
- performance-optimization: budget diukur per shot via renderer.info
  (2 run CDP M10 sudah membuktikan determinisme; capture M11 1 run +
  angka-angka konsisten dengan baseline); +0 draw call, +~300 tris.

### Keputusan desain (didokumentasikan — penting)
- **HANYA volcano yang diubah** (kind === 'volcano'). City/green
  byte-identical. Alasan, diverifikasi via grep: `islandSurfaceY`
  satu-satunya konsumen adalah penempatan palem di pulau hijau
  (render.js:515/536); desa Tanjung duduk di y tetap; world.js TIDAK
  memakai tinggi terrain sama sekali (ground = y=0, tanpa collision
  pulau). Modulasi radius pulau hijau/kota akan membuat palem
  melayang/tenggelam dan rumah desa mengambang/terkubur — risiko tanpa
  manfaat visual (keduanya background jauh). Modulasi volcano tidak
  butuh sinkronisasi `islandSurfaceY` karena tidak ada yang menanyakan
  permukaan Bara. (Brief mengizinkan pembatasan ini bila sinkronisasi
  penuh terlalu berisiko; di sini pembatasan justru menghilangkan
  kebutuhan sinkronisasi.)
- **Modulasi radius per sudut**: `volcanoAngleMod(island, a)` =
  1 + 0.08·cos(a−0.3) + 0.04·sin(2a+p2) + 0.03·sin(3a+p3), p2/p3
  seeded hash2 dari posisi pulau. Suku cos tetap MENJAMIN asimetri
  timur-barat dari kamera depan (shot 1 menghadap utara): diprobe di
  node SEBELUM coding — mod(0)=1.085, mod(π)=0.946 (selisih 0.140),
  rentang 0.894..1.124 (dalam panduan ±15%). Diterapkan dengan fade
  smoothstep 0.08h→0.30h supaya beach ring + foam ring tetap
  lingkaran sempurna dan mercusuar tetap di pasir.
- **Kawah**: profil lathe puncak diubah dari titik (0,h) menjadi
  rim (0.20r, h) → dinding dalam (0.14r, 0.93h) → lantai (0, 0.92h).
  Tinggi maksimum TETAP h (rim crest di 1.00h). `islandSurfaceY`
  tetap benar pada profil ini (d-lookup menemukan segmen dinding
  dalam untuk d ∈ [0.14r, 0.20r] dan lantai di bawahnya).
  Notch di sisi selatan (a=−π/2, menghadap runway/kamera shot 1):
  rim turun ~0.08h di sana supaya kawah + lava terbaca dari depan,
  bukan hanya dari atas. Lantai kawah ikut miring dengan notch.
- **Lava**: cone cap M9 DIGANTI lava pool disc (r 0.12r di y=0.925h,
  emissive 2.4, 1 draw call — sama seperti cone) + lava flow
  vertex-color di sisi selatan (0 draw call): lidah oranye dari
  notch turun ke 0.5h, lebar bergelombang ±0.13 rad — lava dari
  depan (shot 1/3), pool dari atas (shot 2).
- **Ridge**: envelope low-freq sin(3a+phase) pada gully M9 — ada
  sektor yang terukir dalam, ada yang hampir halus; broad wedge
  (freq 3) + variasi halus M9. Hanya volcano.

### M11.1 Asimetris — LOLOS (percobaan 1)
Shot 1: siluet jelas tidak lagi segitiga simetris — flank timur
lebih lebar/landai, barat lebih curam, puncak off-center; alas
tetap lingkaran (foam ring menempel). Shot 3: puncak off-center
dengan notch terbaca. **LOLOS.**

### M11.2 Kawah — LOLOS (percobaan 1)
Shot 2 (kokpit, dari atas): mangkuk kawah + lava oranye menyala di
puncak terbaca jelas, flow turun ke arah kamera. Shot 1/3 (depan):
notch di siluet puncak + lava flow oranye terang dari puncak ke
mid-slope — terbaca sebagai kawah + lava, bukan meja datar. Ring
emas tetap di atas puncak. Catatan jujur: pool lava-nya sendiri
tidak terlihat langsung dari sudut rendah shot 1 (sudah diduga —
pool menghadap ke atas); yang terbaca dari depan adalah notch +
flow. **LOLOS.**

### M11.3 Ridge — LOLOS (percobaan 1)
Shot 1: flank kiri menunjukkan wedge gelap tidak beraturan yang
dalam, flank kanan lebih halus — bukan garis-garis seragam; 4 zona
tier tetap terbaca (pasir / coklat gelap / tan / puncak pucat +
lava). Shot 3: tekstur lereng terbaca dari jarak landing. **LOLOS.**

### Verifikasi akhir M11
- Re-capture CDP keempat shot: start 26 calls / 13.280 tris; play
  (kokpit) 19 / 12.782; landing 28 / 13.380; end 28 / 13.380 —
  semua <30 calls, <40k tris (+~300 tris vs M10-fix: cincin profil
  kawah; +0 draw call — pool menggantikan cone 1:1, flow vertex
  color 0 call).
- JPEG q88: 1-start 86 KiB, 2-play 98 KiB, 3-landing 107 KiB,
  4-end 65 KiB (1280×633, ≤256 KiB). Dossier rebuild: 581.124
  byte, 4 gambar, schema v1.
- Test 31/31 hijau. Kit check: 4 passed / 1 failed
  transcripts_present (urusan parent).
- PNG: /tmp/nusa-m11-{start,play,landing,end}.png.
- TIDAK disentuh: world.js, economy.js, missions.js, ISLANDS
  (x/z/radius/height), staging shot, kamera, flight model, nilai
  HUD, logika HUD, pesawat siluman, panel title/debrief,
  pencahayaan global, landmark, awan, laut.
- Catatan jujur: (1) pool lava mengambang maks ~44 ft di atas
  lantai kawah sisi selatan (lantai ikut miring dengan notch,
  pool tetap datar) — tidak terlihat di screenshot manapun
  (celah tersembunyi di balik dinding kawah); (2) flow lava agak
  lebar/blobby di dekat puncak shot 1 — terbaca sebagai aliran
  lava, bukan artefak; (3) tidak ada unit test baru — logika murni
  (volcanoAngleMod) hidup di render.js yang mengimpor 'three'
  (tidak bisa di-resolve node --test tanpa node_modules; repo ini
  tidak punya node_modules); verifikasi numerik diganti probe node
  (mod(0)/mod(π)/rentang di atas) + screenshot.
- Commit + push: `M11` (local == remote, main). Server serve.ts
  dimatikan.

---

## M12-fix — QA bug fixes (K1/K2/K3 P0 + S1/S2/M3 P1)

QA M12 (live playthrough + baca kode, review 2-of-3 parent + Gemini
AGREE WITH FIXES) menemukan 3 kritis + 3 sedang/minor. Scope yang
dikerjakan: P0+P1 saja (pilihan user). TIDAK disentuh: S3 (terrain
collision — by design arcade), S4, M1/M2/M4, kerapian kode N1–N6,
refactor apa pun.

### K1 — Ring 3 terkubur di Hijau — LOLOS
Probe node SEBELUM (replikasi islandProfile + islandSurfaceY, tanpa
three): ring 1 CLEAR (bottom 1550 ft vs terrain maks 1294,8 ft,
clearance 255,2 ft); ring 2 CLEAR (bottom 750 vs 220, clearance
530 ft); ring 3 BURIED 350 ft (bottom 550 vs terrain maks 900 di
pusat pulau; di tepi ring 872 ft vs puncak ring 850 ft). Fix 1 baris
(world.js:28): ring 3 y 700 -> 1150. Probe SESUDAH: bottom 1000 ft
vs terrain maks 900 ft -> clearance 100 ft, CLEAR. Test invariant
baru (tests/world.test.js, 32 test total): tiap ring harus clear dari
puncak pulau yang ditumpanginya (ring bottom > island height) —
test ini GAGAL pada y=700 lama. Verifikasi live: cincin emas terbaca
jelas di langit di atas puncak Hijau (/tmp/m12f2-k1-ring3.png).

### K2 — Fuel habis = soft-lock — LOLOS (live)
Guard baru di loop main.js (bukan di missions.js — sengaja, supaya
menangkap juga kasus complete-but-stuck): bila fuel <= 0 && speed
< 1 && !airborne && !landed && !crashed -> endDay(false) lewat jalur
yang sudah ada. Pesawat yang masih meluncur TIDAK di-fail — guard
hanya saat sudah berhenti di tanah. Mencakup juga precision sesudah
pickup (missions.js:46 hanya fail bila !pickedUp — sengaja TIDAK
diubah: fail langsung saat fuel 0 akan membunuh glide yang sah ke
runway). Verifikasi live: injeksi fuel=0,5 sesudah takeoff -> debrief
"DAY OVER / Misi gagal — bahan bakar habis atau waktu habis."
muncul; state akhir x=62, y=0, z=-985, spd=1, fuel=0, hull=84,8,
airborne=false, landed=false, crashed=false
(/tmp/m12f-k2-debrief.png). Sebelum fix, state yang sama diam 100
detik tanpa debrief (QA M12).

### K3 — Pause resume mati + "R" fiktif — LOLOS (live)
(a) main.js: restruktur sync layar/pause — `screen==='play' &&
isPaused()` -> pause; `screen==='pause' && !isPaused()` -> play.
Cabang else-if lama tidak pernah tercapai (kondisi pertama selalu
benar saat pause). (b) input.js: guard `!e.repeat` pada toggle P/C
(tahan tombol tidak lagi spam-toggle). (c) index.html:126: teks "R
to restart the day" dihapus (tidak ada handler R; lebih aman daripada
implementasi restart jelang cutoff). Verifikasi live: P di title ->
misi dibuka di layar pause; P -> kembali ke play; P lagi -> pause;
Esc -> play; tombol RESUME tetap bekerja
(/tmp/m12f-k3-pause-open.png, /tmp/m12f-k3-resumed.png).

### S1 — saveBest sebelum reward — LOLOS (live)
saveBest() dipindah dari baris pertama endDay ke SESUDAH rantai
if/else (sesudah addReward + applyLanding). Verifikasi live:
landing lembut day-1 (semua cincin) -> "DELIVERY COMPLETE, +120 KR
misi, +100 KR landing. Landing Rank S · Courier PERAK · Total KR
220"; localStorage nusa-best = {"rank":"PERAK","kr":220} — sama
persis dengan total debrief (sebelum fix: kr 0).
(/tmp/m12f2-s1-debrief.png.)

### S2 — Desa Tanjung terkubur/terbalik — LOLOS (live)
(a) render.js:571: modulo dibungkus `(((v%5)+5)%5)` — % JS
bertanda negatif membuat 4 rumah h negatif (terbalik); kini h
selalu 120..360. (b) Rumah ditanam ON the slope via
islandSurfaceY (seperti palem): body center y = surfaceY + h/2,
atap y = surfaceY + h + 35. Verifikasi live: ~20+ rumah berbadan
cream/tan + atap merah terbaca berteras di lereng Tanjung
(/tmp/m12f2-s2-village.png), bandingkan QA M12 yang hanya melihat
~7 atap.

### M3 — Favicon 404 — LOLOS (live)
`<link rel="icon" href="data:,">` di <head> index.html. Probe
Network sepanjang sesi live: 0 failed resources, 0 failed network
events (sebelumnya 2x console 404).

### Temuan sampingan (bukan bug, dicatat jujur)
- Skenario S1 putaran pertama GAGAL BUKAN karena kode: teleport
  final approach tanpa throttle membuat sink rate tumbuh melewati
  batas gentle (|vs| > 8) saat speed decay -> hard touchdown
  (hull 95), pesawat berhenti di tanah dengan fuel 99% — BUKAN
  soft-lock: pemain bisa takeoff lagi (terbukti live: Shift+S ->
  airborne lagi, alt 63, spd 114). S1 diulang dengan refresh
  vs/speed berkala -> landing lembut, LOLOS.
- Driver verifikasi putaran pertama juga punya bug sendiri: `const
  w` dideklarasi 3x di global scope Runtime.evaluate -> S2/K1
  teleport putaran pertama melempar SyntaxError (screenshot
  menunjukkan pesawat diam di runway day 3). Putaran kedua tanpa
  `const` -> LOLOS.

### Verifikasi akhir M12-fix
- Test 32/32 hijau (31 lama + 1 invariant K1 baru).
- Re-capture CDP keempat shot: start 26 calls / 13.280 tris; play
  (kokpit) 19 / 12.782; landing 28 / 13.380; end 28 / 13.380 —
  identik M11 (+0 call, +0 tris; shot 1 PNG sha256 dd6a7864…
  sama persis dengan M11 — determinisme utuh). Dibaca sendiri:
  tidak ada regresi visual.
- JPEG q88: 1-start 83 KiB, 2-play 95 KiB, 3-landing 104 KiB,
  4-end 62 KiB (1280×633, ≤256 KiB). Dossier rebuild: 583.447
  byte, 4 gambar, schema v1.
- Kit check: 4 passed / 1 failed transcripts_present (urusan
  parent).
- PNG: /tmp/nusa-m12f-{start,play,landing,end}.png; bukti live:
  /tmp/m12f-{k3-pause-open,k3-resumed,k2-debrief}.png,
  /tmp/m12f2-{s1-debrief,s2-village,k1-ring3,bonus-hard-touchdown,bonus-airborne-again}.png.
- File diubah (6): game/src/world.js (K1), game/src/main.js
  (K2, K3a, S1), game/src/input.js (K3b), game/index.html (K3c,
  M3), game/src/render.js (S2), tests/world.test.js (invariant
  K1). TIDAK disentuh: economy.js, missions.js, shots.js, hud.js,
  audio.js, config.js, ISLANDS, staging shot, kamera, flight
  model, nilai/logika HUD, pesawat siluman, panel title/debrief,
  pencahayaan global, landmark lain, awan, laut.

## M12-clean — kerapian kode (N1–N6), 27 Nov 2026 ~05:07–05:30 WIB

Refactor murni: tidak ada nilai gameplay/visual yang berubah. Bukti
utama: keempat shot PNG hasil re-capture byte-identik dengan baseline
M12-fix (sha256 start dd6a7864…, play 4898cecf…, landing 974d2bb2…,
end 9e497927…), draw calls/tris identik (26/13280, 19/12782,
28/13380, 28/13380), JPEG repo byte-identik.

- N1: helper murni render.js -> game/src/terrain.js baru (hash2,
  smoothstep, volcanoAngleMod, lavaFlowMask, tierHex, tierColor,
  tierBounds, islandProfileData, islandSurfaceY). render.js tinggal
  wrapper tipis islandProfile() (Vector2 untuk LatheGeometry) +
  4 scratch Color. tierColor menerima scratch `blend` sebagai
  parameter supaya terrain.js tetap THREE-free. render.js 1113 ->
  951 baris.
- N2: angka tuning -> config.js (FLIGHT, SHOTS, INPUT, HUD_TUNING,
  LANDING_POINTS). Nilai tidak berubah — hanya nama yang pindah
  (world.js 23 substitusi, shots.js 10, input.js 6, hud.js 13,
  economy.js 3; test hijau sesudah tiap kelompok).
- N3 (dead code, grep-verified): CRUISE_SPEED, PERF.captureDpr,
  12 entri PALETTE (sea, seaDeep, seaGlint, planeCream, hudAmber,
  cityGrey, cityLight, canopyDark, hangarDoor, rockBara,
  greenHijau, runway) dihapus. lighthouseWhite/lighthouseRed/
  hudGreen TIDAK dihapus — jadi hidup di N4 (lihat bawah).
  UPGRADES/buyUpgrade + field `upgrades` dihapus bersama 2
  test-nya; world.mission dihapus bersama opsi `mission` di
  createWorld (rings selalu dibuat — ketiga misi butuh cincin
  yang sama).
- N4: clamp + DEG -> game/src/util.js baru (satu copy; dulu
  clamp di world.js + shots.js, DEG di world.js + render.js).
  Ring x/z diturunkan dari ISLANDS (world.js) — akar K1 ditutup.
  stripeTexture pakai PALETTE.lighthouseWhite/Red (nilai sama
  persis dengan literal lama); hud.js GREEN dari
  PALETTE.hudGreen (literal #3dff7a di drawRadar dihapus); CSS
  index.html pakai :root vars --hud-green/--hud-green-rgb/--gold
  (6x literal hijau + 7x rgba + 3x emas disatukan). Warna
  hardcoded yang nilainya BEDA dari palette (canopy 0x0a0f16,
  hangar door 0x6a7a8a, laut #2a7ba8) dibiarkan literal dan
  entri palettenya dihapus — satu sumber per warna.
- N5: createWorld({mission:'ring'}) di-hardcode dihapus dari
  main.js (2x) + shots.js; endDay(true) staged di main.js:177
  -> endDay(false) + komentar jujur (argumen diabaikan karena
  run complete — cabang DELIVERY COMPLETE sama saja);
  view.exhaust -> view.exhaustDisc (satu disc, material bersama
  kedua disc); komentar volcanoAngleMod "Exported for the unit
  test" kini benar (tests/terrain.test.js); islandSurfaceY
  sengaja TIDAK disinkronkan dengan modulasi M11 — satu-satunya
  konsumennya desa (city) + palem (green), modulasinya
  volcano-only by design, jadi nilainya sudah exact.
- N6: test baru — tests/terrain.test.js (9 test: hash2,
  smoothstep, volcanoAngleMod range + east-west, lavaFlowMask,
  tierHex, tierBounds, islandProfileData, islandSurfaceY di
  24 spot desa + crater floor, tierColor via FakeColor),
  tests/util.test.js (clamp, DEG), missionProgress (1 test),
  autopilotTo (3 test: roll, throttle, pitch clamp).

Kejujuran:
- Satu kesalahan sendiri saat ekstraksi N1: blok yang saya hapus
  dari render.js ikut memuat buildIslandGeometry (letaknya di
  antara islandProfile dan islandSurfaceY). Ketahuan dari grep
  (call site tierColor hilang), dipulihkan verbatim dari
  git HEAD + call tierColor diperbarui ke signature baru.
  Tidak ada file lain yang kena.
- Satu test baru saya yang salah asumsi: tierColor di y=5
  BUKAN sand murni — y=5 ada di zona blend ±0.04 dari boundary
  8/h (perilaku asli, bukan bug port). Test diperbaiki ke y=8
  (tepat di boundary, guard `d > 0` melewatinya).
- Smoke test live putaran 1: teleport final approach tanpa
  refresh membuat speed decay di bawah stall -> pitch-down
  stall -> hard touchdown hull 96, pesawat diam di runway
  tanpa debrief. Itu perilaku game yang sudah dikenal (M12),
  bukan regresi refactor — putaran 2 dengan refresh vs/speed
  berkala -> landing lembut, debrief LANDED, hull 100.
- Smoke test live putaran 2 (y=60) gagal mendarat dalam
  25 dtk bukan karena bug — sim jalan ~0,46x wall di
  SwiftShader, y=60 butuh ~43 dtk wall. Putaran 3 (y=20,
  vs=-6, window 40 dtk) LOLOS.

### Verifikasi akhir M12-clean
- Test 45/45 hijau (32 lama + 11 baru terrain/util + 1
  missionProgress + 3 autopilotTo − 2 test buyUpgrade yang
  dihapus bersama kodenya).
- Re-capture CDP keempat shot: PNG sha256 IDENTIK dengan
  baseline M12-fix (lihat atas); draw calls/tris identik.
  PNG baru dibaca sendiri (play/kokpit: kawah + lava flow +
  6 dial hijau + pitch ladder utuh).
- Smoke test live: title -> FLY -> briefing -> play -> P
  pause (layar pause muncul) -> P resume (kembali play) ->
  landing lembut -> debrief LANDED, hull 100, 0 JS exception.
  Bukti: /tmp/m12c-smoke.py, /tmp/m12c-smoke2.py.
- JPEG repo byte-identik M12-fix (tidak di-encode ulang).
  Dossier rebuild: 590.160 byte, 4 gambar, schema v1 (naik
  dari 583.447 karena isi game/ berubah — JPEG sama).
- Kit check: 4 passed / 1 failed transcripts_present (urusan
  parent, terisi sesudah bundle).
- File diubah (13): game/src/{terrain.js,util.js} baru,
  game/src/{config,world,shots,input,hud,economy,main,render}.js,
  game/index.html, tests/{terrain,util,world,missions,shots,
  economy}.test.js. TIDAK disentuh: audio.js, merge.js,
  main.ts, serve.ts, nilai gameplay/visual apa pun.
