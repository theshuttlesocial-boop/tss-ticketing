import type { ReactNode } from 'react'

/** Line icons for the marketing site (no emoji: they render differently on every phone). */
const PATHS = {
  ticket: <><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6z" /><path d="M14 5v2M14 11v2M14 17v2" /></>,
  chat: <path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-5A8.5 8.5 0 1 1 21 12z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M4 7l8 6 8-6" /></>,
  megaphone: <><path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1z" /><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></>,
  hourglass: <><path d="M6 3h12M6 21h12" /><path d="M7.5 3v2.6a4.5 4.5 0 0 0 2 3.7L12 11l2.5-1.7a4.5 4.5 0 0 0 2-3.7V3M7.5 21v-2.6a4.5 4.5 0 0 1 2-3.7L12 13l2.5 1.7a4.5 4.5 0 0 1 2 3.7V21" /></>,
  repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 12v-2a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 12v2a4 4 0 0 1-4 4H3" /></>,
  camera: <><path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.5l1.8-2.5h5.4L16.5 7H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" /><circle cx="12" cy="13" r="3.5" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3.2 4M16 6h3a3 3 0 0 1-3.2 4M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="17" rx="2" /><path d="M9 3h6v3H9zM9 12h6M9 16h4" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20v-.5A5.5 5.5 0 0 1 8 14h2a5.5 5.5 0 0 1 5.5 5.5v.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.2A5.5 5.5 0 0 1 21.5 19v1" /></>,
  shuttle: <><path d="M9.5 17.5h5v1a2.5 2.5 0 0 1-5 0z" /><path d="M9.5 17.5L5.5 4.5M14.5 17.5l4-13M12 17.5V3.5M5.5 4.5c2.2 1.2 4.3 1.6 6.5 1.6s4.3-.4 6.5-1.6M7.6 11.4c1.5.5 2.9.7 4.4.7s2.9-.2 4.4-.7" /></>,
  flame: <path d="M12 3c.8 3 5 5.2 5 10.2a5 5 0 0 1-10 0c0-2.1 1-3.6 2.1-4.6 0 1.9.9 3 2 3.2C11 9 10.4 6.3 12 3z" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />,
  gift: <><rect x="4" y="11" width="16" height="9.5" rx="1.5" /><rect x="3" y="7" width="18" height="4" rx="1" /><path d="M12 7v13.5M12 7C10.5 4 7 3.8 7 5.8S10 7 12 7zm0 0c1.5-3 5-3.2 5-1.2S14 7 12 7z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  star: <path d="M12 3.5l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L12 15.9l-5 2.8 1.2-5.6L4 9.3l5.6-.6z" />,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  pin: <><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  shield: <><path d="M12 3l7.5 3v5.6c0 4.5-3.2 8.1-7.5 9.4-4.3-1.3-7.5-4.9-7.5-9.4V6z" /><path d="M9 12l2 2 4-4" /></>,
  scale: <><path d="M12 4v16M6 20h12M4 8h16" /><path d="M7 8l-3 6.5a3 3 0 0 0 6 0zM17 8l-3 6.5a3 3 0 0 0 6 0z" /></>,
  home: <><path d="M3.5 11L12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5M10 20v-5h4v5" /></>,
  hand: <><path d="M7 11.5V6a1.5 1.5 0 0 1 3 0v5M10 10.5V4.5a1.5 1.5 0 0 1 3 0v6M13 10.5V5.5a1.5 1.5 0 0 1 3 0v6M16 11V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6.5 6.5 0 0 1-5.2-2.6L3.6 15a1.6 1.6 0 0 1 2.4-2.1L7 14" /></>,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.2 6.8h.01" /></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
