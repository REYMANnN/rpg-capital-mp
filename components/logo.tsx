export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { text: 'text-lg', bar: 'h-5', tagline: 'text-xs' },
    md: { text: 'text-2xl', bar: 'h-7', tagline: 'text-sm' },
    lg: { text: 'text-4xl', bar: 'h-10', tagline: 'text-base' },
  }
  const s = sizes[size]
  return (
    <div className="flex flex-col items-start">
      <div className={`flex items-center gap-2 ${s.text}`}>
        <span className="font-black text-white tracking-tight">RPG</span>
        <div className={`w-px ${s.bar} bg-white/40`} />
        <span className="font-light text-white tracking-wide">Capital</span>
      </div>
      {size !== 'sm' && (
        <p className={`${s.tagline} text-white/70 mt-0.5`}>Pagamentos simples. Crédito justo.</p>
      )}
    </div>
  )
}
