// Semua angka berasal dari ml/ (build_dataset.py, train.py, evaluate.py) pada data unduhan 14 Oktober 2026.
// Kalau model dilatih ulang, perbarui file ini.

export const SUMMARY = [
  { value: '216.470', label: 'link dipakai untuk melatih dan menguji model' },
  { value: '93,2%', label: 'tebakan benar pada situs yang belum pernah dilihat model' },
  { value: '93,6%', label: 'phishing terbaru dari OpenPhish berhasil dikenali' },
  { value: '1,5%', label: 'situs populer yang keliru ditandai phishing' },
]

export const SOURCES = [
  {
    name: 'PhiUSIIL Phishing URL Dataset',
    by: 'Prasad & Chandra, UCI Machine Learning Repository (ID 967)',
    year: 'Dirilis 2024',
    url: 'https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset',
    content: 'Kumpulan link phishing dan link sah yang disusun untuk penelitian deteksi phishing. Link sahnya berupa halaman depan situs, link phishingnya dikumpulkan dari feed phishing publik.',
    raw: '235.795 link (134.850 sah, 100.945 phishing)',
    use: 'Link sah dipakai semua. Link phishing diambil acak 55.000 agar tidak mendominasi data phishing lain yang lebih baru. Label asli dibalik karena di dataset ini angka 1 berarti sah.',
    final: { legit: 51665, phish: 53675 },
  },
  {
    name: 'PhishTank',
    by: 'Cisco Talos, komunitas pelapor phishing',
    year: 'Diunduh 14 Oktober 2026',
    url: 'https://phishtank.org/',
    content: 'Daftar link phishing yang sudah diverifikasi komunitas dan masih aktif saat diunduh, lengkap dengan tanggal pelaporannya.',
    raw: '64.767 link phishing (dilaporkan 2011 sampai Oktober 2026)',
    use: 'Link yang dilaporkan sebelum 1 Agustus 2026 (57.073) dipakai untuk belajar. Link yang dilaporkan sesudahnya (7.694) disimpan untuk menguji model dengan phishing yang benar-benar baru.',
    final: { legit: 0, phish: 54560 },
  },
  {
    name: 'Malicious URLs Dataset',
    by: 'Manu Siddhartha, Kaggle',
    year: 'Dirilis 2021',
    url: 'https://www.kaggle.com/datasets/sid321axn/malicious-urls-dataset',
    content: 'Gabungan beberapa dataset lama, dengan empat label: benign, phishing, defacement, dan malware.',
    raw: '651.191 link (428.103 benign, 94.111 phishing, 96.457 defacement, 32.520 malware)',
    use: 'Hanya label benign yang memiliki path (380.482 link) yang dipakai, diambil acak 120.000. Link ini mewakili halaman biasa seperti artikel, video, dan halaman produk. Label phishing tidak dipakai karena banyak yang salah (lihat bagian riwayat percobaan).',
    final: { legit: 46454, phish: 0 },
  },
  {
    name: 'Tranco Top 1 Juta',
    by: 'Le Pochat dkk., KU Leuven',
    year: 'Diunduh 14 Oktober 2026',
    url: 'https://tranco-list.eu/',
    content: 'Peringkat 1 juta domain paling banyak dikunjungi di dunia, disusun dari beberapa sumber peringkat.',
    raw: '1.000.000 domain',
    use: 'Peringkat 1 sampai 30.000 dipakai sebagai contoh situs sah. Peringkat 100.001 sampai 110.000 disimpan untuk menguji apakah model keliru memblokir situs sah yang belum pernah dilihat.',
    final: { legit: 10116, phish: 0 },
  },
  {
    name: 'OpenPhish',
    by: 'OpenPhish, feed komunitas gratis',
    year: 'Diunduh 14 Oktober 2026',
    url: 'https://openphish.com/',
    content: 'Daftar link phishing terbaru dari feed gratis OpenPhish. Saat diunduh berisi 300 link.',
    raw: '300 link phishing',
    use: 'Tidak dipakai untuk belajar sama sekali. Seluruhnya dipakai untuk menguji model.',
    final: null,
  },
]

export const FUNNEL = [
  { label: 'Seluruh data mentah yang diunduh', value: 1952053 },
  { label: 'Dipilih sesuai aturan tiap sumber', value: 396923 },
  { label: 'Setelah duplikat dan label bertentangan dibuang', value: 389053 },
  { label: 'Setelah diseimbangkan 50:50', value: 216470 },
  { label: 'Data latih (80%)', value: 164277 },
  { label: 'Data uji (20%)', value: 52193 },
]

