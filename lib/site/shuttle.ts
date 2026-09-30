/**
 * Geometry for the hero's feather shuttlecock, drawn in simple 3D in a 400×470 box:
 * 16 overlapping feathers on a cone (each with a shaft and individual barbs),
 * two thread rings and a cork with a band. Pure maths, so it renders the same
 * on the server and in the browser.
 *
 * t: time in seconds-ish (drives the slow spin and float), mx/my: pointer 0–1.
 */
export type Feather = { z: number; d: string; barbs: string; barbsDark: string; shaft: string; fill: string }

export function shuttleGeometry(t: number, mx = 0.5, my = 0.5) {
  const n = 16, cx = 200, baseY = 330, topY = 60, r0 = 38, R = 150
  const e = 0.2 + (0.5 - my) * 0.14                // view elevation: how much of the top we see
  const spin = t * 0.35 + (mx - 0.5) * 1.2
  const P = (r: number, y: number, th: number): [number, number] => [cx + r * Math.cos(th), y + r * e * Math.sin(th)]
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u
  const f1 = (p: [number, number]) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)

  const feathers: Feather[] = []
  for (let k = 0; k < n; k++) {
    const th = spin + (k / n) * Math.PI * 2
    const at = (u: number) => P(lerp(r0, R, u), lerp(baseY, topY, u), th)
    // The vane lies along the cone's tangent, so it is seen edge-on at the sides.
    const tan: [number, number] = [-Math.sin(th), e * Math.cos(th)]
    const tl = Math.hypot(tan[0], tan[1]) || 1
    const T: [number, number] = [(tan[0] / tl) * Math.max(0.18, tl), (tan[1] / tl) * Math.max(0.18, tl)]
    const hw = (u: number) => 34 * (0.12 + 0.88 * Math.pow(Math.max(0, (u - 0.36) / 0.64), 0.7))
    const off = (p: [number, number], w: number): [number, number] => [p[0] + T[0] * w, p[1] + T[1] * w]

    const b = at(0), tip = at(1)
    const dl = Math.hypot(tip[0] - b[0], tip[1] - b[1])
    const crown: [number, number] = [tip[0] + ((tip[0] - b[0]) / dl) * 16, tip[1] + ((tip[1] - b[1]) / dl) * 16]
    const us = [0.36, 0.45, 0.55, 0.65, 0.75, 0.84, 0.92]
    const L = us.map((u) => off(at(u), -hw(u)))
    const Rr = us.map((u) => off(at(u), hw(u)))
    let d = 'M ' + f1(at(0.36))
    L.forEach((p) => { d += ' L ' + f1(p) })
    d += ' Q ' + f1(off(crown, -20)) + ' ' + f1(crown)
    d += ' Q ' + f1(off(crown, 20)) + ' ' + f1(Rr[Rr.length - 1])
    for (let j = Rr.length - 2; j >= 0; j--) d += ' L ' + f1(Rr[j])
    d += ' Z'

    const facing = Math.sin(th)
    const step = facing >= 0 ? 0.028 : 0.06        // fewer barbs on the back feathers
    let barbs = '', barbsDark = '', flip = 0
    for (let u = 0.4; u < 0.97; u += step) {
      const c = at(u), u2 = Math.min(1, u + 0.055)
      for (const sgn of [-1, 1]) {
        const seg = 'M ' + f1(c) + ' Q ' + f1(off(at(u + 0.012), hw(u) * 0.55 * sgn)) + ' ' + f1(off(at(u2), hw(u2) * 0.97 * sgn)) + ' '
        if (flip++ % 3 === 2) barbsDark += seg; else barbs += seg
      }
    }
    const light = 0.5 + 0.5 * facing
    const side = 0.5 + 0.5 * Math.cos(th + 0.6)
    feathers.push({
      z: facing, d, barbs, barbsDark,
      shaft: 'M ' + f1(b) + ' L ' + f1(tip),
      fill: `hsl(${96 + Math.round(18 * (1 - light))}, ${Math.round(46 + 18 * light)}%, ${Math.round(30 + 34 * light + 8 * side)}%)`,
    })
  }
  feathers.sort((a, b) => a.z - b.z)

  const ring = (u: number, front: boolean) => {
    const r = lerp(r0, R, u), y = lerp(baseY, topY, u), ry = (r * e).toFixed(1)
    return front ? `M ${cx + r} ${y} A ${r} ${ry} 0 0 1 ${cx - r} ${y}` : `M ${cx - r} ${y} A ${r} ${ry} 0 0 1 ${cx + r} ${y}`
  }
  const rc = r0 + 14, band = 18, dome = rc * 1.1, rcy = (rc * e).toFixed(1)
  return {
    back: feathers.filter((f) => f.z < 0),
    front: feathers.filter((f) => f.z >= 0),
    ringBack: ring(0.3, false) + ' ' + ring(0.5, false),
    ringFront: ring(0.3, true) + ' ' + ring(0.5, true),
    ringFrontShade: ring(0.31, true) + ' ' + ring(0.51, true),
    baseY, corkRx: rc, corkRy: rcy,
    band: `M ${cx - rc} ${baseY} L ${cx - rc} ${baseY + band} A ${rc} ${rcy} 0 0 0 ${cx + rc} ${baseY + band} L ${cx + rc} ${baseY} A ${rc} ${rcy} 0 0 1 ${cx - rc} ${baseY} Z`,
    cork: `M ${cx - rc} ${baseY + band} A ${rc} ${dome.toFixed(1)} 0 0 0 ${cx + rc} ${baseY + band} Z`,
    tilt: `rotate(${((mx - 0.5) * 30 - 10 + Math.sin(t * 0.8) * 4).toFixed(2)} 200 250) translate(0 ${(Math.sin(t * 1.1) * 8).toFixed(1)})`,
  }
}
