import { useEffect, useState } from 'react'
import { resolveIcon } from './brands'

export function BrandIcon({
  title = '',
  url = '',
  issuer = '',
  size = 28,
}: {
  title?: string
  url?: string
  issuer?: string
  size?: number
}) {
  const icon = resolveIcon(title, url, issuer)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [icon.src, title, url, issuer])

  if (!icon.src || failed) {
    return (
      <span
        className="brand-fallback"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
        aria-hidden
      >
        {icon.letter}
      </span>
    )
  }

  return (
    <img
      className="brand-logo"
      src={icon.src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}
