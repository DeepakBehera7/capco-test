import { Card, CardContent } from '@kyc/ui'

import styles from './account-access.module.css'

import type { ReactNode } from 'react'

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