export const FEATURES = [
  { group: 'Panjang', items: [
    ['url_len', 'Panjang seluruh link, tanpa http:// dan www.', 'bca-akun.xyz/login = 18'],
    ['host_len', 'Panjang nama situs', 'bca-akun.xyz = 12'],
    ['path_len', 'Panjang bagian setelah nama situs', '/login = 6'],
    ['query_len', 'Panjang bagian setelah tanda tanya', '?id=7 = 4'],
    ['tld_len', 'Panjang akhiran domain', '.com = 3, .co.id = 5'],
  ] },
  { group: 'Jumlah karakter', items: [
    ['n_dot', 'Jumlah titik', 'a.b.c.com = 3'],
    ['n_hyphen', 'Jumlah tanda hubung di seluruh link', 'bca-login-aman = 2'],
    ['n_hyphen_host', 'Jumlah tanda hubung di nama situs saja', 'paypal-verify.com = 1'],
    ['n_underscore', 'Jumlah garis bawah', 'user_id = 1'],
    ['n_slash', 'Jumlah garis miring', 'a/b/c = 2'],
    ['n_qmark', 'Jumlah tanda tanya', ''],
    ['n_equal', 'Jumlah tanda sama dengan (parameter)', 'id=1&x=2 = 2'],
    ['n_at', 'Jumlah simbol @, bisa dipakai menyamarkan alamat asli', 'google.com@jahat.com'],
    ['n_amp', 'Jumlah tanda &', ''],
    ['n_percent', 'Jumlah karakter yang disandikan dengan %', '%20'],
    ['n_digit', 'Jumlah angka', ''],
    ['n_subdomain', 'Jumlah tingkat subdomain', 'login.akun.bank.xyz = 2'],
  ] },
  { group: 'Rasio dan keacakan', items: [
    ['digit_ratio', 'Proporsi angka dibanding panjang link', ''],
    ['letter_ratio', 'Proporsi huruf dibanding panjang link', ''],
    ['host_digit_ratio', 'Proporsi angka di nama situs', 'bca123.com'],
    ['upper_ratio_path', 'Proporsi huruf besar di path, menandakan kode acak', '/kZq8XpT2'],
    ['entropy_url', 'Tingkat keacakan susunan huruf seluruh link (Shannon entropy)', ''],
    ['entropy_host', 'Tingkat keacakan susunan huruf nama situs', 'x9qk2zt7w.com tinggi'],
  ] },
  { group: 'Ya atau tidak', items: [
    ['is_https', 'Memakai HTTPS', ''],
    ['is_ip', 'Nama situs berupa alamat IP', 'http://192.168.1.5/'],
    ['has_port', 'Memakai port selain 80 dan 443', 'situs.com:8081'],
    ['double_slash_path', 'Ada // di dalam path, tanda pengalihan', '/redirect//situs-lain'],
    ['punycode', 'Nama situs memakai huruf tiruan (xn--)', 'xn--pypal-4ve.com'],
    ['is_shortener', 'Memakai layanan pemendek link', 'bit.ly, s.id'],
    ['suspicious_tld', 'Akhiran domain murah yang sering disalahgunakan', '.xyz, .cfd, .top'],
    ['free_hosting', 'Berada di layanan hosting gratis atau DNS dinamis', 'vercel.app, weebly.com'],
  ] },
  { group: 'Kata', items: [
    ['n_sensitive', 'Jumlah kata pancingan', 'login, verify, akun, wallet'],
    ['brand_not_domain', 'Menyebut nama brand, tapi bukan domain resmi brand tersebut', 'paypal.com.akun-aman.xyz'],
  ] },
]

export const ALGORITHMS = [
  {
    name: 'Logistic Regression',
    how: 'Setiap fitur diberi bobot, lalu semuanya dijumlahkan menjadi satu skor. Metode paling sederhana, dipakai sebagai pembanding dasar. Sebelum dilatih, setiap fitur disamakan skalanya.',
    grid: 'C: 0,01 / 0,1 / 1 / 10',
    best: 'C = 0,01',
  },
  {
    name: 'Random Forest',
    how: 'Ratusan pohon keputusan dilatih, masing-masing dengan potongan data dan fitur yang diacak. Hasil akhirnya diambil dari suara terbanyak semua pohon.',
    grid: 'jumlah pohon 200 / 400, kedalaman maksimum tanpa batas / 20 / 30, minimal data per daun 1 / 2 / 5, fitur per pemisahan akar(n) / 50%',
    best: '200 pohon, kedalaman 20, minimal 5 data per daun, akar(n) fitur',
  },
  {
    name: 'XGBoost',
    how: 'Pohon keputusan dibuat satu per satu. Setiap pohon baru fokus memperbaiki kesalahan pohon-pohon sebelumnya (gradient boosting).',
    grid: 'jumlah pohon 300 / 600, kedalaman 6 / 8 / 10, learning rate 0,05 / 0,1 / 0,2, sampel per pohon 80% / 100%, fitur per pohon 70% / 100%',
    best: '600 pohon, kedalaman 6, learning rate 0,1, sampel 80%, fitur 100%',
  },
]

