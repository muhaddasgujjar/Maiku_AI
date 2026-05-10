import { useEffect, useRef } from 'react'
import type { TranscriptSegment } from '../types'

interface Props {
  segments: TranscriptSegment[]
}

export default function Transcript({ segments }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments])

  if (segments.length === 0) {
    return (
      <div className="transcript-empty">
        <p>Live transcript will appear here once listening starts.</p>
      </div>
    )
  }

  return (
    <div className="transcript-panel">
      <div className="section-header">Transcript</div>
      <div className="transcript-scroll">
        {segments.map((seg) => (
          <span
            key={seg.id}
            className={`transcript-segment ${seg.isFinal ? 'final' : 'interim'}`}
          >
            {seg.text}{' '}
          </span>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
