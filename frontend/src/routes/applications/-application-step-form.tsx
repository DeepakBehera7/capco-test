import {
  Alert,
  Box,
  Button,
  ErrorSummary,
  Link,
  Stack,
  TextField,
  Typography,
} from '@kyc/ui'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { accountAccessMessages } from '../-account-access-ui'
import {
  getApplicationForm,
  saveApplicationForm,
  uploadDocumentEvidence,
  type AnswerField,
  type ApplicationApiFailure,
  type ApplicationForm,
  type FormStep,
} from '../../api/applicant-applications'
import styles from '../application-step.module.css'

import { fieldId, stepFields, stepTitles } from './-application-form-fields'

type FieldKey = AnswerField | 'consentConfirmed' | 'documentEvidence'
type FieldErrors = Partial<Record<FieldKey, string>>

/** What the Applicant is told after a save attempt. */
type Feedback =
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; message: string; action?: 'sign-in' | 'reload' }

/** Result of saving answers and, when chosen, uploading the document. */
type PersistOutcome =
  | { kind: 'saved'; form: ApplicationForm }
  | {
      kind: 'failed'
      failure: ApplicationApiFailure
      stage: 'answers' | 'document'
      /** Present when the answers were saved before the upload failed. */
      form?: ApplicationForm
    }

export const stepFormMessages = {
  sessionExpired:
    'Your session has ended, so your answers were not saved. Sign in again to continue.',
  forbidden:
    'We could not confirm your session, so your answers were not saved. Sign in again to continue.',
  conflict:
    'Your application was changed somewhere else, for example in another tab, so these answers were not saved. Load the latest saved answers, then make your changes again.',
  notFound: 'This application is no longer available.',
  unprocessable: 'Your answers could not be saved. Check them and try again.',
  networkError: `${accountAccessMessages.networkError} Your answers have not been saved.`,
  unexpected:
    'Something went wrong and your answers were not saved. Try again.',
  documentNotUploaded:
    'Your answers were saved, but your document was not uploaded.',
  consentRequired: 'Confirm these details are accurate and belong to you.',
  documentRequired: 'Choose a JPG or PNG image of your identity document.',
} as const

export interface ApplicationStepFormProps {
  applicationId: string
  step: FormStep
  /** Saved state the form starts from. Remount the form to reset it. */
  form: ApplicationForm
  /** Link for signing in again when the session has ended. */
  signInHref: string
  onBack: () => void
  /** Called after Continue saved the step successfully. */
  onContinue: () => void
  /** Reloads the saved form, for example after a version conflict. */
  onReload: () => void
}

