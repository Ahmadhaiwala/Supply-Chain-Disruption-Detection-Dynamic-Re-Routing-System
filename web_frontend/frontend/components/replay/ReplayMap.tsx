'use client'
import dynamic from 'next/dynamic'
import type { ReplayEvent } from '@/lib/api'
import type { HistoryShipment } from '@/lib/api'

const ReplayMapInner = dynamic(() => import('./ReplayMapInner'), { ssr: false })

interface Props {
  shipment: HistoryShipment
  events: ReplayEvent[]
  cursorTime: number
}

export function ReplayMap({ shipment, events, cursorTime }: Props) {
  return <ReplayMapInner shipment={shipment} events={events} cursorTime={cursorTime} />
}
