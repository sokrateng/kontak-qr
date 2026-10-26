/**
 * Tutamaçla (`[data-grip]`) sürükleyerek sıralama. Satırlar `.person` öğeleridir.
 * Taşıma bittiğinde yeni konum `onCommit` ile bildirilir, veri güncellemesi çağıranın işidir.
 */
export type DragCommit = (list: HTMLElement, from: number, target: number) => void

interface DragState {
  readonly pointerId: number
  readonly scroller: HTMLElement
  readonly list: HTMLElement
  readonly items: readonly HTMLElement[]
  readonly from: number
  readonly startY: number
  readonly startScroll: number
  readonly height: number
  target: number
}

const EDGE_TOP = 80
const EDGE_BOTTOM = 130
const EDGE_SCROLL_STEP = 12

export function installDragSort(pageScroller: () => HTMLElement, onCommit: DragCommit): void {
  let drag: DragState | null = null

  function endDrag(): void {
    if (drag === null) return
    drag.items.forEach((el) => {
      el.style.transform = ''
      el.classList.remove('dragging')
    })
    drag.list.classList.remove('drag-active')
    drag = null
  }

  function finishDrag(commit: boolean): void {
    const state = drag
    if (state === null) return
    endDrag()
    if (commit && state.target !== state.from) onCommit(state.list, state.from, state.target)
  }

  document.addEventListener('pointerdown', (event) => {
    const grip = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-grip]') : null
    const row = grip?.closest<HTMLElement>('.person')
    const list = row?.parentElement
    if (grip === null || grip === undefined || row === null || row === undefined || list === null || list === undefined || drag !== null) return
    const items = Array.from(list.children).filter((c): c is HTMLElement => c instanceof HTMLElement)
    const from = items.indexOf(row)
    if (from < 0) return
    grip.setPointerCapture(event.pointerId)
    const scroller = grip.closest<HTMLElement>('.sheet') ?? pageScroller()
    drag = {
      pointerId: event.pointerId,
      scroller,
      list,
      items,
      from,
      startY: event.clientY,
      startScroll: scroller.scrollTop,
      height: row.offsetHeight,
      target: from,
    }
    row.classList.add('dragging')
    list.classList.add('drag-active')
  })

  document.addEventListener('pointermove', (event) => {
    const state = drag
    if (state === null || event.pointerId !== state.pointerId) return
    const scroller = state.scroller
    if (event.clientY < EDGE_TOP) scroller.scrollTop -= EDGE_SCROLL_STEP
    else if (event.clientY > window.innerHeight - EDGE_BOTTOM) scroller.scrollTop += EDGE_SCROLL_STEP
    const dy = event.clientY - state.startY + (scroller.scrollTop - state.startScroll)
    const dragged = state.items[state.from]
    if (dragged === undefined) return
    dragged.style.transform = `translateY(${dy}px)`
    const center = dragged.offsetTop + dragged.offsetHeight / 2 + dy
    const target = state.items.filter((el, i) => i !== state.from && el.offsetTop + el.offsetHeight / 2 < center).length
    state.target = target
    state.items.forEach((el, i) => {
      if (i === state.from) return
      const shiftUp = state.from < target && i > state.from && i <= target
      const shiftDown = target < state.from && i >= target && i < state.from
      el.style.transform = shiftUp ? `translateY(${-state.height}px)` : shiftDown ? `translateY(${state.height}px)` : ''
    })
    event.preventDefault()
  })

  document.addEventListener('pointerup', (event) => {
    if (drag !== null && event.pointerId === drag.pointerId) finishDrag(true)
  })
  document.addEventListener('pointercancel', (event) => {
    if (drag !== null && event.pointerId === drag.pointerId) finishDrag(false)
  })
}
