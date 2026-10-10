let clearTimer = 0
let lastCopied = ''

/** Copy secret and wipe clipboard later if still unchanged. */
export async function copySecure(
  text: string,
  toast: (t: string) => void,
  label = 'Copied',
  clearAfterMs = 25_000,
) {
  await navigator.clipboard.writeText(text)
  lastCopied = text
  toast(`${label} · clipboard clears in ${Math.round(clearAfterMs / 1000)}s`)
  if (clearTimer) window.clearTimeout(clearTimer)
  clearTimer = window.setTimeout(async () => {
    try {
      const cur = await navigator.clipboard.readText()
      if (cur === lastCopied) {
        await navigator.clipboard.writeText('')
        toast('Clipboard cleared')
      }
    } catch {
      /* permissions */
    }
  }, clearAfterMs)
}

export async function copyLoginThenPassword(
  username: string,
  password: string,
  toast: (t: string) => void,
) {
  await copySecure(username, toast, 'Username copied', 8_000)
  window.setTimeout(() => {
    copySecure(password, toast, 'Password copied', 25_000).catch(() => undefined)
  }, 900)
}
