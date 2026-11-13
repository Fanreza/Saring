const SIGNS = [
  ['Nama brand, tapi bukan domain resminya', 'bca.co.id-verifikasi.xyz, paypal.com.akun-aman.top'],
  ['Akhiran domain murah', '.xyz, .top, .cfd, .sbs, .icu'],
  ['Hosting gratis', 'vercel.app, weebly.com, sites.google.com'],
  ['Kata pancingan', 'verifikasi, login, akun-diblokir, hadiah, klaim'],
  ['Huruf atau angka acak', 'x9qk2-zt7w.pages.dev/kZq8XpT2'],
  ['Link dipendekkan', 'bit.ly, s.id, tinyurl.com'],
]

const MODES = [
  'Undangan atau resi berbentuk file APK',
  'Hadiah dan undian palsu',
  'Akun akan diblokir',
  'Tagihan tilang atau pajak',
  'Lowongan kerja paruh waktu',
]

const STEPS = [
  'Jangan isi apa pun. Tutup halamannya.',
  'Sudah mengisi password: ganti password dan aktifkan verifikasi dua langkah.',
  'Sudah memasukkan data bank atau OTP: hubungi call center resmi bank.',
  'Sudah memasang aplikasi dari link: hapus aplikasinya dan putuskan internet ponsel.',
  'Laporkan link tersebut ke Saring.',
]

export default function Edukasi() {
  return (
    <section className="wrap page">
      <header className="page-head">
        <h1>Kenali Phishing</h1>
      </header>

      <h2 className="sub">Ciri-ciri link phishing</h2>
      <div className="cards">
        {SIGNS.map(([t, ex]) => (
          <article key={t} className="card">
            <h3>{t}</h3>
            <code>{ex}</code>
          </article>
        ))}
      </div>

      <h2 className="sub">Modus yang sering terjadi di Indonesia</h2>
      <ul className="rows panel">
        {MODES.map(t => (
          <li key={t} className="row-stack"><b>{t}</b></li>
        ))}
      </ul>

      <h2 className="sub">Kalau sudah terlanjur membuka link</h2>
      <ol className="steps-list panel">
        {STEPS.map(s => <li key={s}>{s}</li>)}
      </ol>

      <div className="cta-row">
        <a className="btn-primary" href="#/cek">Periksa link sekarang</a>
        <a className="btn-plain" href="#/lapor">Laporkan link</a>
      </div>
    </section>
  )
}
