import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib.jsx'

const TKEY = 'saring.admin'
const getToken = () => { try { return sessionStorage.getItem(TKEY) ?? '' } catch { return '' } }
function setToken(t) {
  try {
    if (t) sessionStorage.setItem(TKEY, t)
    else sessionStorage.removeItem(TKEY)
  } catch { /* storage diblokir: login hanya berlaku sampai halaman dimuat ulang */ }
}

const KIND = { phishing_lolos: 'Phishing lolos', salah_blokir: 'Salah blokir' }
const STATUS = { baru: 'Baru', valid: 'Valid', tidak_valid: 'Tidak valid' }
const num = v => v.toLocaleString('id-ID')

export default function Admin({ params }) {
  const [token, setTok] = useState(getToken)
  const logout = () => { setToken(''); setTok('') }
  return token ? <Dashboard token={token} onLogout={logout} initialTab={params?.get('tab') ?? 'laporan'} /> : <Login onLogin={t => { setToken(t); setTok(t) }} />
}

function Login({ onLogin }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      onLogin((await api('/api/admin/login', { method: 'POST', body: { password: pw } })).token)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="wrap page narrow">
      <header className="page-head">
        <h1>Masuk Admin</h1>
      </header>
      <form className="stack panel" onSubmit={submit}>
        <div>
          <label htmlFor="pw" className="field-label">Password</label>
          <input id="pw" type="password" autoComplete="current-password" required value={pw} onChange={e => setPw(e.target.value)} />
        </div>
        {err && <p className="tone-bad" role="alert">{err}</p>}
        <div className="actions"><button type="submit" className="btn-primary" disabled={busy || !pw}>{busy ? 'Memeriksa...' : 'Masuk'}</button></div>
      </form>
    </section>
  )
}

function Dashboard({ token, onLogout, initialTab }) {
  const [tab, setTab] = useState(initialTab)
  const [reports, setReports] = useState(null)
  const [stats, setStats] = useState(null)
  const [filter, setFilter] = useState('baru')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([api('/api/admin/reports', { token }), api('/api/admin/stats', { token })])
      setReports(r); setStats(s); setErr('')
    } catch (e) {
      if (e.status === 401) onLogout()
      else setErr(e.message)
    }
  }, [token, onLogout])
  useEffect(() => { load() }, [load])

  async function setStatus(id, status) {
    try {
      const upd = await api(`/api/admin/reports/${id}`, { method: 'PATCH', body: { status }, token })
      setReports(rs => rs.map(r => (r.id === id ? upd : r)))
      setStats(await api('/api/admin/stats', { token }))
    } catch (e) {
      setErr(e.message)
    }
  }

  const shown = reports?.filter(r => filter === 'semua' || r.status === filter) ?? []

  return (
    <section className="wrap page">
      <header className="page-head row-between">
        <div>
          <h1>Dashboard Admin</h1>
        </div>
        <button type="button" className="btn-plain" onClick={onLogout}>Keluar</button>
      </header>

      <div className="tabs" role="tablist">
        {[['laporan', 'Laporan'], ['statistik', 'Statistik']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}{k === 'laporan' && stats?.reports.baru > 0 && <span className="count">{stats.reports.baru}</span>}
          </button>
        ))}
      </div>

      {err && <p className="tone-bad" role="alert">{err} <button type="button" className="link-btn" onClick={load}>Coba lagi</button></p>}
      {!reports && !err && <p className="muted">Memuat data...</p>}

      {reports && tab === 'laporan' && (
        <>
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Filter status">
              {[['baru', 'Baru'], ['valid', 'Valid'], ['tidak_valid', 'Tidak valid'], ['semua', 'Semua']].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            <button type="button" className="btn-plain" onClick={load}>Muat ulang</button>
          </div>
          <div className="table-wrap">
            {shown.length === 0 ? <p className="empty">Tidak ada laporan dengan status ini.</p> : (
              <table>
                <thead><tr><th>#</th><th>Link</th><th>Jenis</th><th>Catatan</th><th>Tanggal</th><th>Status</th></tr></thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.id}>
                      <td className="mono">{r.id}</td>
                      <td><code className="break">{r.url}</code></td>
                      <td>{KIND[r.kind]}</td>
                      <td className="muted">{r.note || '-'}</td>
                      <td className="nowrap">{new Date(r.created).toLocaleDateString('id-ID', { dateStyle: 'medium' })}</td>
                      <td>
                        <label className="sr-only" htmlFor={`st${r.id}`}>Status laporan {r.id}</label>
                        <select id={`st${r.id}`} value={r.status} onChange={e => setStatus(r.id, e.target.value)}>
                          {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {stats && tab === 'statistik' && <Stats s={stats} />}
    </section>
  )
}

function Stats({ s }) {
  const max = Math.max(1, ...s.daily.map(d => d.checks))
  const tiles = [
    ['Total pemeriksaan', num(s.checks)], ['Terdeteksi phishing', num(s.phishing)],
    ['Aman', num(s.safe)], ['Laporan baru', num(s.reports.baru)],
  ]
  return (
    <>
      <div className="tiles">
        {tiles.map(([l, v]) => <div key={l} className="tile"><span className="tile-value">{v}</span><span className="tile-label">{l}</span></div>)}
      </div>
      <figure className="chart">
        <figcaption><b>Pemeriksaan 14 hari terakhir</b></figcaption>
        <div className="legend"><span><i className="sw sw-legit" />Aman</span><span><i className="sw sw-phish" />Phishing</span></div>
        <div className="colchart" role="img" aria-label="Grafik pemeriksaan per hari">
          {s.daily.map(d => (
            <div key={d.date} className="col" title={`${d.date}: ${d.checks} pemeriksaan, ${d.phishing} phishing`}>
              <span className="col-val">{d.checks || ''}</span>
              <div className="col-bar" style={{ height: `${(d.checks / max) * 100}%` }}>
                <span className="col-phish" style={{ height: d.checks ? `${(d.phishing / d.checks) * 100}%` : 0 }} />
              </div>
              <span className="col-label">{d.date.slice(8)}</span>
            </div>
          ))}
        </div>
      </figure>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Status laporan</th><th className="r">Jumlah</th></tr></thead>
          <tbody>{Object.entries(STATUS).map(([k, l]) => <tr key={k}><td>{l}</td><td className="r">{num(s.reports[k])}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  )
}
