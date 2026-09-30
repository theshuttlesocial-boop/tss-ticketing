import { ImageResponse } from 'next/og'

// The card shown when the site is shared on WhatsApp, Instagram DMs, iMessage, etc.
export const alt = 'The Shuttle Social: badminton that’s social. Thursdays and Fridays in West London.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const TEXT = 'the shuttle social Badminton that’s social. Book a session Thursdays & Fridays · West London · £10'

/** Urbanist as TTF for the image renderer (it can't read woff2). Falls back to the default font if offline. */
async function urbanist(weight: 800 | 900) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Urbanist:wght@${weight}&text=${encodeURIComponent(TEXT)}`)).text()
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    return src ? { name: 'Urbanist', data: await (await fetch(src)).arrayBuffer(), weight, style: 'normal' as const } : null
  } catch {
    return null
  }
}

export default async function OpengraphImage() {
  const fonts = (await Promise.all([urbanist(800), urbanist(900)])).filter((f) => f !== null)
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, fontFamily: 'Urbanist', background: 'linear-gradient(135deg, #0B2E1B 0%, #155A34 40%, #2E9A5C 75%, #9BDB7A 100%)', color: '#F4F7EC' }}>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>the shuttle social</div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 112, fontWeight: 900, lineHeight: 0.95, letterSpacing: -4 }}>
          <span>Badminton that’s</span>
          <span style={{ display: 'flex', marginTop: 14 }}>
            <span style={{ border: '4px solid #D9F46B', borderRadius: 14, padding: '0 22px 10px', color: '#D9F46B' }}>social.</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 32, fontWeight: 800 }}>
          <span style={{ background: '#D9F46B', color: '#0F2A1A', borderRadius: 999, padding: '14px 30px' }}>Book a session</span>
          <span>Thursdays &amp; Fridays · West London · £10</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
