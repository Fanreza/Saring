# Brand: Saring

_Status: active_

Saring memeriksa apakah sebuah link termasuk phishing hanya dari teks alamatnya, tanpa membuka halamannya. Tersedia sebagai web dan Chrome extension, untuk pengguna internet Indonesia yang sering menerima link dari WhatsApp, SMS, dan email.

## Nama dan logo

- **Nama:** Saring. Selalu ditulis "Saring", bukan "SARING" atau "saring".
- **Logo:** tiga garis mendatar membulat yang makin pendek ke bawah, seperti saringan yang menahan yang berbahaya. Lebar 20 / 14 / 7 unit pada kanvas 24, tinggi garis 3, jarak 3,5.
- **Wordmark:** logo + "Saring" dalam Inter 650, letter-spacing -0.02em, jarak 9px.
- **Ikon aplikasi:** logo putih di atas persegi membulat warna primary (`extension/icons/`).

## Palet: Malam Indigo

Satu aksen (indigo), sisanya netral. Merah dan hijau hanya untuk status hasil, tidak pernah untuk dekorasi.

| Token | Terang | Gelap | Peran |
|---|---|---|---|
| `--bg` | `#fbfbfc` | `#0e0f13` | Latar halaman |
| `--elev` | `#f3f3f6` | `#16171d` | Kepala tabel, latar input sekunder |
| `--surface` | `#ffffff` | `#131419` | Panel dan kartu |
| `--fg` | `#16161d` | `#f2f2f5` | Teks utama |
| `--muted` | `#5d5e6c` | `#9d9fb0` | Teks sekunder |
| `--faint` | `#8a8b99` | `#6f7182` | Label kecil, nomor |
| `--border` | `#e4e4ea` | `#26272f` | Garis |
| `--primary` | `#4f52c8` | `#8b8ef0` | Tombol utama, logo, tautan |
| `--primary-fg` | `#ffffff` | `#0c0d1c` | Teks di atas primary |
| `--primary-soft` | `#ececfb` | `#1d1e38` | Sorotan baris terpilih |
| `--bad` | `#c8303a` | `#ff7b84` | Hasil phishing |
| `--good` | `#1f7a4d` | `#5fd09a` | Hasil aman |

Semua pasangan teks dan latar lolos WCAG AA (minimal 4,5:1). Grafik memakai palet dataviz tervalidasi: biru `#2a78d6` untuk sah dan oranye `#eb6834` untuk phishing (gelap: `#3987e5` / `#d95926`).

## Tipografi

- **Inter** (400 sampai 700) untuk semua teks. Judul 650 dengan letter-spacing rapat (-0.035em sampai -0.045em).
- **JetBrains Mono** untuk link, nama fitur, dan angka di grafik.
- Maksimal 3 bobot per layar: 400, 600, 650.

## Bentuk

- Radius bertingkat sesuai peran: 4px kode, 6px tombol, 10px kolom input, 12px panel.
- Bayangan tipis (opasitas 4 sampai 6%), hanya pada panel yang mengambang (kolom pemeriksa, kartu hasil).
- Tanpa gradasi, tanpa glassmorphism, tanpa ikon dekoratif.

## Suara dan bahasa

Saring berbicara seperti petugas keamanan yang tenang: langsung, jelas, tidak menakut-nakuti. Kalimat pendek dan aktif. Sapaan "kamu".

Saat memperingatkan, sebut apa yang berbahaya dan apa yang harus dilakukan ("Link ini punya ciri-ciri situs penipuan. Jangan dibuka."). Jangan memakai huruf kapital semua, tanda seru beruntun, atau kata seperti "canggih", "revolusioner", "berbasis AI".

Saat menjelaskan cara kerja, pakai angka nyata (216.470 link, 93,2%) daripada klaim umum. Istilah teknis boleh dipakai bila disertai penjelasan singkat.

## Yang dilakukan dan dihindari

- Lakukan: satu warna aksen per layar, angka sebagai pusat perhatian, tata letak asimetris (konten kiri, ringkasan kanan).
- Hindari: em dash dalam teks, gradasi ungu-biru, grid tiga kolom ikon + judul + paragraf, judul aspiratif yang kabur.