export const METRICS = [
  ['Akurasi', 'Dari semua link, berapa persen yang ditebak dengan benar.'],
  ['Presisi', 'Dari link yang ditandai phishing, berapa persen yang memang phishing.'],
  ['Recall', 'Dari semua link phishing, berapa persen yang berhasil ditangkap.'],
  ['F1', 'Gabungan presisi dan recall (rata-rata harmonis). Tinggi hanya jika keduanya tinggi.'],
  ['FPR', 'Dari semua link sah, berapa persen yang keliru ditandai phishing. Makin kecil makin baik.'],
  ['ROC-AUC', 'Kemampuan model memisahkan link sah dan phishing di semua nilai ambang. Nilai 1 berarti sempurna, 0,5 sama dengan menebak acak.'],
]

export const CV = [
  { model: 'Logistic Regression', acc: 0.8597, prec: 0.9127, rec: 0.7835, f1: 0.8357, f1sd: 0.0869, auc: 0.9373 },
  { model: 'Random Forest', acc: 0.9331, prec: 0.9613, rec: 0.8968, f1: 0.9276, f1sd: 0.0126, auc: 0.9801 },
  { model: 'XGBoost', acc: 0.9390, prec: 0.9582, rec: 0.9131, f1: 0.9348, f1sd: 0.0080, auc: 0.9800, best: true },
]

export const TEST = [
  { model: 'Logistic Regression', thr: 0.5, acc: 0.9194, prec: 0.9371, rec: 0.9186, f1: 0.9278, fpr: 0.0797, auc: 0.9571 },
  { model: 'Random Forest', thr: 0.5, acc: 0.9297, prec: 0.9592, rec: 0.9142, f1: 0.9361, fpr: 0.0503, auc: 0.9808 },
  { model: 'XGBoost', thr: 0.5, acc: 0.9335, prec: 0.9592, rec: 0.9211, f1: 0.9398, fpr: 0.0506, auc: 0.9745 },
  { model: 'XGBoost, ambang 0,689', thr: 0.6887, acc: 0.9319, prec: 0.9690, rec: 0.9083, f1: 0.9376, fpr: 0.0375, auc: 0.9745, best: true },
]

export const CONFUSION = { tn: 21919, fp: 855, fn: 2699, tp: 26720 }

export const HOLDOUT = [
  { label: 'Phishing OpenPhish, 14 Oktober 2026', n: 297, value: 0.9360, kind: 'phishing dikenali' },
  { label: 'Phishing PhishTank, Agustus sampai Oktober 2026', n: 7240, value: 0.7935, kind: 'phishing dikenali' },
  { label: 'Situs sah Tranco peringkat 100.001 sampai 110.000', n: 9642, value: 0.9855, kind: 'tidak diblokir' },
  { label: 'Halaman sah Kaggle dari domain baru', n: 10000, value: 0.9547, kind: 'tidak diblokir' },
]

export const IMPORTANCE = [
  ['free_hosting', 1.703], ['is_https', 1.454], ['n_subdomain', 1.183], ['entropy_url', 0.840],
  ['path_len', 0.838], ['n_slash', 0.714], ['letter_ratio', 0.455], ['tld_len', 0.428],
  ['host_len', 0.397], ['upper_ratio_path', 0.397], ['url_len', 0.356], ['digit_ratio', 0.299],
  ['suspicious_tld', 0.245], ['host_digit_ratio', 0.243], ['n_dot', 0.230],
]

export const ITERATIONS = [
  {
    n: 1, data: 'PhiUSIIL, Kaggle (benign dan phishing), Tranco', f1: '0,74',
    found: 'Akurasi pada data Kaggle hanya 63 sampai 74%. Dari 20 link Kaggle berlabel phishing yang diperiksa manual, sekitar 8 ternyata situs resmi, misalnya bom.gov.au, jakarta.apache.org, dan acm.org.',
    action: 'Label phishing Kaggle dibuang.',
  },
  {
    n: 2, data: 'PhiUSIIL, PhishTank, Tranco', f1: '0,98',
    found: 'Angka terlihat sangat bagus, tetapi semua link sah di data ini hanya halaman depan tanpa path. Model menyimpulkan "link yang punya path adalah phishing", sehingga artikel berita atau video YouTube pun akan diblokir.',
    action: 'Ditambah 120.000 link sah yang memiliki path dari Kaggle.',
  },
  {
    n: 3, data: 'Ditambah link sah ber-path', f1: '0,935',
    found: 'Model sudah adil, tetapi hanya mengenali 48% phishing dari PhishTank. Banyak phishing modern memakai HTTPS dan menumpang di layanan hosting gratis seperti vercel.app dan weebly.com.',
    action: 'Ditambah fitur hosting gratis, rasio huruf besar, dan daftar akhiran domain murah. Data phishing PhiUSIIL dibatasi 55.000.',
  },
  {
    n: 4, data: 'Model final', f1: '0,935', final: true,
    found: 'Phishing PhishTank yang dikenali naik dari 48% menjadi 89% pada data uji, dan dari 69% menjadi 79% pada phishing yang dilaporkan setelah pelatihan.',
    action: 'Model ini yang dipakai di web dan extension.',
  },
]
