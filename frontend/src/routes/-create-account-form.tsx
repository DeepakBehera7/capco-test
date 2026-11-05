import { Alert, Button, Link, Stack, TextField, Typography } from '@kyc/ui'
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
  createApplicantAccount,
  type RegistrationResult,
} from './-applicant-accounts-api'
import {
  hasRegistrationErrors,
  passwordRequirements,
  registrationFields,
  validateRegistration,
  type RegistrationField,
  type RegistrationFieldErrors,
  type RegistrationValues,
} from './-registration-validation'
import { accountAccessHref } from './-return-target'
import styles from './account-access.module.css'

export interface CreateAccountFormProps {
  onNavigate?: (href: string) => void
  returnTo?: string
}

const emptyValues: RegistrationValues = {
  email: '',
  password: '',
  confirmPassword: '',
}

const fieldIds: Record<RegistrationField, string> = {
  email: 'applicant-email',
  password: 'applicant-password',
  confirmPassword: 'applicant-confirm-password',
}

export const registrationMessages = {
  emailTaken:
    'An account already exists for this email address. Sign in instead, or use a different email address.',
  networkError: accountAccessMessages.networkError,
  unexpected:
    'Something went wrong and your account was not created. Try again later.',
} as const

export function CreateAccountForm({
  onNavigate,
  returnTo,
}: CreateAccountFormProps) {
  const [values, setValues] = useState(emptyValues)
  const [fieldErrors, setFieldErrors] = useState<RegistrationFieldErrors>({})
  const [formError, setFormError] = useState<string>()
  const [createdEmail, setCreatedEmail] = useState<string>()
  const errorSummary = useRef<HTMLElement>(null)
  const confirmationHeading = useRef<HTMLElement>(null)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const confirmPasswordInput = useRef<HTMLInputElement>(null)
  const registration = useMutation({ mutationFn: createApplicantAccount })
  const signInHref = accountAccessHref('/sign-in', returnTo)

  function navigateToSignIn(event: { preventDefault: () => void }) {
    if (onNavigate) {
      event.preventDefault()
      onNavigate(signInHref)
    }
  }

  function focusField(field: RegistrationField) {
    const input = {
      email: emailInput,
      password: passwordInput,
      confirmPassword: confirmPasswordInput,
    }[field]
    input.current?.focus()
  }

  /** Renders the errors synchronously so focus can move to the summary. */
  function showErrors(errors: RegistrationFieldErrors, message?: string) {
    flushSync(() => {
      setFieldErrors(errors)
      setFormError(message)
    })
    errorSummary.current?.focus()
  }

  function handleResult(result: RegistrationResult, email: string) {
    switch (result.kind) {
      case 'created':
        flushSync(() => {
          setValues(emptyValues)
          setFieldErrors({})
          setFormError(undefined)
          setCreatedEmail(email)
        })
        confirmationHeading.current?.focus()
        break
      case 'invalid':
        showErrors(result.fieldErrors)
        break
      case 'email-taken':
        showErrors({ email: registrationMessages.emailTaken })
        break
      case 'rate-limited':
        showErrors({}, rateLimitMessage(result.retryAfterSeconds))
        break
      case 'network-error':
        showErrors({}, registrationMessages.networkError)
        break
      default:
        showErrors({}, registrationMessages.unexpected)
    }
  }

  function submit() {
    if (registration.isPending) {
      return
    }
    const errors = validateRegistration(values)
    if (hasRegistrationErrors(errors)) {
      showErrors(errors)
      return
    }
    const email = values.email.trim()
    registration.mutate(
      { email, password: values.password },
      {
        onSuccess: (result) => handleResult(result, email),
        onError: () => showErrors({}, registrationMessages.unexpected),
      },
    )
  }

  function updateField(field: RegistrationField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  if (createdEmail !== undefined) {
    return (
      <AccountAccessPage>
        <Stack spacing={3}>
          <Typography
            component="h1"
            ref={confirmationHeading}
            tabIndex={-1}
            variant="heading"
          >
            Account created
          </Typography>
          <Alert severity="success">
            Your account for {createdEmail} is ready. You have not been signed
            in yet. Sign in to start your KYC application.
          </Alert>
          <Typography>
            <Link href={signInHref} onClick={navigateToSignIn}>
              Sign in to your account
            </Link>
          </Typography>
        </Stack>
      </AccountAccessPage>
    )
  }

  const summaryFields = registrationFields.filter(
    (field) => fieldErrors[field] !== undefined,
  )
  const hasSummary = formError !== undefined || summaryFields.length > 0

  return (
    <AccountAccessPage>
      <Stack
        aria-labelledby="create-account-title"
        component="form"
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        spacing={3}
      >
        <Stack spacing={1}>
          <Typography
            component="h1"
            id="create-account-title"
            variant="heading"
          >
            Create your account
          </Typography>
          <Typography tone="muted">
            Create credentials to begin your KYC application.
          </Typography>
        </Stack>
        {hasSummary ? (
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
          autoComplete="new-password"
          error={fieldErrors.password !== undefined}
          fullWidth
          helperText={fieldErrors.password ?? passwordRequirements}
          id={fieldIds.password}
          inputRef={passwordInput}
          label="Password"
          name="password"
          onChange={(event) => updateField('password', event.target.value)}
          required
          type="password"
          value={values.password}
        />
        <TextField
          autoComplete="new-password"
          error={fieldErrors.confirmPassword !== undefined}
          fullWidth
          helperText={fieldErrors.confirmPassword}
          id={fieldIds.confirmPassword}
          inputRef={confirmPasswordInput}
          label="Confirm password"
          name="confirmPassword"
          onChange={(event) =>
            updateField('confirmPassword', event.target.value)
          }
          required
          type="password"
          value={values.confirmPassword}
        />
        <Button
          className={styles.submit}
          fullWidth
          isPending={registration.isPending}
          size="large"
          type="submit"
        >
          {registration.isPending ? 'Creating account…' : 'Create account'}
        </Button>
        <Typography className={styles.footer} align="center" variant="caption">
          <span>Already have an account? </span>
          <Link href={signInHref} onClick={navigateToSignIn}>
            Sign in
          </Link>
        </Typography>
      </Stack>
    </AccountAccessPage>
  )
}
