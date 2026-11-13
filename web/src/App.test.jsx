import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App.jsx'
import { checkRoute, mockFetch } from './test-utils.js'

function openAt(url) {
  history.replaceState(null, '', url)
  return render(<App />)
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); mockFetch({ 'POST /api/check': checkRoute }) })

describe('App: alamat bersih tanpa #', () => {
  it('halaman awal menampilkan Cek Link', () => {
    openAt('/')
    expect(screen.getByRole('heading', { name: /Periksa link/ })).toBeTruthy()
  })

  it('alamat /riwayat langsung membuka Riwayat', () => {
    openAt('/riwayat')
    expect(screen.getByRole('heading', { name: 'Riwayat' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Riwayat' }).getAttribute('aria-current')).toBe('page')
  })

  it('alamat /admin langsung membuka halaman admin (tanpa menu)', () => {
    openAt('/admin')
    expect(screen.getByRole('heading', { name: 'Masuk Admin' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Admin/ })).toBeNull()
  })

  it('klik menu pindah halaman tanpa memuat ulang dan alamat tanpa #', async () => {
    openAt('/')
    await userEvent.click(screen.getByRole('link', { name: 'Pindai Pesan' }))
    expect(location.pathname).toBe('/pindai')
    expect(location.hash).toBe('')
    expect(screen.getByRole('heading', { name: 'Pindai Pesan' })).toBeTruthy()
  })

  it('tombol Kembali browser kembali ke halaman sebelumnya', async () => {
    openAt('/')
    await userEvent.click(screen.getByRole('link', { name: 'Riwayat' }))
    expect(screen.getByRole('heading', { name: 'Riwayat' })).toBeTruthy()
    history.back()
    expect(await screen.findByRole('heading', { name: /Periksa link/ })).toBeTruthy()
    expect(location.pathname).toBe('/')
  })

  it('link lama /#/riwayat dibuka lalu dirapikan menjadi /riwayat', () => {
    openAt('/#/riwayat')
    expect(screen.getByRole('heading', { name: 'Riwayat' })).toBeTruthy()
    expect(location.pathname).toBe('/riwayat')
    expect(location.hash).toBe('')
  })

  it('/cek?u= memeriksa link dari parameter', async () => {
    openAt('/cek?u=https%3A%2F%2Fbca-mobile-verifikasi.cfd%2Fakun')
    expect(await screen.findByText('Phishing')).toBeTruthy()
  })

  it('alamat yang tidak dikenal menampilkan halaman tidak ditemukan', () => {
    openAt('/tidak-ada')
    expect(screen.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeTruthy()
  })
})
