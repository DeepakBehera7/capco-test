import { Alert, Card, CardContent, Link, Typography } from '@kyc/ui'
import { useId, type ReactNode, type RefObject } from 'react'

import styles from './account-access.module.css'

/** Card layout shared by the sign-in and create-account screens. */
export function AccountAccessPage({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <CardContent className={styles.cardContent}>{children}</CardContent>
      </Card>
    </main>
  )
}

export interface ErrorSummaryItem {
  fieldId: string
  message: string
  onSelect: () => void
}

export interface ErrorSummaryProps {
  /** Problem that is not tied to a single field. */
  message?: string
  /** Field problems, in the order the fields appear on the page. */
  items: readonly ErrorSummaryItem[]
  /** Receives the summary so callers can move focus to it after submit. */
  ref?: RefObject<HTMLElement | null>
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
      className={styles.errorSummary}
      ref={ref}
      severity="error"
      tabIndex={-1}
    >
      <Typography component="h2" id={titleId} variant="subheading">
        There is a problem
      </Typography>
      {message === undefined ? null : <Typography>{message}</Typography>}
      {items.length > 0 ? (
        <ul className={styles.errorList}>
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

export const accountAccessMessages = {
  networkError:
    'We could not reach the service. Check your connection and try again.',
} as const

export function rateLimitMessage(retryAfterSeconds?: number): string {
  if (retryAfterSeconds === undefined) {
    return 'Too many attempts. Wait a few minutes, then try again.'
  }
  if (retryAfterSeconds < 60) {
    const unit = retryAfterSeconds === 1 ? 'second' : 'seconds'
    return `Too many attempts. Try again in ${retryAfterSeconds} ${unit}.`
  }
  const minutes = Math.ceil(retryAfterSeconds / 60)
  const unit = minutes === 1 ? 'minute' : 'minutes'
  return `Too many attempts. Try again in ${minutes} ${unit}.`
}
