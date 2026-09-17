export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 before:absolute before:inset-x-0 before:-top-[7px] before:-bottom-[7px] before:content-[''] ${checked ? 'bg-green' : 'bg-fill'}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15)] transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}
