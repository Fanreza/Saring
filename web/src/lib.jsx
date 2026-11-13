// Bagian yang dipakai banyak halaman: API, riwayat, logo, kartu hasil.
import { useState } from 'react'

// dev: gateway lokal; build produksi: domain yang sama, Caddy meneruskan /api ke gateway
export const API = import.meta.env.VITE_API ?? (import.meta.env.DEV ? 'http://localhost:8787' : '')

export async function api(path, { method = 'GET', body, token } = {}) {
  let r
  try {
    r = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Server Saring tidak bisa dihubungi. Pastikan gateway berjalan di port 8787.')
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(data.error ?? `HTTP ${r.status}`), { status: r.status })
  return data
}

export async function checkUrl(url) {
  const res = await api('/api/check', { method: 'POST', body: { url: url.trim() } })
  addHistory(res)
  return res
}

// ---------- riwayat (disimpan di browser pengguna, tanpa akun) ----------
const HKEY = 'saring.history'
const HMAX = 200

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HKEY)) ?? []
  } catch {
    return []
  }
}

export function saveHistory(items) {
  try {
    localStorage.setItem(HKEY, JSON.stringify(items.slice(0, HMAX)))
  } catch { /* storage penuh atau diblokir: riwayat tidak disimpan */ }
}

function addHistory(res) {
  const item = { url: res.url, is_phishing: res.is_phishing, score: res.score, model: res.model, at: Date.now() }
  saveHistory([item, ...loadHistory().filter(h => h.url !== res.url)])
}

// Link phishing ditulis "dijinakkan" saat dibagikan agar tidak bisa langsung diklik.
export const defang = u => u.replace(/^http/i, 'hxxp').replace(/\./g, '[.]')

export const go = hash => { location.hash = hash }

// Router hash sederhana: "#/lapor?u=..." -> { page: "lapor", params }
export function parseHash(hash = location.hash, search = location.search) {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const params = new URLSearchParams(query)
  const legacy = new URLSearchParams(search).get('u') // ?u= dari versi lama / popup extension
  if (!path && legacy) params.set('u', legacy)
  return { page: path || 'cek', params }
}

export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="4" width="20" height="3" rx="1.5" />
      <rect x="5" y="10.5" width="14" height="3" rx="1.5" />
      <rect x="8.5" y="17" width="7" height="3" rx="1.5" />
    </svg>
  )
}

export function Verdict({ res }) {
  const label = res.is_phishing ? 'Phishing' : 'Aman'
  return <span className={`badge ${res.is_phishing ? 'badge-bad' : 'badge-good'}`}>{label}</span>
}

export function ResultCard({ res, onReset }) {
  const bad = res.is_phishing
  const trusted = res.model === 'allowlist'
  const score = Math.round(res.score * 100)

  return (
    <article className={`result ${bad ? 'is-bad' : 'is-good'}`}>
      <div className="result-top">
        <div>
          <p className="result-label">Hasil pemeriksaan</p>
          <p className="verdict">{bad ? 'Phishing' : 'Aman'}</p>
        </div>
        {!trusted && (
          <div className="score">
            <span className="score-value">{score}</span>
            <span className="score-unit">/ 100</span>
          </div>
        )}
      </div>

      {!trusted && (
        <div className="meter" aria-hidden>
          <span style={{ width: `${score}%` }} />
          <i style={{ left: `${res.threshold * 100}%` }} />
        </div>
      )}

      <p className="result-url">{res.url}</p>

      {bad && res.reasons?.length > 0 && (
        <div className="reasons">
          <p className="result-label">Alasan utama</p>
          <ol>{res.reasons.map(r => <li key={r.feature}>{r.label}</li>)}</ol>
        </div>
      )}

      <div className="actions">
        <ShareButtons res={res} />
        <a className="btn-plain" href={`#/lapor?u=${encodeURIComponent(res.url)}&k=${bad ? 'salah_blokir' : 'phishing_lolos'}`}>
          Hasil salah? Laporkan
        </a>
        {onReset && <button type="button" className="btn-plain" onClick={onReset}>Periksa link lain</button>}
      </div>
    </article>
  )
}

function ShareButtons({ res }) {
  const [copied, setCopied] = useState(false)
  const text = res.is_phishing
    ? `Hati-hati! Link ini terdeteksi PHISHING oleh Saring (skor ${Math.round(res.score * 100)}/100). Jangan dibuka:\n${defang(res.url)}`
    : `Saring: link ini tidak terdeteksi phishing.\n${res.url}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard ditolak browser */ }
  }
  return (
    <>
      <a className="btn-primary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
        Bagikan ke WhatsApp
      </a>
      <button type="button" className="btn-plain" onClick={copy}>{copied ? 'Tersalin' : 'Salin hasil'}</button>
    </>
  )
}
