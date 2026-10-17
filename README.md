# Jagoan Kotak

Game petualangan-tarung 3D bergaya dunia kotak (ala Minecraft) yang dimainkan dengan **gerakan badan** di depan webcam. Tujuannya mengubah waktu main HP yang diam jadi aktivitas fisik: makin banyak bergerak, makin kuat jurusnya. Semua karakter **tanpa wajah**.

## Gerakan

| Gerakan badan | Di game | Keyboard | Layar sentuh |
|---|---|---|---|
| Jalan di tempat (angkat lutut bergantian; kalau lutut tidak terlihat, dibaca dari goyangan naik-turun badan) | Mode kamera: mendekati monster terdekat. Keyboard/sentuh: maju. Cepat = lari | W / ↑ (Shift = lari) | Stik ke atas |
| Condongkan badan ke kiri / kanan | Mode kamera: geser kiri / kanan layar (menghindar). Jagoan **otomatis menghadap** monster terdekat, jadi tidak perlu belok | A / D, ← / → (belok) | Stik kiri / kanan |
| — | Lihat atas / bawah (hanya keyboard/sentuh; di mode kamera bidikan ke kelelawar otomatis) | Tahan Q / E | Tahan ☁️ |
| Tinju ke depan (kiri / kanan) | Pukulan angin dari tangan itu | J / K atau klik kiri / kanan | 👊 |
| Kedua tangan di depan wajah | Perisai (tangkis serangan dari depan) | Tahan L | Tahan 🛡️ |
| Lompat sungguhan | Lompat | Spasi | 🦘 |
| Lompat lagi saat jagoan masih di udara | Lompat ganda + salto | Spasi 2× | 🦘 2× |
| Jongkok lalu langsung lompat | Lompat tinggi | Tahan C + Spasi | Tahan 🙇 + 🦘 |
| Jongkok | Merunduk (hindari sambaran kelelawar) | Tahan C | Tahan 🙇 |
| Angkat kedua tangan saat energi penuh | Jurus Hentak Bumi (kena semua monster di sekitar) | U | ⭐ |

## Mekanik

