import QRCode from 'qrcode'

/**
 * QR as an inline SVG string, generated on the server.
 *
 * Uses the `qrcode` package rather than a hand-rolled encoder: a first attempt
 * at writing one produced a matrix differing from the reference in 97 modules,
 * and a QR that looks right but does not scan is worse than none.
 */
export function qrSvg(text: string, px = 128): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: px,
    color: { dark: '#000000', light: '#ffffff' },
  })
}
