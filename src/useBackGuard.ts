import { useEffect, useEffectEvent } from 'react'

// Open sheets, newest last: the back gesture closes the newest before it means anything else.
const openSheets: (() => void)[] = []

export function useSheetBack(open: boolean, onClose: () => void): void {
  const close = useEffectEvent(onClose)

  useEffect(() => {
    if (!open) return undefined
    const closeSheet = () => close()
    openSheets.push(closeSheet)
    return () => {
      openSheets.splice(openSheets.indexOf(closeSheet), 1)
    }
  }, [open])
}

// While active, the back gesture stays in the app: one history entry sits on top of the page,
// and going back from it closes the open sheet or calls onBack, and puts the entry back. An
// installed app on Android would otherwise close and lose the game.
export function useBackGuard(active: boolean, onBack: () => void): void {
  const handleBack = useEffectEvent(onBack)

  useEffect(() => {
    if (!active) return undefined
    window.history.scrollRestoration = 'manual'
    window.history.pushState(null, '')
    const onPopState = () => {
      window.history.pushState(null, '')
      const closeSheet = openSheets.at(-1)
      if (closeSheet) closeSheet()
      else handleBack()
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.history.back()
    }
  }, [active])
}
