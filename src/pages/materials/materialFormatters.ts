export function formatQty(val: number | undefined | null): string {
  const num = Number(val) || 0
  const rounded = Math.round((num + Number.EPSILON) * 1000) / 1000
  return rounded.toLocaleString('vi-VN', { maximumFractionDigits: 3 })
}
