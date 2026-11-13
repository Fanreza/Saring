const box = document.getElementById('status')
const title = document.getElementById('title')
const sub = document.getElementById('sub')
const toggle = document.getElementById('enabled')
document.getElementById('web').href = SARING_WEB

chrome.storage.local.get('enabled').then(({ enabled = true }) => { toggle.checked = enabled })
toggle.onchange = () => chrome.storage.local.set({ enabled: toggle.checked })

chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  const res = (await chrome.storage.session.get('tab:' + tab.id))['tab:' + tab.id]
  if (!res) return
  document.getElementById('web').href = `${SARING_WEB}/cek?u=${encodeURIComponent(res.url)}`
  if (res.error) {
    title.textContent = 'Server tidak bisa dihubungi'
    sub.textContent = ''
    return
  }
  box.className = res.is_phishing ? 'bad' : 'good'
  title.textContent = res.is_phishing ? 'Kemungkinan phishing' : res.model === 'allowlist' ? 'Situs terpercaya' : 'Halaman ini aman'
  sub.textContent = (res.model === 'allowlist' ? '' : `Skor ${Math.round(res.score * 100)}% · `) + new URL(res.url).hostname
})
