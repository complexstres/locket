import { getToken, setToken, status } from './api.js'

const tokenEl = document.getElementById('token')
const msg = document.getElementById('msg')

getToken().then((t) => {
  tokenEl.value = t || ''
})

document.getElementById('save').addEventListener('click', async () => {
  const t = tokenEl.value.trim()
  await setToken(t)
  try {
    const st = await status()
    msg.textContent = st.unlocked
      ? 'Saved · Locket online'
      : 'Token saved, but vault is locked — open Locket'
  } catch {
    msg.textContent = 'Token saved · start Locket to verify'
  }
})
