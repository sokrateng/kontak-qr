/** Listede bir öğeyi `from` konumundan `to` konumuna taşır. Yeni liste döner, girdi değişmez. */
export function moveItem<T>(list: readonly T[], from: number, to: number): readonly T[] {
  if (from < 0 || from >= list.length) return list
  const target = Math.max(0, Math.min(list.length - 1, to))
  if (target === from) return list
  const next = [...list]
  const item = next.splice(from, 1)[0]
  if (item === undefined) return list
  next.splice(target, 0, item)
  return next
}