- **Mode arena (main dengan kamera)**: tanpa kacamata VR, pemain harus selalu melihat layar, jadi menoleh untuk belok tidak masuk akal. Kamera arena tidak pernah berputar (tinggi di belakang jagoan, mengikuti posisinya), jagoan otomatis menghadap monster terdekat, jalan di tempat = mendekatinya, condong badan = geser kiri/kanan. Monster selalu muncul di arena, di depan kamera. Keyboard/sentuh tetap jelajah bebas dengan kamera bahu.
- **Jagoan meniru lengan pemain (hibrida)**: dalam mode kamera, lengan dan kemiringan bahu jagoan mengikuti lengan pemain secara langsung (angkat tangan, melambai, rentangkan tangan). Kaki tetap dianimasikan game karena jalan di tempat harus menjadi gerak maju. Tinju, jurus super, dan salto tetap memakai animasi game supaya terasa mantap. Lengan yang tidak terlihat kamera kembali ke animasi biasa dengan halus.
- **Gelombang monster**: slime (pecah jadi dua slime kecil), monster kotak (gemetar dulu sebelum memukul, jadi ada waktu untuk menangkis), kelelawar (gemetar lalu menyambar setinggi kepala, jadi harus jongkok, menangkis, atau ditinju), dan monster besar di gelombang lanjut.
- **Ruang latihan 🥋** (menu utama): membiasakan badan tanpa takut kalah, nyawa tidak berkurang. Empat latihan yang berlanjut otomatis (pemain berdiri jauh dari layar): (1) **Kenali gerakan**: 9 lampu gerakan menyala saat terbaca dan jadi hijau kalau sudah cukup; (2) **Tinju sasaran**: tangan kiri/kanan sesuai perintah; (3) **Hindari serangan**: orang-orangan "pelatih" melempar panah, kayu, batu, gelombang, bola sihir, dan lingkaran sihir satu per satu, masing-masing dengan petunjuk gerakan; (4) **Lawan monster jinak**: tiap jenis monster muncul satu per satu. Selesai latihan dapat sedikit 💎 dari gerakan.
- **Monster baru** (tetap tanpa wajah), masing-masing mengajarkan gerakan berbeda: **tengkorak pedang** (gel. 3+, pedang terangkat → JONGKOK/PERISAI), **tengkorak pemanah** (gel. 4+, menjaga jarak, anak panah terlihat saat membidik → PERISAI/JONGKOK/CONDONG), **penyihir** (gel. 6+, melayang; bola sihir yang mengejar pelan bisa **ditinju sampai memantul balik**, lingkaran ungu di kaki → GESER/LOMPAT, kadang berpindah tempat setelah dipukul). Jumlah monster per gelombang dibatasi supaya tidak meledak.
- **Bos tiap gelombang ke-5, bergiliran sesuai monster kecilnya** (makin kuat tiap kali). **Raja Batu**: raksasa batu bermahkota dengan **bar nyawa** di atas layar. Jatuh dari langit, lalu bergantian menyerang dengan ancang-ancang yang jelas: **hentakan** (gelombang kejut di tanah, harus LOMPAT), **pukulan** (JONGKOK atau PERISAI; tangkisan membuatnya pusing), **serudukan** (CONDONG ke samping). Habis menyeruduk dia **pusing** dan pukulan bernilai 2×. Di bawah setengah nyawa dia **marah**: lebih cepat dan memanggil 2 slime. Hadiah 15 💎 + 2 ❤️.
- **Raja Tengkorak**: tebasan raksasa (JONGKOK/PERISAI; tangkisan → pusing), hujan panah tulang dari jauh (PERISAI/JONGKOK), putaran menyerbu (CONDONG → pusing); marah memanggil 2 tengkorak. **Ratu Penyihir**: melayang & berpindah tempat, rentetan bola sihir (tinju sampai memantul; kena sihirnya sendiri → pusing dan turun ke tanah), tiga lingkaran sihir (condong ke samping atau lompat selalu selamat); marah memanggil 2 kelelawar.
- **Tempat muncul aman**: monster hanya muncul di titik terbuka dengan jalur lurus ke pemain (tidak di sela pohon atau di balik tebing). Monster yang tersangkut atau tertanam dipindahkan otomatis dengan efek "puf".
- **Energi jurus** terisi dari **langkah kaki**, pukulan yang kena, dan tangkisan, jadi anak didorong untuk terus bergerak.
- **5 nyawa**. Monster menjatuhkan 💎 permata dan kadang ❤️. Setiap gelombang yang selesai memberi +1 ❤️.
- **Latihan gerakan** 8 langkah sebelum main pertama kali, dan bisa diulang dari layar akhir.
- **Ringkasan aktivitas** di akhir: langkah, tinju, lompat, menit bergerak, perkiraan kalori, dan monster yang dikalahkan.
- **Kunci pemain**: orang lain yang lewat di depan kamera diabaikan. Game berhenti sejenak kalau pemain tidak terlihat lebih dari 2 detik.
- **Lemari 👕**: baju (warna & berpola: jaket, belang, ninja, zirah, emas), celana, sepatu, rambut, kulit (selalu gratis), topi (pet, kupluk, ikat kepala, baling-baling, viking, helm ksatria, mahkota), dan punggung (ransel, jubah, pedang, jetpack, sayap). Dibeli dengan 💎 dari monster dan **bonus gerak** di akhir game (1 💎 per 20 langkah + 2 💎 per gelombang); pemain baru mendapat 30 💎. Barang hanya kosmetik, semua tanpa wajah. Coba dulu sebelum membeli; tersimpan di perangkat.
- **Jalan → lari** mulus: laju naik bertahap, badan makin condong, lengan berayun lebih lebar, debu di setiap jejak; di mode kamera lari mulai di 2.4 langkah/dtk dan kembali jalan di bawah 1.9.
- **Menu utama**: jagoan 3D memamerkan gerakan, halaman *Cara main*, tombol suara/musik, serta catatan rekor gelombang, total langkah, dan monster yang dikalahkan (disimpan di perangkat).
- **Layar akhir**: 1–3 bintang, lencana *Rekor baru*, ringkasan aktivitas.
- **Bidik ramah anak**: pukulan otomatis sedikit membelok ke monster di depan. Di mode kamera kelelawar di atas juga terbidik otomatis; di keyboard tetap harus mendongak.

