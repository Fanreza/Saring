import { useState } from 'react'
import { checkUrl, Verdict } from '../lib.jsx'

const MAX_LINKS = 20

// Ambil link dari teks bebas: berawalan http(s):// atau www., atau berbentuk domain.tld/...
export function extractLinks(text) {
  // lookbehind: domain yang didahului "@" (alamat email) tidak dianggap link
  const re = /(?<![\w@.-])(?:https?:\/\/|www\.)[^\s<>"'()]+|(?<![\w@./-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"'()]*)?/gi
  const found = (text.match(re) ?? []).map(u => u.replace(/[.,;:!?'")\]]+$/, ''))
  return [...new Set(found)].slice(0, MAX_LINKS)
}

const SAMPLE = `Selamat! Anda terpilih mendapatkan hadiah Rp5.000.000 dari BCA.
Klaim sebelum 24 jam di https://bca-hadiah-undian2026.top/klaim?id=8812
Info lengkap: www.bca.co.id dan https://bit.ly/3xYzHadiah`

export default function Scan() {
  const [text, setText] = useState('')
  const [rows, setRows] = useState(null) // [{url, res?, err?}]
  const [busy, setBusy] = useState(false)

  async function scan() {
    const links = extractLinks(text)
    setRows(links.map(url => ({ url })))
    if (!links.length) return
    setBusy(true)
    // ponytail: 4 pemeriksaan paralel, cukup untuk maks 20 link dan tetap di bawah batas 60/menit
    let next = 0
    const worker = async () => {
      while (next < links.length) {
        const i = next++
        try {
          const res = await checkUrl(links[i])
          setRows(r => r.map((x, j) => (j === i ? { ...x, res } : x)))
        } catch (e) {
          setRows(r => r.map((x, j) => (j === i ? { ...x, err: e.message } : x)))
        }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
    setBusy(false)
  }

  const done = rows?.filter(r => r.res) ?? []
  const phishing = done.filter(r => r.res.is_phishing).length

  return (
    <section className="wrap page">
      <header className="page-head">
        <h1>Pindai Pesan</h1>
      </header>

      <form className="stack" onSubmit={e => { e.preventDefault(); scan() }}>
        <div>
          <label htmlFor="msg" className="field-label">Isi pesan</label>
          <textarea id="msg" rows={7} value={text} onChange={e => setText(e.target.value)}
            placeholder="Tempel pesan di sini..." spellCheck="false" />
        </div>
        <div className="actions">
          <button type="submit" className="btn-primary" disabled={busy || !text.trim()}>{busy ? 'Memindai...' : 'Pindai pesan'}</button>
          <button type="button" className="btn-plain" onClick={() => setText(SAMPLE)} disabled={busy}>Pakai contoh pesan</button>
        </div>
      </form>

      {rows && (
        <div className="panel" aria-live="polite">
          {rows.length === 0 ? (
            <p className="empty">Tidak ada link yang ditemukan di pesan ini.</p>
          ) : (
            <>
              <p className="panel-title">
                {rows.length} link ditemukan
                {done.length === rows.length && (phishing
                  ? <span className="tone-bad">, {phishing} terdeteksi phishing</span>
                  : <span className="tone-good">, semuanya aman</span>)}
              </p>
              <ul className="rows">
                {rows.map(r => (
                  <li key={r.url}>
                    <code>{r.url}</code>
                    {r.res ? (
                      <span className="row-end">
                        {r.res.model !== 'allowlist' && <span className="muted mono">{Math.round(r.res.score * 100)}</span>}
                        <Verdict res={r.res} />
                        <a href={`/cek?u=${encodeURIComponent(r.url)}`}>Detail</a>
                      </span>
                    ) : r.err ? <span className="tone-bad small">{r.err}</span> : <span className="muted small">Memeriksa...</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
