import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import Admin from './Admin.jsx'
import Check from './Check.jsx'
import History from './History.jsx'
import Lapor from './Lapor.jsx'
import Scan, { extractLinks } from './Scan.jsx'
import { saveHistory } from '../lib.jsx'
import { checkRoute, mockFetch, PHISH } from '../test-utils.js'

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

describe('Cek Link', () => {
  it('link dari ?u= langsung diperiksa dan hasil phishing tampil lengkap', async () => {
    mockFetch({ 'POST /api/check': checkRoute })
    render(<Check initial={PHISH.url} />)
    expect(await screen.findByText('Phishing')).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.getByText(PHISH.reasons[0].label)).toBeTruthy()
    const wa = screen.getByRole('link', { name: 'Bagikan ke WhatsApp' })
    expect(decodeURIComponent(wa.getAttribute('href'))).toContain('hxxps://bca-mobile-verifikasi[.]cfd/akun')
    expect(screen.getByRole('link', { name: 'Hasil salah? Laporkan' }).getAttribute('href')).toContain('k=salah_blokir')
  })

  it('mengetik link lalu Periksa menampilkan Aman tanpa daftar alasan', async () => {
    mockFetch({ 'POST /api/check': checkRoute })
    render(<Check />)
    await userEvent.type(screen.getByLabelText('Link yang ingin diperiksa'), 'https://en.wikipedia.org/wiki/Phishing')
    await userEvent.click(screen.getByRole('button', { name: 'Periksa' }))
    expect(await screen.findByText('Aman')).toBeTruthy()
    expect(screen.queryByText('Alasan utama')).toBeNull()
  })

  it('server mati menampilkan pesan dan tombol Coba lagi', async () => {
    mockFetch({})
    render(<Check initial="https://a.com" />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeTruthy()
  })

  it('tombol Periksa nonaktif bila kolom kosong', () => {
    render(<Check />)
    expect(screen.getByRole('button', { name: 'Periksa' }).disabled).toBe(true)
  })
})

describe('Pindai Pesan', () => {
  it.each([
    ['Klaim di https://bca-hadiah.top/klaim?id=8812. Info: www.bca.co.id dan bit.ly/3xY', ['https://bca-hadiah.top/klaim?id=8812', 'www.bca.co.id', 'bit.ly/3xY']],
    ['email cs@bank.co.id, bukan link', []],
    ['Hadiah Rp5.000.000 dari BCA.', []],
    ['(lihat https://a.b.com/x.html) dan s.id/abc!', ['https://a.b.com/x.html', 's.id/abc']],
    ['https://a.com https://a.com', ['https://a.com']],
  ])('extractLinks(%j)', (text, links) => {
    expect(extractLinks(text)).toEqual(links)
  })

  it('maksimal 20 link', () => {
    const text = Array.from({ length: 30 }, (_, i) => `https://situs${i}.com`).join(' ')
    expect(extractLinks(text)).toHaveLength(20)
  })

  it('memindai pesan dan menghitung link phishing', async () => {
    mockFetch({ 'POST /api/check': checkRoute })
    render(<Scan />)
    await userEvent.type(screen.getByLabelText('Isi pesan'), 'cek https://phish-bank.cfd/login dan https://kompas.com/berita')
    await userEvent.click(screen.getByRole('button', { name: 'Pindai pesan' }))
    expect(await screen.findByText(/1 terdeteksi phishing/)).toBeTruthy()
    expect(screen.getByText('2 link ditemukan', { exact: false })).toBeTruthy()
  })

  it('pesan tanpa link', async () => {
    render(<Scan />)
    await userEvent.type(screen.getByLabelText('Isi pesan'), 'halo apa kabar')
    await userEvent.click(screen.getByRole('button', { name: 'Pindai pesan' }))
    expect(screen.getByText('Tidak ada link yang ditemukan di pesan ini.')).toBeTruthy()
  })
})