export function ApplicationStepForm({
  applicationId,
  step,
  form,
  signInHref,
  onBack,
  onContinue,
  onReload,
}: ApplicationStepFormProps) {
  const fields = stepFields[step]
  const [values, setValues] = useState<Partial<Record<AnswerField, string>>>(
    () =>
      Object.fromEntries(
        fields.map(({ name }) => [name, form.answers[name] ?? '']),
      ),
  )
  const [consent, setConsent] = useState(form.consentConfirmed)
  const [documentFile, setDocumentFile] = useState<File>()
  const [documentPresent, setDocumentPresent] = useState(
    form.documentEvidencePresent,
  )
  const [version, setVersion] = useState(form.version)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [feedback, setFeedback] = useState<Feedback>()
  const errorSummary = useRef<HTMLElement>(null)
  const documentInput = useRef<HTMLInputElement>(null)
  const persist = useMutation({ mutationFn: saveStep })

  async function saveStep(): Promise<PersistOutcome> {
    const saved = await saveApplicationForm({
      applicationId,
      step,
      answers: values,
      consentConfirmed: step === 'personal-details' ? consent : undefined,
      version,
    })
    if (saved.kind !== 'ok') {
      return { kind: 'failed', failure: saved, stage: 'answers' }
    }
    if (documentFile === undefined) {
      return { kind: 'saved', form: saved.value }
    }
    const uploaded = await uploadDocumentEvidence(applicationId, documentFile)
    if (uploaded.kind !== 'ok') {
      return {
        kind: 'failed',
        failure: uploaded,
        stage: 'document',
        form: saved.value,
      }
    }
    // The upload changes the form version, and its response does not carry
    // it, so read the form again to keep the next save conflict-free.
    const refreshed = await getApplicationForm(applicationId)
    return {
      kind: 'saved',
      form:
        refreshed.kind === 'ok'
          ? refreshed.value
          : { ...saved.value, documentEvidencePresent: true },
    }
  }

  function applySavedForm(saved: ApplicationForm) {
    setVersion(saved.version)
    setDocumentPresent(saved.documentEvidencePresent)
  }

  /** Renders the errors synchronously so focus can move to the summary. */
  function showError(
    message: string,
    errors: FieldErrors = {},
    action?: 'sign-in' | 'reload',
  ) {
    flushSync(() => {
      setFieldErrors(errors)
      setFeedback({ kind: 'error', message, action })
    })
    errorSummary.current?.focus()
  }

  function handleOutcome(outcome: PersistOutcome, thenContinue: boolean) {
    if (outcome.kind === 'saved') {
      applySavedForm(outcome.form)
      setDocumentFile(undefined)
      if (documentInput.current) {
        documentInput.current.value = ''
      }
      setFieldErrors({})
      setFeedback({ kind: 'saved', at: new Date() })
      if (thenContinue) {
        onContinue()
      }
      return
    }
    if (outcome.form) {
      applySavedForm(outcome.form)
    }
    const { failure } = outcome
    if (outcome.stage === 'document' && failure.kind === 'unprocessable') {
      const detail = failure.detail ?? stepFormMessages.documentRequired
      showError(stepFormMessages.documentNotUploaded, {
        documentEvidence: detail,
      })
      return
    }
    const message = failureMessage(failure)
    const prefix =
      outcome.stage === 'document'
        ? `${stepFormMessages.documentNotUploaded} `
        : ''
    showError(`${prefix}${message.text}`, {}, message.action)
  }

  /** Checks what Continue needs; Save keeps partial answers as a draft. */
  function validateForContinue(): FieldErrors {
    const errors: FieldErrors = {}
    for (const { name, label } of fields) {
      if ((values[name] ?? '').trim() === '') {
        errors[name] = `Enter ${label.toLowerCase()}.`
      }
    }
    if (step === 'personal-details' && !consent) {
      errors.consentConfirmed = stepFormMessages.consentRequired
    }
    if (
      step === 'identity-and-address' &&
      !documentPresent &&
      documentFile === undefined
    ) {
      errors.documentEvidence = stepFormMessages.documentRequired
    }
    return errors
  }

  function submit(thenContinue: boolean) {
    if (persist.isPending) {
      return
    }
    if (thenContinue) {
      const errors = validateForContinue()
      if (Object.keys(errors).length > 0) {
        showError('Complete the required fields before continuing.', errors)
        return
      }
    }
    persist.mutate(undefined, {
      onSuccess: (outcome) => handleOutcome(outcome, thenContinue),
      onError: () => showError(stepFormMessages.unexpected),
    })
  }

  /** Any edit makes an earlier "saved" message out of date. */
  function edited(key: FieldKey) {
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    setFeedback((current) => (current?.kind === 'saved' ? undefined : current))
  }

  const summaryItems = (
    [
      ...fields.map(({ name }) => name),
      'consentConfirmed',
      'documentEvidence',
    ] as const
  ).flatMap((key) => {
    const message = fieldErrors[key]
    return message === undefined
      ? []
      : [
          {
            fieldId: fieldId(key),
            message,
            onSelect: () => document.getElementById(fieldId(key))?.focus(),
          },
        ]
  })
  const documentHintId = `${fieldId('documentEvidence')}-hint`
  const documentErrorId = `${fieldId('documentEvidence')}-error`
  const consentErrorId = `${fieldId('consentConfirmed')}-error`

  return (
    <main className={styles.page}>
      <Box component="div" className={styles.stepContent}>
        <Stack spacing={3}>
          <Typography component="p" variant="eyebrow" tone="accent">
            STEP {step === 'personal-details' ? '1' : '2'} OF 2
          </Typography>
          <Typography component="h1" id="step-title" variant="heading">
            {stepTitles[step]}
          </Typography>
          <Typography tone="muted">
            Save at any time and come back later. Your answers are kept with
            your application.
          </Typography>
          {feedback?.kind === 'error' ? (
            <Stack spacing={1}>
              <ErrorSummary
                items={summaryItems}
                message={feedback.message}
                ref={errorSummary}
              />
              {feedback.action === 'sign-in' ? (
                <Typography>
                  <Link href={signInHref}>Sign in again</Link>
                </Typography>
              ) : null}
              {feedback.action === 'reload' ? (
                <Button onPress={onReload} type="button" variant="secondary">
                  Load the latest saved answers
                </Button>
              ) : null}
            </Stack>
          ) : null}
          <Stack
            aria-busy={persist.isPending}
            aria-labelledby="step-title"
            component="form"
            className={styles.stepForm}
            onSubmit={(event) => {
              event.preventDefault()
              submit(true)
            }}
            spacing={2}
          >
            {fields.map(({ name, label, autoComplete }) => (
              <TextField
                autoComplete={autoComplete}
                error={fieldErrors[name] !== undefined}
                helperText={fieldErrors[name]}
                id={fieldId(name)}
                key={name}
                label={`${label} (required)`}
                name={name}
                onChange={(event) => {
                  const { value } = event.target
                  setValues((current) => ({ ...current, [name]: value }))
                  edited(name)
                }}
                required
                value={values[name] ?? ''}
              />
            ))}
            {step === 'personal-details' ? (
              <Stack spacing={1}>
                <label>
                  <input
                    aria-describedby={
                      fieldErrors.consentConfirmed ? consentErrorId : undefined
                    }
                    aria-invalid={
                      fieldErrors.consentConfirmed ? true : undefined
                    }
                    checked={consent}
                    id={fieldId('consentConfirmed')}
                    onChange={(event) => {
                      setConsent(event.target.checked)
                      edited('consentConfirmed')
                    }}
                    required
                    type="checkbox"
                  />{' '}
                  I confirm these details are accurate and belong to me.
                </label>
                {fieldErrors.consentConfirmed ? (
                  <Typography className={styles.fieldError} id={consentErrorId}>
                    {fieldErrors.consentConfirmed}
                  </Typography>
                ) : null}
              </Stack>
            ) : (
              <Stack spacing={1}>
                <label htmlFor={fieldId('documentEvidence')}>
                  Document evidence (required)
                </label>
                <Typography id={documentHintId} tone="muted" variant="caption">
                  {documentPresent
                    ? 'A document is already uploaded. Choose a new JPG or PNG image only if you want to replace it.'
                    : 'Upload a JPG or PNG image of your identity document.'}
                </Typography>
                <input
                  accept="image/jpeg,image/png"
                  aria-describedby={[
                    documentHintId,
                    fieldErrors.documentEvidence ? documentErrorId : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-invalid={fieldErrors.documentEvidence ? true : undefined}
                  id={fieldId('documentEvidence')}
                  onChange={(event) => {
                    setDocumentFile(event.target.files?.[0])
                    edited('documentEvidence')
                  }}
                  ref={documentInput}
                  required={!documentPresent}
                  type="file"
                />
                {fieldErrors.documentEvidence ? (
                  <Typography
                    className={styles.fieldError}
                    id={documentErrorId}
                  >
                    {fieldErrors.documentEvidence}
                  </Typography>
                ) : null}
              </Stack>
            )}
            {/* Kept in the page so screen readers announce later changes. */}
            <div aria-atomic="true" aria-live="polite">
              {feedback?.kind === 'saved' ? (
                <Alert role="none" severity="success">
                  Your answers were saved at{' '}
                  {feedback.at.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  .
                </Alert>
              ) : null}
            </div>
            <Stack
              component="div"
              className={styles.formActions}
              direction="row"
              spacing={2}
            >
              <Button onPress={onBack} type="button" variant="quiet">
                Back
              </Button>
              <Stack
                component="div"
                className={styles.primaryActions}
                direction="row"
                spacing={2}
              >
                <Button
                  isPending={persist.isPending}
                  onPress={() => submit(false)}
                  type="button"
                  variant="secondary"
                >
                  {persist.isPending ? 'Saving…' : 'Save'}
                </Button>
                <Button isPending={persist.isPending} type="submit">
                  {step === 'personal-details' ? 'Continue' : 'Save and review'}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </Box>
    </main>
  )
}

function failureMessage(failure: ApplicationApiFailure): {
  text: string
  action?: 'sign-in' | 'reload'
} {
  switch (failure.kind) {
    case 'session-expired':
      return { text: stepFormMessages.sessionExpired, action: 'sign-in' }
    case 'forbidden':
      return { text: stepFormMessages.forbidden, action: 'sign-in' }
    case 'conflict':
      return { text: stepFormMessages.conflict, action: 'reload' }
    case 'not-found':
      return { text: stepFormMessages.notFound }
    case 'unprocessable':
      return { text: failure.detail ?? stepFormMessages.unprocessable }
    case 'network-error':
      return { text: stepFormMessages.networkError }
    default:
      return { text: stepFormMessages.unexpected }
  }
}
