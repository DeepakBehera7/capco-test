import { Alert, Button, Card, CardContent, Stack, Typography } from '@kyc/ui'

import styles from '../applicant-journey.module.css'

import {
  defaultLoadErrorMessage,
  loadErrorMessages,
} from './-applicant-session'

import type { ApplicationApiFailure } from '../../api/applicant-applications'

/** Full-page message for an application that could not be loaded. */
export function LoadError({
  failure,
  onRetry,
}: {
  failure: ApplicationApiFailure
  onRetry: () => void
}) {
  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <CardContent className={styles.cardContent}>
          <Stack spacing={3}>
            <Typography component="h1" variant="heading">
              Your application could not be loaded
            </Typography>
            <Alert severity="error">
              {loadErrorMessages[failure.kind] ?? defaultLoadErrorMessage}
            </Alert>
            <Button onPress={onRetry}>Try again</Button>
          </Stack>
        </CardContent>
      </Card>
    </main>
  )
}