describe('Riwayat', () => {
  const items = [
    { url: 'https://phish.xyz/a', is_phishing: true, score: 0.9, model: 'xgboost', at: Date.now() },
    { url: 'https://kompas.com/b', is_phishing: false, score: 0.1, model: 'xgboost', at: Date.now() },
  ]

  it('kosong menampilkan ajakan memeriksa link', () => {
    render(<History />)
    expect(screen.getByText('Belum ada riwayat pemeriksaan.')).toBeTruthy()
  })

  it('filter Phishing dan pencarian', async () => {
    saveHistory(items)
    render(<History />)
    await userEvent.click(screen.getByRole('button', { name: 'Phishing' }))
    expect(screen.getByText('https://phish.xyz/a')).toBeTruthy()
    expect(screen.queryByText('https://kompas.com/b')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Semua' }))
    await userEvent.type(screen.getByLabelText('Cari link'), 'kompas')
    expect(screen.queryByText('https://phish.xyz/a')).toBeNull()
  })

  it('hapus satu item tersimpan ke storage', async () => {
    saveHistory(items)
    render(<History />)
    await userEvent.click(screen.getByRole('button', { name: 'Hapus https://phish.xyz/a dari riwayat' }))
    expect(screen.queryByText('https://phish.xyz/a')).toBeNull()
    expect(JSON.parse(localStorage.getItem('saring.history'))).toHaveLength(1)
  })
})

describe('Laporkan', () => {
  it('terisi dari kartu hasil dan mengirim laporan', async () => {
    let sent
    mockFetch({ 'POST /api/report': body => { sent = body; return [201, { id: 7, ...body, status: 'baru' }] } })
    render(<Lapor params={new URLSearchParams('u=https%3A%2F%2Fui.ac.id&k=salah_blokir')} />)
    expect(screen.getByLabelText('Link yang dilaporkan').value).toBe('https://ui.ac.id')
    expect(screen.getByRole('radio', { name: /Situs aman yang salah diblokir/ }).checked).toBe(true)
    await userEvent.type(screen.getByLabelText(/Catatan/), 'situs kampus')
    await userEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }))
    expect(await screen.findByText(/Laporan #7 sudah diterima/)).toBeTruthy()
    expect(sent).toEqual({ url: 'https://ui.ac.id', kind: 'salah_blokir', note: 'situs kampus' })
  })

  it('menampilkan error dari server', async () => {
    mockFetch({ 'POST /api/report': [400, { error: 'URL tidak valid (harus http/https)' }] })
    render(<Lapor params={new URLSearchParams()} />)
    await userEvent.type(screen.getByLabelText('Link yang dilaporkan'), 'javascript:x')
    await userEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }))
    expect((await screen.findByRole('alert')).textContent).toContain('URL tidak valid')
  })
})

describe('Admin', () => {
  const report = { id: 1, url: 'https://kurir.online/resi', kind: 'phishing_lolos', note: 'via WA', status: 'baru', created: '2026-10-15T10:00:00Z' }
  const stats = {
    checks: 5, phishing: 3, safe: 2, reports: { baru: 1, valid: 0, tidak_valid: 0 },
    daily: Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 2).padStart(2, '0')}`, checks: i === 13 ? 5 : 0, phishing: i === 13 ? 3 : 0 })),
  }

  it('password salah tetap di halaman login', async () => {
    mockFetch({ 'POST /api/admin/login': [401, { error: 'password salah' }] })
    render(<Admin params={new URLSearchParams()} />)
    await userEvent.type(screen.getByLabelText('Password'), 'salah')
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    expect((await screen.findByRole('alert')).textContent).toBe('password salah')
  })

  it('login, melihat laporan, mengubah status, lalu statistik', async () => {
    let patched
    mockFetch({
      'POST /api/admin/login': [200, { token: 't0k' }],
      'GET /api/admin/reports': [200, [report]],
      'GET /api/admin/stats': [200, stats],
      'PATCH /api/admin/reports/1': body => { patched = body; return [200, { ...report, status: body.status }] },
    })
    render(<Admin params={new URLSearchParams()} />)
    await userEvent.type(screen.getByLabelText('Password'), 'benar')
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(await screen.findByText('https://kurir.online/resi')).toBeTruthy()
    expect(sessionStorage.getItem('saring.admin')).toBe('t0k')

    await userEvent.selectOptions(screen.getByLabelText('Status laporan 1'), 'valid')
    expect(patched).toEqual({ status: 'valid' })

    await userEvent.click(screen.getByRole('tab', { name: 'Statistik' }))
    const tiles = screen.getByText('Total pemeriksaan').closest('.tiles')
    expect(within(tiles).getByText('5')).toBeTruthy()
    expect(screen.getAllByTitle(/pemeriksaan/)).toHaveLength(14)
  })

  it('token kedaluwarsa (401) mengembalikan ke login', async () => {
    sessionStorage.setItem('saring.admin', 'lama')
    mockFetch({ 'GET /api/admin/reports': [401, { error: 'sesi admin tidak valid' }], 'GET /api/admin/stats': [401, {}] })
    render(<Admin params={new URLSearchParams()} />)
    expect(await screen.findByRole('button', { name: 'Masuk' })).toBeTruthy()
    expect(sessionStorage.getItem('saring.admin')).toBeNull()
  })
})
