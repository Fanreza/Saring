import { useState } from 'react'
import { loadHistory, saveHistory, Verdict } from '../lib.jsx'

const fmt = t => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

export default function History() {
  const [items, setItems] = useState(loadHistory)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('semua')

  const update = next => { setItems(next); saveHistory(next) }
  const shown = items.filter(h =>
    h.url.toLowerCase().includes(q.toLowerCase()) &&
    (filter === 'semua' || (filter === 'phishing') === h.is_phishing))

  return (
    <section className="wrap page">
      <header className="page-head">
        <h1>Riwayat</h1>
      </header>

      {items.length === 0 ? (
        <div className="panel empty">
          <p>Belum ada riwayat pemeriksaan.</p>
          <a className="btn-primary" href="/cek">Periksa link pertama</a>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="sr-only" htmlFor="q">Cari link</label>
            <input id="q" type="search" placeholder="Cari link..." value={q} onChange={e => setQ(e.target.value)} />
            <div className="seg" role="group" aria-label="Filter hasil">
              {['semua', 'phishing', 'aman'].map(f => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
              ))}
            </div>
            <button type="button" className="btn-plain" onClick={() => confirm('Hapus semua riwayat?') && update([])}>Hapus semua</button>
          </div>

          <div className="panel">
            {shown.length === 0 ? <p className="empty">Tidak ada riwayat yang cocok.</p> : (
              <ul className="rows">
                {shown.map(h => (
                  <li key={h.url}>
                    <span className="row-main">
                      <code>{h.url}</code>
                      <span className="muted small">{fmt(h.at)}</span>
                    </span>
                    <span className="row-end">
                      {h.model !== 'allowlist' && <span className="muted mono">{Math.round(h.score * 100)}</span>}
                      <Verdict res={h} />
                      <a href={`/cek?u=${encodeURIComponent(h.url)}`}>Periksa ulang</a>
                      <button type="button" className="link-btn" aria-label={`Hapus ${h.url} dari riwayat`}
                        onClick={() => update(items.filter(x => x.url !== h.url))}>Hapus</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
