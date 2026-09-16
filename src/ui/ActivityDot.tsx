import type { Activite } from '../domain/types'

export function ActivityDot({ activite }: { activite: Activite }) {
  return <span aria-hidden="true" className={`inline-block size-2.5 shrink-0 rounded-full ${activite === 'swing_house' ? 'bg-indigo' : 'bg-green'}`} />
}
