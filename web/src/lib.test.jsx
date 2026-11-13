import { beforeEach, describe, expect, it } from 'vitest'
import { api, checkUrl, defang, loadHistory, parseHash, saveHistory } from './lib.jsx'
import { checkRoute, mockFetch } from './test-utils.js'

beforeEach(() => localStorage.clear())

describe('defang', () => {
  it('menjinakkan link agar tidak bisa diklik', () => {
    expect(defang('https://bca-login.xyz/akun')).toBe('hxxps://bca-login[.]xyz/akun')
    expect(defang('http://a.b.c')).toBe('hxxp://a[.]b[.]c')
  })
})

describe('parseHash (router)', () => {
  it('halaman dan parameter dari hash', () => {
    const r = parseHash('#/lapor?u=https%3A%2F%2Fa.com&k=salah_blokir', '')
    expect(r.page).toBe('lapor')
    expect(r.params.get('u')).toBe('https://a.com')
    expect(r.params.get('k')).toBe('salah_blokir')
  })
  it('hash kosong ke Cek Link, ?u= versi lama tetap didukung', () => {
    expect(parseHash('', '').page).toBe('cek')
    const r = parseHash('', '?u=https%3A%2F%2Fb.com')
    expect(r.page).toBe('cek')
    expect(r.params.get('u')).toBe('https://b.com')
  })
})

describe('api', () => {
  it('pesan jelas saat server mati', async () => {
    mockFetch({})
    await expect(api('/api/check')).rejects.toThrow('Server Saring tidak bisa dihubungi')
  })
  it('meneruskan pesan error dan status dari server', async () => {
    mockFetch({ 'POST /api/check': [400, { error: 'URL tidak valid (harus http/https)' }] })
    await expect(api('/api/check', { method: 'POST', body: {} })).rejects.toMatchObject({ message: 'URL tidak valid (harus http/https)', status: 400 })
  })
  it('mengirim token admin sebagai Bearer', async () => {
    const f = mockFetch({ 'GET /api/admin/stats': [200, {}] })
    await api('/api/admin/stats', { token: 'abc' })
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer abc')
  })
})

describe('riwayat', () => {
  it('checkUrl menyimpan hasil terbaru di atas tanpa duplikat', async () => {
    mockFetch({ 'POST /api/check': checkRoute })
    await checkUrl('https://a.com')
    await checkUrl('https://phish.xyz')
    await checkUrl('https://a.com')
    const h = loadHistory()
    expect(h.map(x => x.url)).toEqual(['https://a.com', 'https://phish.xyz'])
    expect(h[1].is_phishing).toBe(true)
  })
  it('maksimal 200 item', () => {
    saveHistory(Array.from({ length: 250 }, (_, i) => ({ url: `https://a${i}.com` })))
    expect(loadHistory()).toHaveLength(200)
  })
  it('data rusak di storage dianggap kosong', () => {
    localStorage.setItem('saring.history', '{rusak')
    expect(loadHistory()).toEqual([])
  })
})
