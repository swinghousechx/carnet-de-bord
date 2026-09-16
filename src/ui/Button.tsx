import type { ReactNode } from 'react'

export function PrimaryButton(props: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  tone?: 'accent' | 'plain'
}) {
  const tone = props.tone === 'plain' ? 'bg-cell text-accent' : 'bg-accent text-white'
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`h-[50px] w-full rounded-[12px] text-[17px] font-semibold active:opacity-80 disabled:opacity-40 ${tone}`}
    >
      {props.children}
    </button>
  )
}