## Anti pusing

Tombol 🌀 di menu (bawaan: menyala). Dasarnya riset *motion sickness* di game: pusing muncul saat mata melihat gerakan yang tidak dirasakan badan. Pemicu terbesarnya putaran kamera, perubahan laju, kamera yang bergerak sendiri, frame tersendat, serta goyangan atau kelip layar.

- **Mode kamera = arena tanpa putaran kamera sama sekali** (lihat Mekanik). Di keyboard/sentuh dengan 🌀 menyala, belok tetap halus dengan awal dan akhir yang pelan.
- **Tidak ada kamera yang berputar sendiri.** Monster yang tidak terlihat ditunjukkan dengan panah di tepi layar.
- **Laju berubah pelan**, dan lari lebih pelan saat 🌀 menyala.
- **Dongak** hanya sedikit menggeser kamera, dan getaran kepala diredam.
- Kamera yang terhalang pohon maju lebih lembut dan mundur pelan, tidak maju-mundur cepat.
- **Deteksi pose di Web Worker**, jadi gambar tetap 60 fps rata di mode kamera.
- Tekstur tanah tidak berkelip di kejauhan (mipmap linear + anisotropi) dan kontras rumputnya lebih lembut.

## Teknis

Performa: peta bayangan dunia dibuat sekali saja (karakter memakai bayangan bulat), menu dan jeda dibatasi 30 fps, resolusi turun/naik otomatis sesuai kemampuan perangkat, shader monster dikompilasi di awal, dan geometri barang/efek dipakai ulang supaya game tidak makin berat seiring waktu.

Cara membaca gerakan (`js/motion.js`): MediaPipe memberi 33 titik tubuh per frame. Semua jarak dibagi panjang badan (bahu–pinggul), jadi tidak tergantung jauh-dekatnya pemain. Kalibrasi 3 detik merekam pose tegak sebagai titik nol. Langkah = satu lutut naik sementara lutut lain tetap; geser = bahu bergeser terhadap pinggul (condong badan, kepala bebas melihat layar); tinju = jangkauan tangan (kedalaman 3D) bertambah ≥ 8 cm dalam 0,25 detik setinggi dada, atau hentakan cepat menjauh dari bahu (2D); tangan cukup ditarik sedikit untuk siap meninju lagi, jadi tinju beruntun dari posisi kuda-kuda tetap terbaca; perisai = kedua tangan di depan wajah dan tidak terjulur, ditahan sebentar (tinju selalu menang atas perisai); lompat/jongkok = pinggul naik/turun dibanding kalibrasi. Lengan yang ditiru = arah bahu→pergelangan dari landmark dunia (meter), diubah ke sudut sendi bahu jagoan dan dihaluskan dengan filter One-Euro (tenang saat diam, cepat saat bergerak).

Statis tanpa build: Three.js 0.160 (importmap CDN) dan MediaPipe Tasks Vision 0.10.14 (Pose Landmarker lite, 2 orang, landmark 2D + dunia). Dunia dibuat dari balok InstancedMesh dengan tekstur piksel dari kanvas, dan suara serta musik disintesis dengan Web Audio. Gambar kamera hanya diproses di perangkat.

```
python3 -m http.server 5190     # buka http://localhost:5190/   (?debug untuk window.__game)
```

File: `js/main.js` (loop game, monster, bos, proyektil, ruang latihan), `js/wardrobe.js` (lemari, dompet, aksesori 3D), `js/pose-worker.js` (MediaPipe di Web Worker), `js/motion.js` (membaca gerakan, bisa diuji dengan landmark buatan), `js/world.js`, `js/characters.js`, `js/audio.js`.
