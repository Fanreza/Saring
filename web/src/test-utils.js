// Helper tes: tiru gateway dengan peta "METHOD /path" -> [status, body] atau fungsi (body, opts) => [status, body].
import { vi } from 'vitest'

export function mockFetch(routes) {
  const fn = vi.fn(async (url, opts = {}) => {
    const path = new URL(url, 'http://x').pathname
    const key = `${opts.method ?? 'GET'} ${path}`
    const route = routes[key]
    if (!route) throw new TypeError('Failed to fetch') // seperti server mati
    const body = opts.body ? JSON.parse(opts.body) : undefined
    const [status, data] = typeof route === 'function' ? route(body, opts) : route
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

export const PHISH = {
  url: 'https://bca-mobile-verifikasi.cfd/akun', is_phishing: true, score: 0.998, threshold: 0.6887, model: 'xgboost',
  reasons: [
    { feature: 'suspicious_tld', label: 'Akhiran domain murah yang sering dipakai penipu', value: 1, impact: 2.1 },
    { feature: 'n_hyphen_host', label: 'Nama situs memakai tanda hubung (-)', value: 2, impact: 0.8 },
  ],
}
export const SAFE = { url: 'https://en.wikipedia.org/wiki/Phishing', is_phishing: false, score: 0.01, threshold: 0.6887, model: 'xgboost', reasons: [] }

// hasil cek berdasarkan isi link: "phish"/"cfd" -> phishing
export const checkRoute = body => [200, /phish|cfd/.test(body.url) ? { ...PHISH, url: body.url } : { ...SAFE, url: body.url }]
