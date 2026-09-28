import { useEffect, useRef, useState } from 'react'

export interface Series {
  name: string
  /** CSS color, normally var(--series-1) / var(--series-2). */
  color: string
  values: number[]
}

const PAD = { top: 8, right: 4, bottom: 22, left: 30 }

/** Bar with rounded top corners, anchored flat on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/**
 * Grouped bar chart over time buckets, with hover tooltip, legend (2+ series) and a table view.
 * With `onSelect` each period is also a button (#37) - one tab stop for the chart, arrow keys move
 * between periods - and so is each count in the table view, the full-size target on a phone.
 */
export function BarChart({ title, labels, series, current, height = 170, onSelect, unit = ['lead', 'leads'] }: {
  title: string
  labels: string[]
  series: Series[]
  /** Index of the bucket that contains now (today / this week / this month) - shaded and labelled. */
  current?: number
  height?: number
  /** Open what is behind one period's value; gets the control that asked, for focus to return to. */
  onSelect?: (i: number, opener: HTMLElement) => void
  /** What the values count, singular and plural, for the controls' names. */
  unit?: [string, string]
}) {
  const [hover, setHover] = useState<number | null>(null)
  /** The period button that holds the chart's single tab stop. */
  const [active, setActive] = useState(current ?? 0)
  const bars = useRef<(HTMLButtonElement | null)[]>([])
  // Drawn at the container's real width, so labels keep their size on a phone instead of shrinking with the chart.
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(600)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))))
    observer.observe(box.current!)
    return () => observer.disconnect()
  }, [])
  const n = labels.length
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  // Whole-number ticks: 0, half, top.
  const top = max <= 2 ? max : Math.ceil(max / 2) * 2
  const ticks = top <= 1 ? [0, top] : [0, top / 2, top]
  const groupW = plotW / Math.max(1, n)
  const gap = 2
  const barW = Math.max(2, Math.min(18, (groupW * 0.8 - gap * (series.length - 1)) / series.length))
  const groupBarsW = barW * series.length + gap * (series.length - 1)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  // As many date labels as fit, about one per 56px.
  const every = Math.ceil(n / Math.max(2, Math.floor(plotW / 56)))
  // The current bucket's label always shows; drop a regular label that would crowd it.
  const showLabel = (i: number) => i === current || (i % every === 0 && (current === undefined || Math.abs(current - i) >= every))
  const totals = series.map((s) => s.values.reduce((a, b) => a + b, 0))
  const valueName = (i: number) => `${title}, ${labels[i]}: ${series.map((s) => {
    const v = s.values[i] ?? 0
    return `${series.length > 1 ? `${s.name} ` : ''}${v} ${v === 1 ? unit[0] : unit[1]}`
  }).join(', ')}`
  const pct = (part: number, whole: number) => `${(part / whole) * 100}%`
  function step(e: React.KeyboardEvent, i: number) {
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    const to = Math.max(0, Math.min(n - 1, next))
    setActive(to)
    bars.current[to]?.focus()
  }

  return (
    <figure className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--ink)]">{title}</span>
        {series.length > 1 ? (
          <span className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
            {series.map((s, i) => (
              <span key={s.name} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {s.name} <strong className="tabular-nums text-[var(--ink)]">{totals[i]}</strong>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-xs text-[var(--muted)]">total <strong className="tabular-nums text-[var(--ink)]">{totals[0]}</strong></span>
        )}
      </figcaption>

      <div ref={box} className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" role="img" aria-label={`${title}: ${series.map((s, i) => `${s.name} ${totals[i]}`).join(', ')}`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">{t}</text>
            </g>
          ))}
          {current !== undefined && (
            <rect x={PAD.left + current * groupW} y={PAD.top} width={groupW} height={plotH} rx={4} fill="color-mix(in srgb, var(--ink) 8%, transparent)" stroke="color-mix(in srgb, var(--ink) 35%, transparent)" strokeDasharray="3 3" />
          )}
          {hover !== null && <rect x={PAD.left + hover * groupW} y={PAD.top} width={groupW} height={plotH} fill="var(--line)" />}
          {labels.map((label, i) => {
            const gx = PAD.left + i * groupW + (groupW - groupBarsW) / 2
            return (
              <g key={i}>
                {series.map((s, k) => {
                  const v = s.values[i] ?? 0
                  if (v <= 0) return null
                  return <path key={s.name} d={barPath(gx + k * (barW + gap), y(v), barW, PAD.top + plotH - y(v))} fill={s.color} />
                })}
                {showLabel(i) && (
                  <text
                    x={Math.min(W - PAD.right - 2, Math.max(PAD.left + 2, PAD.left + i * groupW + groupW / 2))}
                    y={height - 6}
                    textAnchor={i === current && i === n - 1 ? 'end' : 'middle'}
                    fontSize={i === current ? 11 : 10}
                    fontWeight={i === current ? 700 : 400}
                    fill={i === current ? 'var(--ink)' : 'var(--muted)'}
                  >
                    {label}
                  </text>
                )}
                {/* Hit target: the whole column, not just the bar. */}
                <rect x={PAD.left + i * groupW} y={PAD.top} width={groupW} height={plotH} fill="transparent" onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(i) }} onClick={() => setHover((h) => (h === i ? null : i))} />
              </g>
            )
          })}
        </svg>
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-xs shadow-[var(--shadow-card)]"
            style={{ left: `${Math.min(88, Math.max(12, ((PAD.left + (hover + 0.5) * groupW) / W) * 100))}%` }}
          >
            <div className="font-semibold text-[var(--ink)]">{labels[hover]}</div>
            {series.map((s) => (
              <div key={s.name} className="mt-0.5 flex items-center gap-1.5 text-[var(--muted)]">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.name} <strong className="tabular-nums text-[var(--ink)]">{s.values[hover] ?? 0}</strong>
              </div>
            ))}
          </div>
        )}
        {onSelect && (
          <div
            role="group"
            aria-label={`${title} by period - arrow keys move, Enter shows the ${unit[1]}`}
            className="absolute"
            style={{ left: pct(PAD.left, W), width: pct(plotW, W), top: pct(PAD.top, height), height: pct(plotH, height) }}
            onPointerLeave={() => setHover(null)}
          >
            {labels.map((_, i) => (
              <button
                key={i}
                ref={(el) => { bars.current[i] = el }}
                type="button"
                data-chart-bar=""
                tabIndex={i === active ? 0 : -1}
                aria-label={valueName(i)}
                onFocus={() => { setActive(i); setHover(i) }}
                onBlur={() => setHover(null)}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(i) }}
                onKeyDown={(e) => step(e, i)}
                onClick={(e) => onSelect(i, e.currentTarget)}
                // Narrower than a fingertip on a phone; the table view below has a 44px button for each value.
                className="absolute top-0 h-full min-h-0 min-w-0 cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--accent)]"
                style={{ left: pct(i, n), width: pct(1, n) }}
              />
            ))}
          </div>
        )}
      </div>

      <details className="mt-2 text-xs text-[var(--muted)]">
        <summary className="cursor-pointer py-1">Show as table</summary>
        <table className="mt-2 w-full select-text text-left">
          <thead>
            <tr><th className="py-1 font-semibold">Period</th>{series.map((s) => <th key={s.name} className="py-1 text-right font-semibold">{s.name}</th>)}</tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={i} className={`border-t border-[var(--line)] ${i === current ? 'font-semibold text-[var(--ink)]' : ''}`}>
                <td className="py-1">{label}</td>
                {series.map((s) => (
                  <td key={s.name} className="py-1 text-right tabular-nums text-[var(--ink)]">
                    {onSelect
                      ? <button type="button" aria-label={valueName(i)} onClick={(e) => onSelect(i, e.currentTarget)} className="rounded-md px-2 font-semibold text-[var(--accent-deep)] underline-offset-2 hover:underline">{s.values[i] ?? 0}</button>
                      : s.values[i] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
