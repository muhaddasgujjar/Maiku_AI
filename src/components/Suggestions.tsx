import type { Suggestion } from '../types'

interface Props {
  suggestions: Suggestion[]
}

export default function Suggestions({ suggestions }: Props) {
  if (suggestions.length === 0) {
    return (
      <div className="suggestions-empty">
        <p>AI suggestions will appear here as the interview progresses.</p>
      </div>
    )
  }

  const latest = suggestions[0]

  return (
    <div className="suggestions-panel">
      <div className="section-header">Talking Points</div>
      <ul className="bullets">
        {latest.bullets.map((bullet, i) => (
          <li key={i} className="bullet-item">
            {bullet}
          </li>
        ))}
      </ul>
      {latest.context && (
        <div className="context-hint">Re: "{latest.context.slice(0, 80)}..."</div>
      )}
    </div>
  )
}
