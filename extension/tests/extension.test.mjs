// Tes extension tanpa browser: jalankan berkas asli di sandbox vm dengan tiruan chrome.* dan fetch.
// Jalankan: node --test extension/tests
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = f => readFileSync(join(DIR, f), 'utf8')
const tick = () => new Promise(r => setTimeout(r, 0))
// objek dari sandbox vm beda prototype, jadi bandingkan isinya saja
const same = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected)

function fakeChrome({ enabled, session = {} } = {}) {
  const listeners = {}
  const on = name => ({ addListener: fn => { listeners[name] = fn } })
  const calls = { update: [], badge: [], menus: [], created: [], removed: [] }
  const store = { session: { ...session }, local: enabled === undefined ? {} : { enabled } }
  const area = name => ({
    get: async key => (key in store[name] ? { [key]: store[name][key] } : {}),
    set: async obj => { Object.assign(store[name], obj) },
    remove: async key => { delete store[name][key]; calls.removed.push(key) },
  })
  const chrome = {
    webNavigation: { onBeforeNavigate: on('nav'), onCompleted: on('done') },
    tabs: {
      update: (id, opts) => calls.update.push([id, opts]),
      create: opts => calls.created.push(opts),
      onRemoved: on('removed'),
      getCurrent: async () => ({ id: 9 }),
    },
    storage: { session: area('session'), local: area('local') },
    action: { setBadgeText: o => calls.badge.push(o.text), setBadgeBackgroundColor: () => {} },
    runtime: { onInstalled: on('installed'), getURL: p => `chrome-extension://abc/${p}` },
    contextMenus: { create: o => calls.menus.push(o), onClicked: on('menu') },
  }
  return { chrome, listeners, calls, store }
}

function loadBackground({ result, fail = false, ...opts } = {}) {
  const f = fakeChrome(opts)
  const fetched = []
  const ctx = {
    chrome: f.chrome, console, setTimeout, clearTimeout, AbortController, encodeURIComponent,
    fetch: async (url, init) => {
      fetched.push(JSON.parse(init.body).url)
      if (fail) throw new TypeError('Failed to fetch')
      return { ok: true, json: async () => result }
    },
  }
  ctx.importScripts = name => vm.runInContext(src(name), ctx)
  vm.createContext(ctx)
  vm.runInContext(src('background.js'), ctx)
  return { ...f, fetched }
}

const WEB = /SARING_WEB = '([^']+)'/.exec(src('config.js'))[1] // alamat web dari config.js, bukan ditulis ulang di tes

const PHISH = { is_phishing: true, score: 0.99, model: 'xgboost', reasons: [] }
const SAFE = { is_phishing: false, score: 0.02, model: 'xgboost', reasons: [] }
const nav = (url, frameId = 0) => ({ tabId: 1, url, frameId })

test('link phishing: tab dialihkan ke halaman peringatan, badge "!"', async () => {
  const bg = loadBackground({ result: PHISH })
  await bg.listeners.nav(nav('https://bca-login.cfd/akun'))
  same(bg.fetched, ['https://bca-login.cfd/akun'])
  assert.equal(bg.calls.update.length, 1)
  assert.equal(bg.calls.update[0][1].url, 'chrome-extension://abc/warning.html?u=https%3A%2F%2Fbca-login.cfd%2Fakun')
  same(bg.calls.badge, ['!'])
  assert.equal(bg.store.session['tab:1'].is_phishing, true)
})

test('link aman: tidak dialihkan, badge "OK"', async () => {
  const bg = loadBackground({ result: SAFE })
  await bg.listeners.nav(nav('https://kompas.com/berita'))
  assert.equal(bg.calls.update.length, 0)
  same(bg.calls.badge, ['OK'])
})

test('hasil di cache sesi dipakai ulang tanpa memanggil server', async () => {
  const bg = loadBackground({ result: SAFE })
  await bg.listeners.nav(nav('https://a.com/x'))
  await bg.listeners.nav(nav('https://a.com/x'))
  assert.equal(bg.fetched.length, 1)
})

test('link di daftar lewati (tetap buka) tidak diperiksa', async () => {
  const bg = loadBackground({ result: PHISH, session: { 'bypass:https://bca-login.cfd/akun': true } })
  await bg.listeners.nav(nav('https://bca-login.cfd/akun'))
  assert.equal(bg.fetched.length, 0)
  assert.equal(bg.calls.update.length, 0)
})

