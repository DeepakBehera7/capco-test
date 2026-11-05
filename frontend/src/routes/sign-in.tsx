import { useNavigate } from 'react-router'

import { parseAccountAccessSearch } from './-return-target'
import { SignInForm } from './-sign-in-form'

import type { Route } from './+types/sign-in'

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sign in | KYC' }]
}

export function clientLoader({ request }: Route.ClientLoaderArgs) {
  const search = Object.fromEntries(new URL(request.url).searchParams)
  return parseAccountAccessSearch(search)
}

export default function SignInRoute({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate()
  return (
    <SignInForm
      onNavigate={(href) => {
        void navigate(href)
      }}
      // The API owns the destination: it knows the Applicant's application
      // and step, so it takes precedence over any client-side returnTo.
      onSignedIn={(journeyHref) => {
        void navigate(journeyHref, { replace: true })
      }}
      returnTo={loaderData.returnTo}
    />
  )
}
