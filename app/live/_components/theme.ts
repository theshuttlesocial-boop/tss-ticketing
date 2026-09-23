/** Shared with app/admin/page.tsx — same Midnight Green palette. */
export const T = {
  bg:'#080f08', card:'#0f180f', card2:'#142014', border:'#1e3220', borderHover:'#2d4a2d',
  accent:'#6fcf40', accentDim:'rgba(111,207,64,0.1)', accentBorder:'rgba(111,207,64,0.25)',
  text:'#edf5ed', muted:'#6b8a6b', danger:'#e05555', dangerDim:'rgba(224,85,85,0.1)',
  warning:'#e09040', info:'#60b4ff', infoDim:'rgba(96,180,255,0.08)',
}

export const inp = (extra?: object): React.CSSProperties => ({
  width:'100%', background:T.card2, border:`1px solid ${T.border}`, borderRadius:8,
  padding:'10px 13px', color:T.text, fontSize:14, outline:'none',
  boxSizing:'border-box', fontFamily:'inherit', ...extra,
})

export const cardStyle: React.CSSProperties = {
  background:T.card, border:`1px solid ${T.border}`, borderRadius:12,
  overflow:'hidden', marginBottom:16,
}

export const btn = (variant: 'primary'|'ghost'|'danger' = 'ghost'): React.CSSProperties => ({
  padding:'10px 16px', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer',
  fontFamily:'inherit', border:`1px solid ${variant==='primary'?T.accentBorder:variant==='danger'?T.danger:T.border}`,
  background: variant==='primary'?T.accentDim:variant==='danger'?T.dangerDim:T.card2,
  color: variant==='primary'?T.accent:variant==='danger'?T.danger:T.text,
})
