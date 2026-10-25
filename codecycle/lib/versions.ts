/** Versionen wie „0.3.0“ je Stelle numerisch vergleichen (-1, 0, 1); null, wenn eine nicht nur aus Zahlen besteht. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const parts = (v: string): number[] | null => (/^\d+(\.\d+)*$/.test(v.trim()) ? v.trim().split('.').map(Number) : null)
  const x = parts(a)
  const y = parts(b)
  if (!x || !y) return null
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}
