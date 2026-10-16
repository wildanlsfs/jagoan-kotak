# Jagoan Kotak

Game petualangan-tarung 3D bergaya dunia kotak (ala Minecraft) yang dimainkan dengan **gerakan badan** di depan webcam. Tujuannya mengubah waktu main HP yang diam jadi aktivitas fisik: makin banyak bergerak, makin kuat jurusnya. Semua karakter **tanpa wajah**.

## Gerakan

| Gerakan badan | Di game | Keyboard | Layar sentuh |
|---|---|---|---|
| Jalan di tempat (angkat lutut bergantian; kalau lutut tidak terlihat, dibaca dari goyangan naik-turun badan) | Maju; cepat = lari | W / ↑ (Shift = lari) | Stik ke atas |
| Toleh kepala **atau** miringkan badan ke kiri / kanan | Belok (di mode kamera jagoan juga pelan-pelan menghadap monster terdekat) | A / D, ← / → | Stik kiri / kanan |
| Dongak / tunduk | Lihat atas / bawah (membidik kelelawar) | Tahan Q / E | Tahan ☁️ |
| Tinju ke depan (kiri / kanan) | Pukulan angin dari tangan itu | J / K atau klik kiri / kanan | 👊 |
| Kedua tangan di depan wajah | Perisai (tangkis serangan dari depan) | Tahan L | Tahan 🛡️ |
| Lompat sungguhan | Lompat | Spasi | 🦘 |
| Lompat lagi saat jagoan masih di udara | Lompat ganda + salto | Spasi 2× | 🦘 2× |
| Jongkok lalu langsung lompat | Lompat tinggi | Tahan C + Spasi | Tahan 🙇 + 🦘 |
| Jongkok | Merunduk (hindari sambaran kelelawar) | Tahan C | Tahan 🙇 |
| Angkat kedua tangan saat energi penuh | Jurus Hentak Bumi (kena semua monster di sekitar) | U | ⭐ |

## Mekanik

- **Gelombang monster**: slime (pecah jadi dua slime kecil), monster kotak (gemetar dulu sebelum memukul, jadi ada waktu untuk menangkis), kelelawar (gemetar lalu menyambar setinggi kepala, jadi harus jongkok, menangkis, atau ditinju sambil mendongak), dan monster besar di gelombang lanjut.
- **Energi jurus** terisi dari **langkah kaki**, pukulan yang kena, dan tangkisan, jadi anak didorong untuk terus bergerak.
- **5 nyawa**. Monster menjatuhkan 💎 permata dan kadang ❤️. Setiap gelombang yang selesai memberi +1 ❤️.
- **Latihan gerakan** 8 langkah sebelum main pertama kali, dan bisa diulang dari layar akhir.
- **Ringkasan aktivitas** di akhir: langkah, tinju, lompat, menit bergerak, perkiraan kalori, dan monster yang dikalahkan.
- **Kunci pemain**: orang lain yang lewat di depan kamera diabaikan. Game berhenti sejenak kalau pemain tidak terlihat lebih dari 2 detik.
- **Lemari 👕**: baju (warna & berpola: jaket, belang, ninja, zirah, emas), celana, sepatu, rambut, kulit (selalu gratis), topi (pet, kupluk, ikat kepala, baling-baling, viking, helm ksatria, mahkota), dan punggung (ransel, jubah, pedang, jetpack, sayap). Dibeli dengan 💎 dari monster dan **bonus gerak** di akhir game (1 💎 per 20 langkah + 2 💎 per gelombang); pemain baru mendapat 30 💎. Barang hanya kosmetik, semua tanpa wajah. Coba dulu sebelum membeli; tersimpan di perangkat.
- **Jalan → lari** mulus: laju naik bertahap, badan makin condong, lengan berayun lebih lebar, debu di setiap jejak; di mode kamera lari mulai di 2.4 langkah/dtk dan kembali jalan di bawah 1.9.
- **Menu utama**: jagoan 3D memamerkan gerakan, halaman *Cara main*, tombol suara/musik, serta catatan rekor gelombang, total langkah, dan monster yang dikalahkan (disimpan di perangkat).
- **Layar akhir**: 1–3 bintang, lencana *Rekor baru*, ringkasan aktivitas.
- **Bidik ramah anak**: pukulan otomatis sedikit membelok ke monster di depan. Kelelawar di atas tetap harus dibidik dengan mendongak.

## Anti pusing

Tombol 🌀 di menu (bawaan: menyala). Dasarnya riset *motion sickness* di game: pusing muncul saat mata melihat gerakan yang tidak dirasakan badan. Pemicu terbesarnya putaran kamera, perubahan laju, kamera yang bergerak sendiri, frame tersendat, serta goyangan atau kelip layar.

- **Belok patah** di mode kamera: setiap toleh atau miring langsung memutar 30° tanpa putaran yang terlihat (riset *snap turning*: rasa mual turun sekitar 40%). Kalau 🌀 dimatikan, belok tetap halus, maksimal 69°/detik, dengan awal dan akhir yang pelan.
- **Tidak ada kamera yang berputar sendiri.** Monster yang tidak terlihat ditunjukkan dengan panah di tepi layar.
- **Laju berubah pelan**, dan lari lebih pelan saat 🌀 menyala.
- **Dongak** hanya sedikit menggeser kamera, dan getaran kepala diredam.
- Kamera yang terhalang pohon maju lebih lembut dan mundur pelan, tidak maju-mundur cepat.
- **Deteksi pose di Web Worker**, jadi gambar tetap 60 fps rata di mode kamera.
- Tekstur tanah tidak berkelip di kejauhan (mipmap linear + anisotropi) dan kontras rumputnya lebih lembut.

## Teknis

Performa: peta bayangan dunia dibuat sekali saja (karakter memakai bayangan bulat), menu dan jeda dibatasi 30 fps, resolusi turun/naik otomatis sesuai kemampuan perangkat, shader monster dikompilasi di awal, dan geometri barang/efek dipakai ulang supaya game tidak makin berat seiring waktu.

Cara membaca gerakan (`js/motion.js`): MediaPipe memberi 33 titik tubuh per frame. Semua jarak dibagi panjang badan (bahu–pinggul), jadi tidak tergantung jauh-dekatnya pemain. Kalibrasi 3 detik merekam pose tegak sebagai titik nol. Langkah = satu lutut naik sementara lutut lain tetap; belok = posisi hidung terhadap telinga dan geser bahu terhadap pinggul; tinju = pergelangan maju cepat (kedalaman 3D) atau hentakan cepat menjauh dari bahu (2D); perisai = kedua tangan di depan wajah; lompat/jongkok = pinggul naik/turun dibanding kalibrasi.

Statis tanpa build: Three.js 0.160 (importmap CDN) dan MediaPipe Tasks Vision 0.10.14 (Pose Landmarker lite, 2 orang, landmark 2D + dunia). Dunia dibuat dari balok InstancedMesh dengan tekstur piksel dari kanvas, dan suara serta musik disintesis dengan Web Audio. Gambar kamera hanya diproses di perangkat.

```
python3 -m http.server 5190     # buka http://localhost:5190/   (?debug untuk window.__game)
```

File: `js/main.js` (loop game), `js/wardrobe.js` (lemari, dompet, aksesori 3D), `js/pose-worker.js` (MediaPipe di Web Worker), `js/motion.js` (membaca gerakan, bisa diuji dengan landmark buatan), `js/world.js`, `js/characters.js`, `js/audio.js`.
