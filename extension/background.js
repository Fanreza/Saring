// Cek setiap navigasi top-level ke gateway; kalau phishing alihkan ke warning.html.
importScripts('config.js') // SARING_API, SARING_WEB
const API = `${SARING_API}/api/check`

async function getSession(key) {
  return (await chrome.storage.session.get(key))[key]
}

async function check(url) {
  const cached = await getSession('c:' + url)
  if (cached) return cached
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: ctrl.signal,
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const res = await r.json()
    await chrome.storage.session.set({ ['c:' + url]: res })
    return res
  } finally {
    clearTimeout(timer)
  }
}

function badge(tabId, res) {
  const [text, color] = !res ? ['?', '#888'] : res.is_phishing ? ['!', '#dc2626'] : ['OK', '#16a34a']
  chrome.action.setBadgeText({ tabId, text })
  chrome.action.setBadgeBackgroundColor({ tabId, color })
}

chrome.webNavigation.onBeforeNavigate.addListener(async ({ tabId, url, frameId }) => {
  if (frameId !== 0 || !/^https?:/.test(url)) return
  const { enabled = true } = await chrome.storage.local.get('enabled')
  if (!enabled) return
  if (await getSession('bypass:' + url)) return

  let res = null
  try {
    res = await check(url)
  } catch {
    // fail-open: API mati -> jangan blokir browsing
  }
  await chrome.storage.session.set({ ['tab:' + tabId]: res ? { ...res, url } : { url, error: true } })
  badge(tabId, res)
  if (res?.is_phishing) {
    const warn = chrome.runtime.getURL('warning.html') + '?u=' + encodeURIComponent(url)
    chrome.tabs.update(tabId, { url: warn })
  }
})

// Badge per-tab di-reset Chrome saat halaman commit; pasang ulang setelah selesai load.
chrome.webNavigation.onCompleted.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0 || !/^https?:/.test(url)) return
  const res = await getSession('tab:' + tabId)
  if (res?.url === url) badge(tabId, res.error ? null : res)
})

chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove('tab:' + tabId))

// Menu klik kanan pada link: buka halaman Cek Link Saring tanpa membuka link-nya.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'saring-check', title: 'Cek link dengan Saring', contexts: ['link'] })
})
chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === 'saring-check' && info.linkUrl) {
    chrome.tabs.create({ url: `${SARING_WEB}/#/cek?u=${encodeURIComponent(info.linkUrl)}` })
  }
})
