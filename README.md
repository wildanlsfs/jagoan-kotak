# Jagoan Kotak

Game petualangan-tarung 3D bergaya dunia kotak (ala Minecraft) yang dimainkan dengan **gerakan badan** di depan webcam. Tujuannya mengubah waktu main HP yang diam jadi aktivitas fisik: makin banyak bergerak, makin kuat jurusnya. Semua karakter **tanpa wajah**.

## Gerakan

| Gerakan badan | Di game | Keyboard | Layar sentuh |
|---|---|---|---|
| Jalan di tempat (angkat lutut bergantian) | Maju; cepat = lari | W / ↑ (Shift = lari) | Stik ke atas |
| Toleh kepala kiri / kanan | Belok | A / D, ← / → | Stik kiri / kanan |
| Dongak / tunduk | Lihat atas / bawah (membidik kelelawar) | Tahan Q / E | Tahan ☁️ |
| Tinju ke depan (kiri / kanan) | Pukulan angin dari tangan itu | J / K atau klik kiri / kanan | 👊 |
| Kedua tangan di depan wajah | Perisai (tangkis serangan dari depan) | Tahan L | Tahan 🛡️ |
| Lompat sungguhan | Lompat | Spasi | 🦘 |
| Jongkok | Merunduk (hindari sambaran kelelawar) | Tahan C | Tahan 🙇 |
| Angkat kedua tangan saat energi penuh | Jurus Hentak Bumi (kena semua monster di sekitar) | U | ⭐ |

## Mekanik

- **Gelombang monster**: slime (pecah jadi dua slime kecil), monster kotak (gemetar dulu sebelum memukul, jadi ada waktu untuk menangkis), kelelawar (gemetar lalu menyambar setinggi kepala, jadi harus jongkok, menangkis, atau ditinju sambil mendongak), dan monster besar di gelombang lanjut.
- **Energi jurus** terisi dari **langkah kaki**, pukulan yang kena, dan tangkisan, jadi anak didorong untuk terus bergerak.
- **5 nyawa**. Monster menjatuhkan 💎 permata dan kadang ❤️. Setiap gelombang yang selesai memberi +1 ❤️.
- **Latihan gerakan** 8 langkah sebelum main pertama kali, dan bisa diulang dari layar akhir.
- **Ringkasan aktivitas** di akhir: langkah, tinju, lompat, menit bergerak, perkiraan kalori, dan monster yang dikalahkan.
- **Kunci pemain**: orang lain yang lewat di depan kamera diabaikan. Game berhenti sejenak kalau pemain tidak terlihat lebih dari 2 detik.
- **Menu utama**: jagoan 3D memamerkan gerakan, 6 pilihan baju (tanpa wajah), halaman *Cara main*, tombol suara/musik, serta catatan rekor gelombang, total langkah, dan monster yang dikalahkan (disimpan di perangkat).
- **Layar akhir**: 1–3 bintang, lencana *Rekor baru*, ringkasan aktivitas.
- **Bidik ramah anak**: pukulan otomatis sedikit membelok ke monster di depan. Kelelawar di atas tetap harus dibidik dengan mendongak.

## Teknis

Performa: peta bayangan dunia dibuat sekali saja (karakter memakai bayangan bulat), menu dan jeda dibatasi 30 fps, resolusi turun/naik otomatis sesuai kemampuan perangkat, shader monster dikompilasi di awal, dan geometri barang/efek dipakai ulang supaya game tidak makin berat seiring waktu.

Statis tanpa build: Three.js 0.160 (importmap CDN) dan MediaPipe Tasks Vision 0.10.14 (Pose Landmarker lite, 2 orang, landmark 2D + dunia). Dunia dibuat dari balok InstancedMesh dengan tekstur piksel dari kanvas, dan suara serta musik disintesis dengan Web Audio. Gambar kamera hanya diproses di perangkat.

```
python3 -m http.server 5190     # buka http://localhost:5190/   (?debug untuk window.__game)
```

File: `js/main.js` (loop game), `js/motion.js` (membaca gerakan, bisa diuji dengan landmark buatan), `js/world.js`, `js/characters.js`, `js/audio.js`.
