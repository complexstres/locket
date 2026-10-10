export type Brand = {
  id: string
  name: string
  domain: string
  keywords: string[]
}

export const BRANDS: Brand[] = [
  { id: 'google', name: 'Google', domain: 'google.com', keywords: ['google', 'gmail', 'youtube', 'gmail.com'] },
  { id: 'github', name: 'GitHub', domain: 'github.com', keywords: ['github'] },
  { id: 'hackthebox', name: 'HackTheBox', domain: 'hackthebox.com', keywords: ['hackthebox', 'htb'] },
  { id: 'tryhackme', name: 'TryHackMe', domain: 'tryhackme.com', keywords: ['tryhackme', 'thm'] },
  { id: 'bitcointalk', name: 'Bitcointalk', domain: 'bitcointalk.org', keywords: ['bitcointalk', 'bitckoitalk', 'bitckointalk'] },
  { id: 'firstvds', name: 'FirstVDS', domain: 'firstvds.ru', keywords: ['firstvds'] },
  { id: 'gazprom', name: 'Gazprom Energo', domain: 'gesbt.ru', keywords: ['газпром', 'gesbt', 'lkf.gesbt'] },
  { id: 'gitlab', name: 'GitLab', domain: 'gitlab.com', keywords: ['gitlab'] },
  { id: 'bitbucket', name: 'Bitbucket', domain: 'bitbucket.org', keywords: ['bitbucket'] },
  { id: 'apple', name: 'Apple', domain: 'apple.com', keywords: ['apple', 'icloud', 'apple id'] },
  { id: 'microsoft', name: 'Microsoft', domain: 'microsoft.com', keywords: ['microsoft', 'outlook', 'hotmail', 'live.com', 'office365', 'xbox'] },
  { id: 'discord', name: 'Discord', domain: 'discord.com', keywords: ['discord'] },
  { id: 'telegram', name: 'Telegram', domain: 'telegram.org', keywords: ['telegram'] },
  { id: 'whatsapp', name: 'WhatsApp', domain: 'whatsapp.com', keywords: ['whatsapp'] },
  { id: 'signal', name: 'Signal', domain: 'signal.org', keywords: ['signal'] },
  { id: 'instagram', name: 'Instagram', domain: 'instagram.com', keywords: ['instagram', 'insta'] },
  { id: 'facebook', name: 'Facebook', domain: 'facebook.com', keywords: ['facebook', 'meta'] },
  { id: 'twitter', name: 'X / Twitter', domain: 'x.com', keywords: ['twitter', 'x.com'] },
  { id: 'netflix', name: 'Netflix', domain: 'netflix.com', keywords: ['netflix'] },
  { id: 'spotify', name: 'Spotify', domain: 'spotify.com', keywords: ['spotify'] },
  { id: 'steam', name: 'Steam', domain: 'steampowered.com', keywords: ['steam'] },
  { id: 'amazon', name: 'Amazon', domain: 'amazon.com', keywords: ['amazon', 'aws'] },
  { id: 'ebay', name: 'eBay', domain: 'ebay.com', keywords: ['ebay'] },
  { id: 'paypal', name: 'PayPal', domain: 'paypal.com', keywords: ['paypal'] },
  { id: 'yandex', name: 'Yandex', domain: 'yandex.ru', keywords: ['yandex', 'яндекс', 'ya.ru'] },
  { id: 'mailru', name: 'Mail.ru', domain: 'mail.ru', keywords: ['mail.ru', 'mailru', 'bk.ru', 'inbox.ru', 'list.ru'] },
  { id: 'vk', name: 'VK', domain: 'vk.com', keywords: ['вконтакте', 'vkontakte', 'vk.com'] },
  { id: 'ok', name: 'Odnoklassniki', domain: 'ok.ru', keywords: ['одноклассники', 'ok.ru'] },
  { id: 'tiktok', name: 'TikTok', domain: 'tiktok.com', keywords: ['tiktok'] },
  { id: 'reddit', name: 'Reddit', domain: 'reddit.com', keywords: ['reddit'] },
  { id: 'twitch', name: 'Twitch', domain: 'twitch.tv', keywords: ['twitch'] },
  { id: 'dropbox', name: 'Dropbox', domain: 'dropbox.com', keywords: ['dropbox'] },
  { id: 'notion', name: 'Notion', domain: 'notion.so', keywords: ['notion'] },
  { id: 'slack', name: 'Slack', domain: 'slack.com', keywords: ['slack'] },
  { id: 'zoom', name: 'Zoom', domain: 'zoom.us', keywords: ['zoom'] },
  { id: 'adobe', name: 'Adobe', domain: 'adobe.com', keywords: ['adobe', 'photoshop', 'creative cloud'] },
  { id: 'openai', name: 'OpenAI', domain: 'openai.com', keywords: ['openai', 'chatgpt'] },
  { id: 'anthropic', name: 'Anthropic', domain: 'anthropic.com', keywords: ['anthropic', 'claude'] },
  { id: 'cursor', name: 'Cursor', domain: 'cursor.com', keywords: ['cursor'] },
  { id: 'cloudflare', name: 'Cloudflare', domain: 'cloudflare.com', keywords: ['cloudflare'] },
  { id: 'digitalocean', name: 'DigitalOcean', domain: 'digitalocean.com', keywords: ['digitalocean'] },
  { id: 'heroku', name: 'Heroku', domain: 'heroku.com', keywords: ['heroku'] },
  { id: 'vercel', name: 'Vercel', domain: 'vercel.com', keywords: ['vercel'] },
  { id: 'netlify', name: 'Netlify', domain: 'netlify.com', keywords: ['netlify'] },
  { id: 'npm', name: 'npm', domain: 'npmjs.com', keywords: ['npmjs', 'npm '] },
  { id: 'docker', name: 'Docker', domain: 'docker.com', keywords: ['docker', 'dockerhub'] },
  { id: 'figma', name: 'Figma', domain: 'figma.com', keywords: ['figma'] },
  { id: 'canva', name: 'Canva', domain: 'canva.com', keywords: ['canva'] },
  { id: 'linkedin', name: 'LinkedIn', domain: 'linkedin.com', keywords: ['linkedin'] },
  { id: 'uber', name: 'Uber', domain: 'uber.com', keywords: ['uber'] },
  { id: 'airbnb', name: 'Airbnb', domain: 'airbnb.com', keywords: ['airbnb'] },
  { id: 'booking', name: 'Booking', domain: 'booking.com', keywords: ['booking'] },
  { id: 'binance', name: 'Binance', domain: 'binance.com', keywords: ['binance'] },
  { id: 'bybit', name: 'Bybit', domain: 'bybit.com', keywords: ['bybit'] },
  { id: 'coinbase', name: 'Coinbase', domain: 'coinbase.com', keywords: ['coinbase'] },
  { id: 'mexc', name: 'MEXC', domain: 'mexc.com', keywords: ['mexc'] },
  { id: 'nicehash', name: 'NiceHash', domain: 'nicehash.com', keywords: ['nicehash'] },
  { id: 'viabtc', name: 'ViaBTC', domain: 'viabtc.com', keywords: ['viabtc'] },
  { id: 'emcd', name: 'EMCD', domain: 'emcd.io', keywords: ['emcd'] },
  { id: 'trustpool', name: 'Trustpool', domain: 'trustpool.ru', keywords: ['trustpool'] },
  { id: 'ultimus', name: 'Ultimuspool', domain: 'ultimuspool.com', keywords: ['ultimuspool', 'ultimus'] },
  { id: 'mrr', name: 'MiningRigRentals', domain: 'miningrigrentals.com', keywords: ['miningrigrentals', 'mrr'] },
  { id: 'tinkoff', name: 'T-Bank', domain: 'tbank.ru', keywords: ['tinkoff', 'тинькофф', 't-bank', 'тбанк', 'tbank'] },
  { id: 'sber', name: 'Sber', domain: 'sberbank.ru', keywords: ['sber', 'сбер', 'sberbank'] },
  { id: 'alfa', name: 'Alfa-Bank', domain: 'alfabank.ru', keywords: ['alfa', 'альфа', 'alfabank'] },
  { id: 'riot', name: 'Riot Games', domain: 'riotgames.com', keywords: ['riot', 'valorant', 'league of legends'] },
  { id: 'epic', name: 'Epic Games', domain: 'epicgames.com', keywords: ['epic games', 'fortnite', 'epicgames'] },
  { id: 'playstation', name: 'PlayStation', domain: 'playstation.com', keywords: ['playstation', 'psn'] },
  { id: 'xbox', name: 'Xbox', domain: 'xbox.com', keywords: ['xbox'] },
  { id: 'nintendo', name: 'Nintendo', domain: 'nintendo.com', keywords: ['nintendo', 'switch'] },
  { id: 'battle', name: 'Battle.net', domain: 'battle.net', keywords: ['battle.net', 'blizzard'] },
  { id: 'roblox', name: 'Roblox', domain: 'roblox.com', keywords: ['roblox'] },
  { id: 'wildberries', name: 'Wildberries', domain: 'wildberries.ru', keywords: ['wildberries', 'wb'] },
  { id: 'ozon', name: 'Ozon', domain: 'ozon.ru', keywords: ['ozon'] },
  { id: 'avito', name: 'Avito', domain: 'avito.ru', keywords: ['avito'] },
  { id: 'hh', name: 'hh.ru', domain: 'hh.ru', keywords: ['hh.ru', 'headhunter'] },
  { id: 'proton', name: 'Proton', domain: 'proton.me', keywords: ['proton', 'protonmail'] },
  { id: '1password', name: '1Password', domain: '1password.com', keywords: ['1password'] },
  { id: 'bitwarden', name: 'Bitwarden', domain: 'bitwarden.com', keywords: ['bitwarden'] },
]

