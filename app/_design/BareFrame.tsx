import { urbanist } from './font'
import { themeScript } from './ThemeToggle'
import './tss.css'
import './app.css'

/**
 * V5 design system (Urbanist, colours, dark mode) without a header, for screens that
 * need every pixel: live-session pages on court and the TV board. Pages that want the
 * header render <AppHeader /> themselves. Use as a layout: `export { default } from ...`.
 */
export default function BareFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={`tss ${urbanist.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      {children}
    </div>
  )
}
