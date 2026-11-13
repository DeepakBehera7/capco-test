import { useId, type Ref } from 'react'

import styles from './ErrorSummary.module.css'
import { Alert, Link, Typography } from './Primitives'

export interface ErrorSummaryItem {
  /** Id of the field the item links to. */
  fieldId: string
  message: string
  /** Moves focus to the field; called instead of following the link. */
  onSelect: () => void
}

export interface ErrorSummaryProps {
  /** Problem that is not tied to a single field. */
  message?: string
  /** Field problems, in the order the fields appear on the page. */
  items: readonly ErrorSummaryItem[]
  /** Receives the summary so callers can move focus to it after submit. */
  ref?: Ref<HTMLElement>
}

/**
 * Lists every problem at the top of a form. It is focusable so screen reader
 * and keyboard users land on it after a failed submit, and each field problem
 * links to its field.
 */
export function ErrorSummary({ message, items, ref }: ErrorSummaryProps) {
  const titleId = useId()
  return (
    <Alert
      aria-labelledby={titleId}
      className={styles.summary}
      ref={ref}
      severity="error"
      tabIndex={-1}
    >
      <Typography component="h2" id={titleId} variant="subheading">
        There is a problem
      </Typography>
      {message === undefined ? null : <Typography>{message}</Typography>}
      {items.length > 0 ? (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.fieldId}>
              <Link
                href={`#${item.fieldId}`}
                onClick={(event) => {
                  event.preventDefault()
                  item.onSelect()
                }}
              >
                {item.message}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Alert>
  )
}
