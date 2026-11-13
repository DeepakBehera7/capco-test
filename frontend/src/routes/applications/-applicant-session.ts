import { redirect } from 'react-router'

import { accountAccessHref } from '../-return-target'

import type { ApplicationApiFailure } from '../../api/applicant-applications'

/** Sign-in link that brings the Applicant back to the page they were on. */
export function signInHref(request: Request): string {
  const url = new URL(request.url)
  return accountAccessHref('/sign-in', `${url.pathname}${url.search}`)
}

/**
 * Loader guard: an ended or unverifiable session sends the Applicant to sign
 * in instead of rendering a page that cannot load or save anything.
 */
export function redirectWhenSignedOut(
  failure: ApplicationApiFailure,
  request: Request,
): void {
  if (failure.kind === 'session-expired' || failure.kind === 'forbidden') {
    throw redirect(signInHref(request))
  }
}

export const loadErrorMessages: Partial<
  Record<ApplicationApiFailure['kind'], string>
> = {
  'network-error':
    'We could not reach the service. Check your connection and try again.',
}

export const defaultLoadErrorMessage =
  'Your application could not be loaded. Try again in a moment.'
