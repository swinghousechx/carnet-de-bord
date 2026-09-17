// value = null : aucune option sélectionnée (question sans réponse).
export function Segmented<T extends string>(props: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="flex rounded-[9px] bg-fill p-0.5">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          onClick={() => props.onChange(o.value)}
          className={`relative h-8 flex-1 rounded-[7px] text-[13px] font-medium transition-colors duration-200 before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-[''] ${o.value === props.value ? 'bg-cell shadow-[0_3px_8px_rgba(0,0,0,0.12)]' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
