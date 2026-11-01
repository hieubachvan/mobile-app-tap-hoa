import { useState } from 'react'
import { sfx } from '../game/sound'

interface Props {
  mode: 'choice' | 'pad'
  choices: number[]
  disabled: boolean
  onAnswer: (n: number) => void
  /** Đổi key để xóa ô nhập */
  resetKey: string
}

export default function AnswerInput(props: Props) {
  return props.mode === 'choice' ? <Choices {...props} /> : <NumPad key={props.resetKey} {...props} />
}

function Choices({ choices, disabled, onAnswer }: Props) {
  return (
    <div className="choices">
      {choices.map((n) => (
        <button key={n} className="choice-btn" disabled={disabled} onClick={() => onAnswer(n)}>
          {n}
        </button>
      ))}
    </div>
  )
}

function NumPad({ disabled, onAnswer }: Props) {
  const [value, setValue] = useState('')

  const press = (k: string) => {
    if (disabled) return
    sfx.tap()
    if (k === '⌫') setValue((v) => v.slice(0, -1))
    else if (k === '✓') {
      if (value) {
        onAnswer(Number(value))
        setValue('')
      }
    } else setValue((v) => (v.length < 4 ? (v === '0' ? k : v + k) : v))
  }

  return (
    <div className="numpad-wrap">
      <div className={`numpad-display ${value ? '' : 'empty'}`}>{value || '?'}</div>
      <div className="numpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((k) => (
          <button
            key={k}
            className={`num-btn ${k === '✓' ? 'ok' : ''} ${k === '⌫' ? 'del' : ''}`}
            disabled={disabled || (k === '✓' && !value)}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}
