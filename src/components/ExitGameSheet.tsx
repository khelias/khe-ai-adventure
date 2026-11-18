import type { translations } from '../i18n/translations'
import { BottomSheet } from './BottomSheet'

export function ExitGameSheet({
  open,
  strings,
  onClose,
  onConfirm,
}: {
  open: boolean
  strings: typeof translations.et
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={strings.exitGameTitle}>
      <div className="sheet-grab">
        <div className="sheet-handle" aria-hidden="true" />
      </div>
      <div className="exit-sheet">
        <h2 className="exit-sheet__title">{strings.exitGameTitle}</h2>
        <p className="exit-sheet__text">{strings.exitGameText}</p>
        <button type="button" className="btn-primary" onClick={onClose}>
          {strings.exitGameKeepPlaying}
        </button>
        <button type="button" className="btn-secondary" onClick={onConfirm}>
          {strings.exitGameBtn}
        </button>
      </div>
    </BottomSheet>
  )
}
