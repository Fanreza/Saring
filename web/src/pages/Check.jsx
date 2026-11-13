import { useEffect, useRef, useState } from 'react'
import { checkUrl, ResultCard } from '../lib.jsx'
import { SUMMARY } from '../data.js'

const EXAMPLES = [
  'https://bca-mobile-verifikasi.cfd/akun',
  'https://metamask-wallet-restore.vercel.app/seed',
  'http://paypal-login.verify-account.xyz/signin',
  'https://en.wikipedia.org/wiki/Phishing',
]

export default function Check({ initial = '' }) {
  const [url, setUrl] = useState(initial)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  async function check(target = url) {
    if (!target.trim()) return
    setLoading(true); setErr(''); setRes(null)
    try {
      setRes(await checkUrl(target))
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  // link dari ?u= (popup / klik kanan extension) langsung diperiksa
  useEffect(() => {
    if (initial) check(initial)
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <section className="wrap hero">
        <div className="hero-main">
          <h1>Periksa link sebelum dibuka.</h1>

          <form className="checker" onSubmit={e => { e.preventDefault(); check() }}>
            <label htmlFor="url">Link yang ingin diperiksa</label>
            <div className="checker-row">
              <input
                ref={inputRef} id="url" type="text" inputMode="url" autoComplete="off" spellCheck="false"
                placeholder="https://contoh-link.xyz/login" value={url} onChange={e => setUrl(e.target.value)}
              />
              <button type="submit" disabled={loading || !url.trim()}>{loading ? 'Memeriksa...' : 'Periksa'}</button>
            </div>
          </form>

          <div className="examples">
            <span>Contoh untuk dicoba</span>
            <ul>
              {EXAMPLES.map(u => (
                <li key={u}><button type="button" onClick={() => { setUrl(u); check(u) }} disabled={loading}>{u}</button></li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="hero-side" aria-label="Ringkasan">
          {SUMMARY.map(s => (
            <div key={s.label} className="figure">
              <span className="figure-value">{s.value}</span>
              <span className="figure-label">{s.label}</span>
            </div>
          ))}
        </aside>
      </section>

      <div className="wrap" aria-live="polite">
        {loading && <div className="result result-loading">Memeriksa link...</div>}
        {err && (
          <div className="result result-error" role="alert">
            <p>{err}</p>
            <button type="button" className="btn-plain" onClick={() => check()}>Coba lagi</button>
          </div>
        )}
        {res && <ResultCard res={res} onReset={() => { setUrl(''); setRes(null); inputRef.current?.focus() }} />}
      </div>
    </>
  )
}
