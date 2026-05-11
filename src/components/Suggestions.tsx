import type { Suggestion } from '../types'

interface Props {
  suggestions: Suggestion[]
  isLoading?: boolean
}

export default function Suggestions({ suggestions, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="answer-loading">
        <span className="loading-dot" />
        <span className="loading-dot" />
        <span className="loading-dot" />
      </div>
    )
  }

  if (suggestions.length === 0) {
    return (
      <div className="suggestions-empty">
        <p>Answer will appear here once a question is detected.</p>
      </div>
    )
  }

  const latest = suggestions[0]

  return (
    <div className="answer-panel">
      {latest.question && (
        <div className="detected-question">
          <span className="q-label">Q:</span> {latest.question}
        </div>
      )}
      <div className="answer-text">{latest.answer}</div>
      {suggestions.length > 1 && (
        <div className="prev-answers-hint">
          {suggestions.length - 1} previous answer{suggestions.length > 2 ? 's' : ''} this session
        </div>
      )}
    </div>
  )
}
