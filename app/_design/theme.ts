import type { CSSProperties } from 'react'

/**
 * Inline-style helpers for app screens in the V5 design (T, inp, btn, cardStyle).
 * Every colour is a design-system variable, so it follows light/dark mode. Only use inside a .tss wrapper (AppFrame or a layout that
 * renders one). Stripe and other third parties need real colours: see stripeAppearance.
 */
export const T = {
  bg: 'var(--page)', card: 'var(--card)', card2: 'var(--card-2)', border: 'var(--line)', borderHover: 'var(--accent-line)',
  accent: 'var(--accent)', accentDim: 'var(--accent-dim)', accentBorder: 'var(--accent-line)',
  text: 'var(--ink)', muted: 'var(--muted)', danger: 'var(--danger)', dangerDim: 'var(--danger-dim)',
  warning: 'var(--warn)', info: 'var(--info)', infoDim: 'var(--info-dim)',
  /** The glowing lime main action (same look as the Book button). */
  cta: 'linear-gradient(115deg, #F2FF9E 0%, #D9F46B 45%, #9FE8BE 100%)',
  onCta: '#0F2A1A',
  ctaGlow: '0 0 0 4px rgba(217, 244, 107, 0.22), 0 16px 34px -12px rgba(190, 240, 90, 0.75)',
}

export const inp = (extra?: object): CSSProperties => ({
  width: '100%', background: 'var(--field)', border: '1px solid var(--line)', borderRadius: 14,
  padding: '12px 14px', color: 'var(--ink)', fontSize: 16, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit', ...extra,
})

export const cardStyle: CSSProperties = {
  background: T.card, border: `1px solid ${T.border}`, borderRadius: 24,
  overflow: 'hidden', marginBottom: 16,
}

export const btn = (variant: 'primary' | 'ghost' | 'danger' = 'ghost'): CSSProperties => ({
  padding: '12px 20px', borderRadius: 999, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  border: variant === 'primary' ? '0' : `1px solid ${variant === 'danger' ? T.danger : T.border}`,
  background: variant === 'primary' ? T.cta : variant === 'danger' ? T.dangerDim : T.card2,
  color: variant === 'primary' ? T.onCta : variant === 'danger' ? T.danger : T.text,
  boxShadow: variant === 'primary' ? T.ctaGlow : 'none',
})

/** Big tick / status mark used on confirmation screens. */
export const doneMark: CSSProperties = {
  width: 72, height: 72, borderRadius: '50%', background: '#D9F46B', color: '#0F2A1A', margin: '0 auto 14px',
  display: 'grid', placeItems: 'center', fontSize: 32, fontWeight: 900,
}

/** Stripe's payment form can't read CSS variables: give it real colours for the current theme. */
export function stripeAppearance() {
  const set = document.documentElement.dataset.theme
  const dark = set ? set === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  return {
    fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Urbanist:wght@500;600;700&display=swap' }],
    appearance: {
      theme: (dark ? 'night' : 'stripe') as 'night' | 'stripe',
      variables: {
        colorPrimary: dark ? '#D9F46B' : '#1E6B3E', colorBackground: dark ? '#0C1D14' : '#FFFFFF',
        colorText: dark ? '#EEF3E6' : '#0F2A1A', colorDanger: dark ? '#F28B82' : '#B42318',
        fontFamily: 'Urbanist, system-ui, sans-serif', fontSizeBase: '16px', borderRadius: '14px',
      },
    },
  }
}
