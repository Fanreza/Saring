import {
  ALGORITHMS, CONFUSION, CV, FEATURES, FUNNEL, HOLDOUT, IMPORTANCE, ITERATIONS, METRICS, SOURCES, TEST,
} from './data.js'

const num = v => v.toLocaleString('id-ID')
const pct = v => (v * 100).toFixed(1).replace('.', ',') + '%'
const dec = (v, d = 3) => v.toFixed(d).replace('.', ',')

const jump = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

export default function Report() {
  return (
    <>
      <header className="wrap page page-head">
        <h1>Tentang Model</h1>
        <div className="seg jump" role="group" aria-label="Bagian">
          {[['dataset', 'Dataset'], ['metodologi', 'Metodologi'], ['hasil', 'Hasil'], ['riwayat', 'Riwayat percobaan']].map(([id, l]) => (
            <button key={id} type="button" onClick={() => jump(id)}>{l}</button>
          ))}
        </div>
      </header>
      <Section id="dataset" n="01" title="Dataset">
        <p className="prose">
          Model dilatih dari lima sumber data terbuka. Dari setiap sumber hanya diambil teks link dan labelnya
          (sah atau phishing). Semua fitur dihitung ulang dengan cara yang sama, sehingga data dari sumber yang
          berbeda bisa digabung.
        </p>

        <div className="sources">
          {SOURCES.map((s, i) => (
            <article key={s.name} className="source">
              <header>
                <span className="source-n">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></h3>
                  <p className="meta">{s.by}. {s.year}.</p>
                </div>
              </header>
              <dl>
                <dt>Isi</dt><dd>{s.content}</dd>
                <dt>Jumlah mentah</dt><dd>{s.raw}</dd>
                <dt>Cara dipakai</dt><dd>{s.use}</dd>
                <dt>Masuk data akhir</dt>
                <dd>{s.final ? `${num(s.final.legit)} sah, ${num(s.final.phish)} phishing` : 'Hanya untuk pengujian'}</dd>
              </dl>
            </article>
          ))}
        </div>

        <Figure
          title="Komposisi data akhir per sumber"
          note="Jumlah link setelah dibersihkan dan diseimbangkan. Total 108.235 sah dan 108.235 phishing."
        >
          <div className="legend">
            <span><i className="sw sw-legit" />Sah</span>
            <span><i className="sw sw-phish" />Phishing</span>
          </div>
          <div className="bars grouped">
            {SOURCES.filter(s => s.final).map(s => (
              <div key={s.name} className="bar-row">
                <span className="bar-label">{s.name.replace(' Phishing URL Dataset', '').replace(' Dataset', '')}</span>
                <div className="bar-stack">
                  <Bar value={s.final.legit} max={60000} cls="legit" text={num(s.final.legit)} tip={`${s.name}: ${num(s.final.legit)} link sah`} />
                  <Bar value={s.final.phish} max={60000} cls="phish" text={num(s.final.phish)} tip={`${s.name}: ${num(s.final.phish)} link phishing`} />
                </div>
              </div>
            ))}
          </div>
        </Figure>

        <Figure
          title="Penyusutan data dari unduhan sampai siap dipakai"
          note="Panjang batang sebanding dengan jumlah link."
        >
          <div className="bars">
            {FUNNEL.map(f => (
              <div key={f.label} className="bar-row">
                <span className="bar-label">{f.label}</span>
                <Bar value={f.value} max={FUNNEL[0].value} cls="legit" text={num(f.value)} tip={`${f.label}: ${num(f.value)}`} />
              </div>
            ))}
          </div>
        </Figure>
      </Section>

      <Section id="metodologi" n="02" title="Metodologi">
        <ol className="flow" aria-label="Alur penelitian">
          {['Pengumpulan data', 'Pembersihan', 'Pembagian data', 'Ekstraksi fitur', 'Pelatihan model', 'Evaluasi', 'Penerapan'].map((s, i) => (
            <li key={s}><span>{i + 1}</span>{s}</li>
          ))}
        </ol>

        <Step n="2.1" title="Pengumpulan data">
          <p>
            Dataset PhiUSIIL, Kaggle, dan Tranco diunduh dari sumber resminya. Daftar PhishTank dan OpenPhish
            diunduh pada 14 Oktober 2026 dan disimpan per tanggal unduhan, supaya urutan waktu laporan phishing
            bisa dipakai saat pengujian. Seluruh proses dijalankan oleh skrip <code>download_data.py</code>.
          </p>
        </Step>

        <Step n="2.2" title="Pembersihan data">
          <ol className="numbered">
            <li><b>Menyamakan label.</b> Semua sumber diubah ke format yang sama: 0 untuk sah, 1 untuk phishing. Label PhiUSIIL dibalik karena aslinya 1 berarti sah.</li>
            <li><b>Membuang label yang tidak bisa dipercaya.</b> Label phishing dari Kaggle tidak dipakai karena banyak salah.</li>
            <li><b>Menambah link sah yang memiliki path.</b> Link sah dari PhiUSIIL dan Tranco hanya berupa halaman depan, jadi ditambah 120.000 link sah ber-path dari Kaggle. Tanpa langkah ini model belajar bahwa link panjang selalu phishing.</li>
            <li><b>Menyamakan penulisan link.</b> Untuk keperluan perbandingan, http://, https://, www., dan garis miring di akhir diabaikan. Link Kaggle yang ditulis tanpa awalan diberi https://.</li>
            <li><b>Membuang duplikat.</b> Link yang sama dari beberapa sumber hanya disimpan sekali. Link yang dilabeli sah di satu sumber tetapi phishing di sumber lain dibuang. Dari 396.923 link tersisa 389.053.</li>
            <li><b>Menyeimbangkan kelas.</b> Link sah jauh lebih banyak, jadi diambil acak sampai jumlahnya sama dengan link phishing: masing-masing 108.235.</li>
          </ol>
        </Step>

        <Step n="2.3" title="Pembagian data">
          <p>
            Data dibagi 80% untuk latihan dan 20% untuk ujian, <b>berdasarkan domain</b>, bukan per link. Semua link dari
            satu domain masuk ke kelompok yang sama. Hasilnya 87.251 domain di data latih dan 21.813 domain lain di data
            uji, tanpa ada yang sama. Dengan begitu nilai ujian mengukur kemampuan mengenali situs yang benar-benar baru,
            bukan kemampuan menghafal domain.
          </p>
          <p>
            Selain itu disiapkan <b>data holdout</b> yang sama sekali tidak dipakai saat membangun model: phishing PhishTank
            yang dilaporkan mulai 1 Agustus 2026, seluruh OpenPhish, 10.000 situs Tranco peringkat 100.001 sampai 110.000,
            dan 10.000 halaman sah Kaggle dari domain yang tidak ada di data latih.
          </p>
        </Step>

        <Step n="2.4" title="Ekstraksi fitur">
          <p>
            Setiap link diubah menjadi 33 angka (fitur) yang menggambarkan bentuknya. Fitur hanya diambil dari teks link,
            tanpa membuka halaman, tanpa WHOIS, dan tanpa DNS. Fitur panjang dan jumlah karakter dihitung setelah
            http://, www., dan garis miring akhir dibuang, supaya cara penulisan link di tiap dataset tidak memengaruhi hasil.
          </p>
          <div className="table-wrap">
            <table className="features">
              <thead><tr><th>Kelompok</th><th>Fitur</th><th>Arti</th><th>Contoh</th></tr></thead>
              <tbody>
                {FEATURES.flatMap(g => g.items.map(([key, desc, ex], i) => (
                  <tr key={key}>
                    {i === 0 && <th scope="rowgroup" rowSpan={g.items.length} className="group">{g.group}</th>}
                    <td><code>{key}</code></td><td>{desc}</td><td className="ex">{ex}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </Step>

        <Step n="2.5" title="Pelatihan model">
          <p>
            Tiga algoritma klasifikasi dibandingkan. Untuk setiap algoritma dicoba 8 kombinasi parameter secara acak
            (randomized search), masing-masing dinilai dengan validasi silang 3 lipatan berdasarkan domain. Kombinasi
            dengan nilai F1 tertinggi dipilih.
          </p>
          <div className="algos">
            {ALGORITHMS.map(a => (
              <article key={a.name}>
                <h4>{a.name}</h4>
                <p>{a.how}</p>
                <dl>
                  <dt>Parameter yang dicoba</dt><dd>{a.grid}</dd>
                  <dt>Parameter terbaik</dt><dd>{a.best}</dd>
                </dl>
              </article>
            ))}
          </div>
        </Step>

        <Step n="2.6" title="Validasi dan pemilihan ambang">
          <p>
            Model dengan parameter terbaik dinilai ulang dengan validasi silang 5 lipatan berdasarkan domain: data latih
            dibagi 5, model dilatih 5 kali dengan 4 bagian dan diuji pada 1 bagian sisanya, lalu hasilnya dirata-rata.
            Model dengan F1 rata-rata tertinggi dipilih, yaitu XGBoost.
          </p>
          <p>
            Model menghasilkan skor 0 sampai 1. Ambang (threshold) untuk menyatakan sebuah link phishing tidak dibiarkan
            0,5, melainkan dipilih dari hasil validasi silang sehingga paling banyak 2% link sah yang keliru diblokir.
            Ambang yang didapat adalah <b>0,689</b>. Pertimbangannya, extension yang sering memblokir situs sah akan
            mengganggu dan akhirnya dimatikan pengguna.
          </p>
        </Step>

        <Step n="2.7" title="Metrik evaluasi">
          <dl className="metrics">
            {METRICS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Step>
      </Section>

      <Section id="hasil" n="03" title="Hasil">
        <Step n="3.1" title="Validasi silang 5 lipatan">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Model</th><th className="r">Akurasi</th><th className="r">Presisi</th><th className="r">Recall</th><th className="r">F1</th><th className="r">ROC-AUC</th></tr></thead>
              <tbody>{CV.map(m => (
                <tr key={m.model} className={m.best ? 'best' : ''}>
                  <td>{m.model}</td><td className="r">{pct(m.acc)}</td><td className="r">{pct(m.prec)}</td><td className="r">{pct(m.rec)}</td>
                  <td className="r">{pct(m.f1)} <span className="sd">± {dec(m.f1sd * 100, 1)}</span></td><td className="r">{dec(m.auc)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        </Step>

        <Step n="3.2" title="Data uji: 52.193 link dari domain yang belum pernah dilihat">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Model</th><th className="r">Ambang</th><th className="r">Akurasi</th><th className="r">Presisi</th><th className="r">Recall</th><th className="r">F1</th><th className="r">FPR</th></tr></thead>
              <tbody>{TEST.map(m => (
                <tr key={m.model} className={m.best ? 'best' : ''}>
                  <td>{m.model}</td><td className="r">{dec(m.thr)}</td><td className="r">{pct(m.acc)}</td><td className="r">{pct(m.prec)}</td>
                  <td className="r">{pct(m.rec)}</td><td className="r">{pct(m.f1)}</td><td className="r">{pct(m.fpr)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>

          <div className="confusion-wrap">
            <table className="confusion" aria-label="Confusion matrix XGBoost pada data uji">
              <thead>
                <tr><td /><th colSpan={2} className="c">Tebakan model</th></tr>
                <tr><td /><th className="c">Sah</th><th className="c">Phishing</th></tr>
              </thead>
              <tbody>
                <tr><th>Sebenarnya sah</th><td className="c hit">{num(CONFUSION.tn)}</td><td className="c miss">{num(CONFUSION.fp)}</td></tr>
                <tr><th>Sebenarnya phishing</th><td className="c miss">{num(CONFUSION.fn)}</td><td className="c hit">{num(CONFUSION.tp)}</td></tr>
              </tbody>
            </table>
            <p className="prose small">
              Dari 22.774 link sah, 855 keliru ditandai phishing. Dari 29.419 link phishing, 2.699 lolos.
              Kesalahan sengaja dibuat lebih banyak di sisi phishing yang lolos, karena memblokir situs sah lebih mengganggu pengguna.
            </p>
          </div>
        </Step>

        <Step n="3.3" title="Holdout: data yang muncul setelah model selesai dilatih">
          <Figure title="Persentase tebakan benar per kelompok holdout" note="Untuk kelompok phishing yang dihitung adalah yang dikenali. Untuk kelompok sah yang dihitung adalah yang tidak diblokir.">
            <div className="bars">
              {HOLDOUT.map(h => (
                <div key={h.label} className="bar-row">
                  <span className="bar-label">{h.label}<small>{num(h.n)} link, {h.kind}</small></span>
                  <Bar value={h.value} max={1} cls="legit" text={pct(h.value)} tip={`${h.label}: ${pct(h.value)} ${h.kind}`} />
                </div>
              ))}
            </div>
          </Figure>
          <p className="prose">
            Phishing dari PhishTank paling sulit dikenali (79,4%). Banyak di antaranya memakai domain baru yang terlihat
            wajar dan sudah memakai HTTPS, sehingga sulit dibedakan hanya dari teks link.
          </p>
        </Step>

        <Step n="3.4" title="Fitur yang paling berpengaruh">
          <Figure title="15 fitur dengan pengaruh terbesar" note="Diukur dengan rata-rata nilai SHAP absolut pada 1.000 link uji. Makin panjang batang, makin besar pengaruh fitur terhadap keputusan model.">
            <div className="bars">
              {IMPORTANCE.map(([k, v]) => (
                <div key={k} className="bar-row">
                  <span className="bar-label"><code>{k}</code></span>
                  <Bar value={v} max={IMPORTANCE[0][1]} cls="legit" text={dec(v, 2)} tip={`${k}: ${dec(v, 2)}`} />
                </div>
              ))}
            </div>
          </Figure>
        </Step>
      </Section>

      <Section id="riwayat" n="04" title="Riwayat percobaan">
        <p className="prose">
          Model final didapat setelah empat percobaan. Dua percobaan pertama memberi pelajaran penting: nilai yang tinggi
          belum tentu berarti model bagus.
        </p>
        <div className="table-wrap">
          <table className="iterations">
            <thead><tr><th>#</th><th>Data</th><th className="r">F1</th><th>Temuan</th><th>Tindakan</th></tr></thead>
            <tbody>{ITERATIONS.map(it => (
              <tr key={it.n} className={it.final ? 'best' : ''}>
                <td>{it.n}</td><td>{it.data}</td><td className="r">{it.f1}</td><td>{it.found}</td><td>{it.action}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </Section>

    </>
  )
}

function Section({ id, n, title, children }) {
  return (
    <section id={id} className="wrap section">
      <header className="section-head">
        <span className="section-n">{n}</span>
        <h2>{title}</h2>
      </header>
      <div className="section-body">{children}</div>
    </section>
  )
}

function Step({ n, title, children }) {
  return (
    <div className="step">
      <h3><span>{n}</span>{title}</h3>
      {children}
    </div>
  )
}

function Figure({ title, note, children }) {
  return (
    <figure className="chart">
      <figcaption><b>{title}</b>{note && <span>{note}</span>}</figcaption>
      {children}
    </figure>
  )
}

function Bar({ value, max, cls, text, tip }) {
  return (
    <div className="bar" title={tip}>
      {value > 0 && <span className={`bar-fill ${cls}`} style={{ width: `${Math.max((value / max) * 100, 0.6)}%` }} />}
      <span className="bar-value">{value > 0 ? text : '0'}</span>
    </div>
  )
}
