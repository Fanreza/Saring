const url = new URLSearchParams(location.search).get('u') ?? ''
document.getElementById('url').textContent = url

chrome.storage.session.get('c:' + url).then(({ ['c:' + url]: res }) => {
  if (!res) return
  document.getElementById('pct').textContent = Math.round(res.score * 100) + '%'
  document.getElementById('score').hidden = false
  const ul = document.getElementById('reasons')
  for (const r of res.reasons ?? []) {
    const li = document.createElement('li')
    li.textContent = r.label
    ul.append(li)
  }
})

document.getElementById('back').onclick = async () => {
  const tab = await chrome.tabs.getCurrent()
  chrome.tabs.update(tab.id, { url: 'chrome://newtab/' })
}

document.getElementById('proceed').onclick = async () => {
  if (!/^https?:/.test(url)) return
  await chrome.storage.session.set({ ['bypass:' + url]: true })
  location.href = url
}
