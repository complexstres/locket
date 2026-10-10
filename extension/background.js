import { matchHost, getToken } from './api.js'

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg.type === 'MATCH') {
        const token = await getToken()
        if (!token) {
          sendResponse({ ok: false, error: 'No token — open extension settings' })
          return
        }
        const list = await matchHost(msg.host)
        sendResponse({ ok: true, list })
        return
      }
      if (msg.type === 'PING') {
        sendResponse({ ok: true })
        return
      }
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : 'Error' })
    }
  })()
  return true
})
