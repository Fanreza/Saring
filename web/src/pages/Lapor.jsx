import { useState } from 'react'
import { api } from '../lib.jsx'

const KINDS = [
  ['phishing_lolos', 'Link phishing yang tidak terdeteksi'],
  ['salah_blokir', 'Situs aman yang salah diblokir'],
]

export default function Lapor({ params }) {
  const [url, setUrl] = useState(params.get('u') ?? '')
  const [kind, setKind] = useState(params.get('k') ?? 'phishing_lolos')
  const [note, setNote] = useState('')
  const [state, setState] = useState({ busy: false, err: '', done: null })

  async function submit(e) {
    e.preventDefault()
    setState({ busy: true, err: '', done: null })
    try {
      const rep = await api('/api/report', { method: 'POST', body: { url, kind, note } })
      setState({ busy: false, err: '', done: rep })
      setUrl(''); setNote('')
    } catch (e) {
      setState({ busy: false, err: e.message, done: null })
    }
  }

  return (
    <section className="wrap page narrow">
      <header className="page-head">
        <h1>Laporkan Link</h1>
      </header>

      {state.done && (
        <div className="notice notice-good" role="status">
          Laporan #{state.done.id} sudah diterima.
        </div>
      )}

      <form className="stack panel" onSubmit={submit}>
        <div>
          <label htmlFor="rurl" className="field-label">Link yang dilaporkan</label>
          <input id="rurl" type="text" inputMode="url" required autoComplete="off" spellCheck="false"
            placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
        </div>

        <fieldset>
          <legend className="field-label">Jenis laporan</legend>
          {KINDS.map(([k, label]) => (
            <label key={k} className={`choice ${kind === k ? 'is-on' : ''}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
              <span><b>{label}</b></span>
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor="note" className="field-label">Catatan <span className="muted">(opsional)</span></label>
          <textarea id="note" rows={4} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
          <p className="muted small right">{note.length}/500</p>
        </div>

        {state.err && <p className="tone-bad" role="alert">{state.err}</p>}
        <div className="actions">
          <button type="submit" className="btn-primary" disabled={state.busy || !url.trim()}>{state.busy ? 'Mengirim...' : 'Kirim laporan'}</button>
        </div>
      </form>
    </section>
  )
}
