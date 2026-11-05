import { Button, Link, Stack, TextField, Typography } from '@kyc/ui'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import {
  AccountAccessPage,
  accountAccessMessages,
  ErrorSummary,
  rateLimitMessage,
} from './-account-access-ui'
import {
  createApplicantSession,
  type SignInResult,
} from './-applicant-sessions-api'
import { accountAccessHref } from './-return-target'
import styles from './account-access.module.css'

import type {
  ApplicantCredentials,
  CredentialField,
} from './-applicant-accounts-api'

export interface SignInFormProps {
  onNavigate?: (href: string) => void
  /** Carried to the create-account link so the round trip keeps it. */
  returnTo?: string
  /** Receives the journey URL the API chose for the signed-in Applicant. */
  onSignedIn: (journeyHref: string) => void
}

type SignInFieldErrors = Partial<Record<CredentialField, string>>

/** Display and focus order of the sign-in fields. */
const signInFields: readonly CredentialField[] = ['email', 'password']

const fieldIds: Record<CredentialField, string> = {
  email: 'applicant-email',
  password: 'applicant-password',
}

const emptyValues: ApplicantCredentials = { email: '', password: '' }

export const signInMessages = {
  emailRequired: 'Enter your email address.',
  passwordRequired: 'Enter your password.',
  // Deliberately the same for unknown emails and wrong passwords.
  invalidCredentials:
    'The email address or password is incorrect. Check them and try again.',
  networkError: accountAccessMessages.networkError,
  unexpected: 'Something went wrong and you were not signed in. Try again.',
} as const

/**
 * Only checks that both fields are filled in. Format and password rules are
 * the API's responsibility at sign-in, and repeating the registration rules
 * here would block Applicants whose accounts predate a rule change.
 */
export function validateSignIn(
  values: ApplicantCredentials,
): SignInFieldErrors {
  const errors: SignInFieldErrors = {}
  if (values.email.trim() === '') {
    errors.email = signInMessages.emailRequired
  }
  if (values.password === '') {
    errors.password = signInMessages.passwordRequired
  }
  return errors
}

export function SignInForm({
  onNavigate,
  returnTo,
  onSignedIn,
}: SignInFormProps) {
  const [values, setValues] = useState(emptyValues)
  const [fieldErrors, setFieldErrors] = useState<SignInFieldErrors>({})
  const [formError, setFormError] = useState<string>()
  const errorSummary = useRef<HTMLElement>(null)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const signIn = useMutation({ mutationFn: createApplicantSession })
  const createAccountHref = accountAccessHref('/create-account', returnTo)

  function focusField(field: CredentialField) {
    const input = { email: emailInput, password: passwordInput }[field]
    input.current?.focus()
  }

  /** Renders the errors synchronously so focus can move to the summary. */
  function showErrors(errors: SignInFieldErrors, message?: string) {
    flushSync(() => {
      setFieldErrors(errors)
      setFormError(message)
    })
    errorSummary.current?.focus()
  }

  function handleResult(result: SignInResult) {
    switch (result.kind) {
      case 'signed-in':
        onSignedIn(result.journeyHref)
        break
      case 'invalid':
        showErrors(result.fieldErrors)
        break
      case 'invalid-credentials':
        // The email stays so a typo in the password is quick to fix.
        setValues((current) => ({ ...current, password: '' }))
        showErrors({}, signInMessages.invalidCredentials)
        break
      case 'rate-limited':
        showErrors({}, rateLimitMessage(result.retryAfterSeconds))
        break
      case 'network-error':
        showErrors({}, signInMessages.networkError)
        break
      default:
        showErrors({}, signInMessages.unexpected)
    }
  }

  function submit() {
    if (signIn.isPending) {
      return
    }
    const errors = validateSignIn(values)
    if (signInFields.some((field) => errors[field] !== undefined)) {
      showErrors(errors)
      return
    }
    signIn.mutate(
      { email: values.email.trim(), password: values.password },
      {
        onSuccess: handleResult,
        onError: () => showErrors({}, signInMessages.unexpected),
      },
    )
  }

  function updateField(field: CredentialField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  const summaryFields = signInFields.filter(
    (field) => fieldErrors[field] !== undefined,
  )

  return (
    <AccountAccessPage>
      <Stack
        aria-busy={signIn.isPending}
        aria-labelledby="sign-in-title"
        component="form"
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        spacing={3}
      >
        <Stack spacing={1}>
          <Typography component="h1" id="sign-in-title" variant="heading">
            Welcome back
          </Typography>
          <Typography tone="muted">
            Sign in to continue your KYC application.
          </Typography>
        </Stack>
        {formError !== undefined || summaryFields.length > 0 ? (
          <ErrorSummary
            items={summaryFields.map((field) => ({
              fieldId: fieldIds[field],
              message: fieldErrors[field] ?? '',
              onSelect: () => focusField(field),
            }))}
            message={formError}
            ref={errorSummary}
          />
        ) : null}
        <TextField
          autoComplete="email"
          error={fieldErrors.email !== undefined}
          fullWidth
          helperText={fieldErrors.email}
          id={fieldIds.email}
          inputRef={emailInput}
          label="Email address"
          name="email"
          onChange={(event) => updateField('email', event.target.value)}
          required
          spellCheck={false}
          type="email"
          value={values.email}
        />
        <TextField
          autoComplete="current-password"
          error={fieldErrors.password !== undefined}
          fullWidth
          helperText={fieldErrors.password}
          id={fieldIds.password}
          inputRef={passwordInput}
          label="Password"
          name="password"
          onChange={(event) => updateField('password', event.target.value)}
          required
          type="password"
          value={values.password}
        />
        <Button
          className={styles.submit}
          fullWidth
          isPending={signIn.isPending}
          size="large"
          type="submit"
        >
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <Typography className={styles.footer} align="center" variant="caption">
          <span>New to KYC? </span>
          <Link
            href={createAccountHref}
            onClick={(event) => {
              if (onNavigate) {
                event.preventDefault()
                onNavigate(createAccountHref)
              }
            }}
          >
            Create account
          </Link>
        </Typography>
      </Stack>
    </AccountAccessPage>
  )
}
