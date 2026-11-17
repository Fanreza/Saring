import { useEffect, useState } from 'react'
import { Mark, navigate, parseRoute, routeUrl } from './lib.jsx'
import Check from './pages/Check.jsx'
import Scan from './pages/Scan.jsx'
import History from './pages/History.jsx'
import Lapor from './pages/Lapor.jsx'
import Edukasi from './pages/Edukasi.jsx'
import Admin from './pages/Admin.jsx'
import Report from './Report.jsx'
import './pages.css'

const MENU = [
  ['cek', 'Cek Link'], ['pindai', 'Pindai Pesan'], ['riwayat', 'Riwayat'], ['lapor', 'Laporkan'],
  ['edukasi', 'Edukasi'], ['model', 'Tentang Model'],
]

export default function App() {
  const [route, setRoute] = useState(parseRoute)
  useEffect(() => {
    // link lama "/#/cek?u=..." dirapikan menjadi "/cek?u=..." tanpa memuat ulang
    if (location.hash.startsWith('#/')) history.replaceState(null, '', routeUrl(parseRoute()))
    const on = () => { setRoute(parseRoute()); scrollTo(0, 0) }
    // klik link internal (href diawali "/") pindah halaman tanpa memuat ulang; link luar dan tab baru dibiarkan
    const onClick = e => {
      const a = e.target.closest?.('a[href^="/"]')
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (a.target && a.target !== '_self') return
      if (a.getAttribute('href').startsWith('//') || a.getAttribute('href').startsWith('/api/')) return
      e.preventDefault()
      navigate(a.getAttribute('href'))
    }
    addEventListener('popstate', on)
    document.addEventListener('click', onClick)
    return () => { removeEventListener('popstate', on); document.removeEventListener('click', onClick) }
  }, [])

  const { page, params } = route
  const key = `${page}?${params}` // halaman dibuat ulang saat parameter berubah

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a href="/cek" className="wordmark"><Mark />Saring</a>
          <nav aria-label="Menu utama">
            {MENU.map(([k, l]) => <a key={k} href={`/${k}`} aria-current={page === k ? 'page' : undefined}>{l}</a>)}
          </nav>
        </div>
      </header>

      <main key={key}>
        {page === 'cek' && <Check initial={params.get('u') ?? ''} />}
        {page === 'pindai' && <Scan />}
        {page === 'riwayat' && <History />}
        {page === 'lapor' && <Lapor params={params} />}
        {page === 'edukasi' && <Edukasi />}
        {page === 'model' && <Report />}
        {page === 'admin' && <Admin params={params} />}
        {!['cek', 'pindai', 'riwayat', 'lapor', 'edukasi', 'model', 'admin'].includes(page) && (
          <section className="wrap page"><h1>Halaman tidak ditemukan</h1><p className="lede"><a href="/cek">Kembali ke Cek Link</a></p></section>
        )}
      </main>

      <footer className="wrap footer">
        <span className="wordmark"><Mark />Saring</span>
        <p>© 2026 Saring</p>
      </footer>
    </>
  )
}
