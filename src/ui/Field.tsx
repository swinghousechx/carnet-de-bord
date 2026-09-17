import type { HTMLAttributes } from 'react'

export function TextRow(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  autoFocus?: boolean
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 px-4">
      <span className="shrink-0">{props.label}</span>
      <input
        className="min-w-0 flex-1 bg-transparent py-2.5 text-right outline-none"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete}
        autoFocus={props.autoFocus}
      />
    </label>
  )
}

export function TextAreaRow(props: { value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string }) {
  return (
    <textarea
      rows={2}
      className="block w-full resize-none bg-transparent px-4 py-2.5 outline-none"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onBlur={props.onBlur}
      placeholder={props.placeholder}
    />
  )
}
