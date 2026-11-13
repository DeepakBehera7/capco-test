import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useRevalidator } from 'react-router'

import { accountAccessHref } from '../-return-target'
import {
  formSteps,
  getCurrentApplication,
  startApplication,
} from '../../api/applicant-applications'

import {
  ApplicantJourneyPresentation,
  type ApplicantJourneyProgressItem,
} from './-applicant-journey-presentation'
import { redirectWhenSignedOut } from './-applicant-session'
import { LoadError } from './-load-error'

import type { Route } from './+types/current'

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Your application | KYC' }]
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const result = await getCurrentApplication()
  if (result.kind === 'ok') {
    return { kind: 'loaded' as const, application: result.value }
  }
  redirectWhenSignedOut(result, request)
  return { kind: 'error' as const, failure: result }
}

/** Before a draft exists, the first step is current and the rest remain. */
const notStartedProgress: readonly ApplicantJourneyProgressItem[] =
  formSteps.map((step, index) => ({
    step,
    state: index === 0 ? 'current' : 'remaining',
  }))

const startErrorMessages = {
  'network-error':
    'We could not reach the service. Check your connection and try again.',
  default: 'Your application could not be started. Try again.',
} as const

export default function CurrentApplicationJourneyPage({
  loaderData,
}: Route.ComponentProps) {
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const [startError, setStartError] = useState<string>()
  const start = useMutation({ mutationFn: startApplication })

  if (loaderData.kind === 'error') {
    return (
      <LoadError
        failure={loaderData.failure}
        onRetry={() => void revalidator.revalidate()}
      />
    )
  }

  const { application } = loaderData

  function startOrResume() {
    if (application !== null) {
      void navigate(application.href)
      return
    }
    if (start.isPending) {
      return
    }
    setStartError(undefined)
    start.mutate(undefined, {
      onSuccess: (result) => {
        if (result.kind === 'ok') {
          void navigate(result.value.href)
        } else if (
          result.kind === 'session-expired' ||
          result.kind === 'forbidden'
        ) {
          void navigate(accountAccessHref('/sign-in', '/applications/current'))
        } else {
          setStartError(
            result.kind === 'network-error'
              ? startErrorMessages['network-error']
              : startErrorMessages.default,
          )
        }
      },
      onError: () => setStartError(startErrorMessages.default),
    })
  }

  return (
    <ApplicantJourneyPresentation
      actionError={startError}
      actionPending={start.isPending}
      entryState={application === null ? 'start' : 'resume'}
      onPrimaryAction={startOrResume}
      progress={application?.progress ?? notStartedProgress}
    />
  )
}