function domainFromUrl(url: string): string | null {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function keywordMatch(hay: string, keyword: string): boolean {
  const k = keyword.toLowerCase().trim()
  if (!k) return false
  if (k.length <= 2) {
    return new RegExp(`(^|[^a-zа-я0-9])${k}([^a-zа-я0-9]|$)`, 'i').test(hay)
  }
  return hay.includes(k)
}

export function detectBrand(title = '', url = '', issuer = ''): Brand | null {
  const hay = `${title} ${url} ${issuer}`.toLowerCase()
  const host = domainFromUrl(url)

  if (host) {
    const byDomain = BRANDS.find(
      (b) => host === b.domain || host.endsWith(`.${b.domain}`) || b.domain === host,
    )
    if (byDomain) return byDomain
  }

  // longer keywords first to avoid weak matches
  const ranked = [...BRANDS].sort(
    (a, b) => Math.max(...b.keywords.map((k) => k.length)) - Math.max(...a.keywords.map((k) => k.length)),
  )
  for (const b of ranked) {
    if (b.keywords.some((k) => keywordMatch(hay, k))) return b
  }

  // exact short titles like "VK"
  const t = title.trim().toLowerCase()
  if (t === 'vk' || t === 'вк') return BRANDS.find((b) => b.id === 'vk') || null

  return null
}

export function brandLogoUrl(brand: Brand, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(brand.domain)}&sz=${size}`
}

export function faviconForUrl(url: string, size = 64): string | null {
  const host = domainFromUrl(url)
  if (!host) return null
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`
}

export function resolveIcon(title = '', url = '', issuer = ''): { src: string; letter: string; brand?: Brand } {
  const brand = detectBrand(title, url, issuer)
  if (brand) return { src: brandLogoUrl(brand), letter: brand.name[0]!.toUpperCase(), brand }
  const fav = faviconForUrl(url)
  if (fav) return { src: fav, letter: (title || hostLetter(url) || '?')[0]!.toUpperCase() }
  const letter = (title || issuer || '?').trim()[0]?.toUpperCase() || '?'
  return { src: '', letter }
}

function hostLetter(url: string) {
  return domainFromUrl(url)?.[0] || ''
}
