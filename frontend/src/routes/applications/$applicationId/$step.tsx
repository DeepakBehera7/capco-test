import { Button, Card, CardContent, Stack, Typography } from '@kyc/ui'
import { data, useNavigate, useRevalidator } from 'react-router'

import { redirectWhenSignedOut, signInHref } from '../-applicant-session'
import { ApplicationStepForm } from '../-application-step-form'
import { LoadError } from '../-load-error'
import {
  formSteps,
  getApplicationForm,
  type FormStep,
} from '../../../api/applicant-applications'
import styles from '../../application-step.module.css'

import type { Route } from './+types/$step'

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return [
    {
      title:
        loaderData?.kind === 'review'
          ? 'Review application | KYC'
          : 'Your application | KYC',
    },
  ]
}

function isFormStep(step: string): step is FormStep {
  return (formSteps as readonly string[]).includes(step)
}

export async function clientLoader({
  params,
  request,
}: Route.ClientLoaderArgs) {
  if (params.step === 'review') {
    return { kind: 'review' as const }
  }
  if (!isFormStep(params.step)) {
    throw data(null, { status: 404 })
  }
  const result = await getApplicationForm(params.applicationId)
  if (result.kind === 'ok') {
    return {
      kind: 'form' as const,
      step: params.step,
      form: result.value,
      signInHref: signInHref(request),
    }
  }
  redirectWhenSignedOut(result, request)
  if (result.kind === 'not-found') {
    throw data(null, { status: 404 })
  }
  return { kind: 'error' as const, failure: result }
}

export default function ApplicationStepPage({
  loaderData,
  params,
}: Route.ComponentProps) {
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const applicationPath = `/applications/${params.applicationId}`

  if (loaderData.kind === 'error') {
    return (
      <LoadError
        failure={loaderData.failure}
        onRetry={() => void revalidator.revalidate()}
      />
    )
  }

  if (loaderData.kind === 'review') {
    return (
      <main className={styles.reviewPage}>
        <Card className={styles.reviewCard}>
          <CardContent>
            <Stack spacing={2}>
              <Typography component="h1" variant="heading">
                Review application
              </Typography>
              <Typography>Your application is ready for review.</Typography>
              <label>
                <input type="checkbox" /> I confirm the information is complete
                and accurate.
              </label>
              <Button
                onClick={() => void navigate(`${applicationPath}/submitted`)}
              >
                Submit
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void navigate(`${applicationPath}/identity-and-address`)
                }
              >
                Return to form
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </main>
    )
  }

  const { step, form } = loaderData
  return (
    <ApplicationStepForm
      applicationId={params.applicationId}
      form={form}
      // A new saved version (for example after a conflict reload) resets the
      // form to what the API has stored.
      key={`${step}-${form.version}`}
      onBack={() =>
        void navigate(
          step === 'personal-details'
            ? '/applications/current'
            : `${applicationPath}/personal-details`,
        )
      }
      onContinue={() =>
        void navigate(
          step === 'personal-details'
            ? `${applicationPath}/identity-and-address`
            : `${applicationPath}/review`,
        )
      }
      onReload={() => void revalidator.revalidate()}
      signInHref={loaderData.signInHref}
      step={step}
    />
  )
}
