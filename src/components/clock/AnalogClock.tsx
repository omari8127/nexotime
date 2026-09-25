/** Live analog clock for the kiosk side panel. Purely presentational. */
export function AnalogClock({ now, className }: { now: Date; className?: string }) {
  const s = now.getSeconds()
  const m = now.getMinutes() + s / 60
  const h = (now.getHours() % 12) + m / 60

  const ticks = Array.from({ length: 60 }, (_, i) => i)
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Reloj analógico">
      <circle cx="100" cy="100" r="96" fill="none" stroke="white" strokeOpacity="0.12" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="88" fill="white" fillOpacity="0.03" />
      {ticks.map((i) => {
        const major = i % 5 === 0
        return (
          <line
            key={i}
            x1="100"
            y1={major ? 14 : 16}
            x2="100"
            y2={major ? 26 : 21}
            stroke="white"
            strokeOpacity={major ? 0.7 : 0.25}
            strokeWidth={major ? 2.2 : 1}
            strokeLinecap="round"
            transform={`rotate(${i * 6} 100 100)`}
          />
        )
      })}
      {/* hour */}
      <line
        x1="100" y1="100" x2="100" y2="58"
        stroke="white" strokeWidth="5" strokeLinecap="round"
        transform={`rotate(${h * 30} 100 100)`}
      />
      {/* minute */}
      <line
        x1="100" y1="100" x2="100" y2="34"
        stroke="white" strokeWidth="3.4" strokeLinecap="round"
        transform={`rotate(${m * 6} 100 100)`}
      />
      {/* second */}
      <g transform={`rotate(${s * 6} 100 100)`}>
        <line x1="100" y1="112" x2="100" y2="24" stroke="#7dd3fc" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="100" r="5" fill="#0b1224" stroke="#7dd3fc" strokeWidth="2.4" />
    </svg>
  )
}