test('proteksi dimatikan: tidak memeriksa apa pun', async () => {
  const bg = loadBackground({ result: PHISH, enabled: false })
  await bg.listeners.nav(nav('https://bca-login.cfd/akun'))
  assert.equal(bg.fetched.length, 0)
})

test('subframe dan skema non-http diabaikan', async () => {
  const bg = loadBackground({ result: PHISH })
  await bg.listeners.nav(nav('https://iklan.com/frame', 3))
  await bg.listeners.nav(nav('chrome://settings'))
  await bg.listeners.nav(nav('file:///C:/a.html'))
  assert.equal(bg.fetched.length, 0)
})

test('server mati: fail-open, halaman tidak diblokir, badge "?"', async () => {
  const bg = loadBackground({ fail: true })
  await bg.listeners.nav(nav('https://bca-login.cfd/akun'))
  assert.equal(bg.calls.update.length, 0)
  same(bg.calls.badge, ['?'])
  assert.equal(bg.store.session['tab:1'].error, true)
})

test('badge dipasang ulang setelah halaman selesai dimuat', async () => {
  const bg = loadBackground({ result: SAFE })
  await bg.listeners.nav(nav('https://kompas.com'))
  await bg.listeners.done({ tabId: 1, frameId: 0, url: 'https://kompas.com' })
  same(bg.calls.badge, ['OK', 'OK'])
})

test('data tab dihapus saat tab ditutup', async () => {
  const bg = loadBackground({ result: SAFE })
  bg.listeners.removed(1)
  same(bg.calls.removed, ['tab:1'])
})

test('menu klik kanan dibuat saat instal dan membuka halaman Cek Link', () => {
  const bg = loadBackground({ result: SAFE })
  bg.listeners.installed()
  same(bg.calls.menus, [{ id: 'saring-check', title: 'Cek link dengan Saring', contexts: ['link'] }])
  bg.listeners.menu({ menuItemId: 'saring-check', linkUrl: 'https://phish.xyz/a?b=1' })
  same(bg.calls.created, [{ url: `${WEB}/cek?u=https%3A%2F%2Fphish.xyz%2Fa%3Fb%3D1` }])
})

// ---------- halaman peringatan ----------
function loadWarning(url, session = {}) {
  const f = fakeChrome({ session })
  const els = {}
  const document = { getElementById: id => (els[id] ??= { id, textContent: '', hidden: true, onclick: null, append: () => {} }) }
  document.createElement = () => ({ textContent: '' })
  const location = { search: `?u=${encodeURIComponent(url)}`, href: 'chrome-extension://abc/warning.html' }
  const ctx = { chrome: f.chrome, document, location, URLSearchParams, Math, encodeURIComponent }
  vm.createContext(ctx)
  vm.runInContext(src('warning.js'), ctx)
  return { ...f, els, location }
}

test('halaman peringatan menampilkan link dan skor dari cache', async () => {
  const w = loadWarning('https://bca-login.cfd/akun', { 'c:https://bca-login.cfd/akun': { score: 0.987, reasons: [{ label: 'x' }] } })
  await tick()
  assert.equal(w.els.url.textContent, 'https://bca-login.cfd/akun')
  assert.equal(w.els.pct.textContent, '99%')
  assert.equal(w.els.score.hidden, false)
})

test('"Tetap buka" menyimpan bypass lalu membuka link', async () => {
  const w = loadWarning('https://bca-login.cfd/akun')
  await w.els.proceed.onclick()
  assert.equal(w.store.session['bypass:https://bca-login.cfd/akun'], true)
  assert.equal(w.location.href, 'https://bca-login.cfd/akun')
})

test('"Tetap buka" menolak link non-http', async () => {
  const w = loadWarning('javascript:alert(1)')
  await w.els.proceed.onclick()
  assert.equal(w.location.href, 'chrome-extension://abc/warning.html')
  same(w.store.session, {})
})

test('"Keluar dari sini" membuka tab baru kosong', async () => {
  const w = loadWarning('https://bca-login.cfd/akun')
  await w.els.back.onclick()
  same(w.calls.update, [[9, { url: 'chrome://newtab/' }]])
})
