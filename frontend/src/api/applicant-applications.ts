import { z } from 'zod'

import { isSafeJourneyPath } from '../routes/-return-target'

import { readFirstErrorDetail, readJson, requestJsonApi } from './json-api'

export const applicantApplicationsPath = '/api/v1/applicant-applications'

export const formSteps = ['personal-details', 'identity-and-address'] as const
export type FormStep = (typeof formSteps)[number]

/** Text answers the API stores, by wire name (see the `Answers` schema). */
export const answerFields = [
  'name',
  'dateOfBirth',
  'country',
  'nationality',
  'email',
  'phone',
  'documentType',
  'documentNumber',
  'documentCountry',
  'expiry',
  'street',
  'city',
  'postal',
  'residentialCountry',
] as const
export type AnswerField = (typeof answerFields)[number]
export type Answers = Partial<Record<AnswerField, string>>

export type StepState = 'current' | 'complete' | 'remaining'

export interface StepProgress {
  step: FormStep
  state: StepState
}

/** The Applicant's current draft, as returned by the application endpoints. */
export interface CurrentApplication {
  id: string
  currentStep: FormStep
  /** Local journey path of the earliest incomplete step. */
  href: string
  progress: StepProgress[]
}

/** Saved form state for one application. */
export interface ApplicationForm {
  id: string
  currentStep: FormStep
  steps: StepProgress[]
  answers: Answers
  consentConfirmed: boolean
  documentEvidencePresent: boolean
  /** Optimistic concurrency version; send it back when saving. */
  version: number
}

/**
 * Failures shared by the authenticated application endpoints. Transport and
 * status codes stay in this module; screens decide how each is presented.
 */
export type ApplicationApiFailure =
  /** 401: no active session, for example after it expired. */
  | { kind: 'session-expired' }
  /** 403: the session could not be verified, usually a missing CSRF token. */
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  /** 409: the form changed since it was loaded. */
  | { kind: 'conflict' }
  /** 422: the API rejected the data; `detail` is safe to show. */
  | { kind: 'unprocessable'; detail?: string }
  | { kind: 'network-error' }
  | { kind: 'unexpected' }

export type ApplicationApiResult<T> =
  { kind: 'ok'; value: T } | ApplicationApiFailure

const stepSchema = z.enum(formSteps)

// Application endpoints say `not-started`, form endpoints say `remaining`.
const stepStateSchema = z
  .enum(['current', 'complete', 'remaining', 'not-started'])
  .transform((state): StepState =>
    state === 'not-started' ? 'remaining' : state,
  )

const progressSchema = z.array(
  z.object({ step: stepSchema, state: stepStateSchema }),
)

const applicationDocumentSchema = z.object({
  data: z.object({
    type: z.literal('applicant-applications'),
    id: z.string(),
    attributes: z.object({
      currentStep: stepSchema,
      href: z.string().refine(isSafeJourneyPath),
      progress: progressSchema,
    }),
  }),
})

// Unanswered fields may be omitted or null.
const answersSchema = z.object({
  ...(Object.fromEntries(
    answerFields.map((field) => [field, z.string().nullish()]),
  ) as Record<AnswerField, z.ZodOptional<z.ZodNullable<z.ZodString>>>),
  consentConfirmed: z.boolean().nullish(),
})

const formDocumentSchema = z.object({
  data: z.object({
    type: z.literal('applicant-application-forms'),
    id: z.string(),
    attributes: z.object({
      currentStep: stepSchema,
      steps: progressSchema,
      answers: answersSchema,
      documentEvidence: z.object({ present: z.boolean() }),
      version: z.number().int().min(0),
    }),
  }),
})

const documentEvidenceSchema = z.object({
  data: z.object({ attributes: z.object({ present: z.boolean() }) }),
})

/** Returns the current draft, or `null` when the Applicant has not started. */
export async function getCurrentApplication(): Promise<
  ApplicationApiResult<CurrentApplication | null>
> {
  const response = await requestJsonApi(`${applicantApplicationsPath}/current`)
  if (response?.status === 204) {
    return { kind: 'ok', value: null }
  }
  return readResult(response, 200, toCurrentApplication)
}

/** Starts a draft, or returns the existing one; never creates a duplicate. */
export async function startApplication(): Promise<
  ApplicationApiResult<CurrentApplication>
> {
  const response = await requestJsonApi(applicantApplicationsPath, {
    method: 'POST',
  })
  return readResult(response, [200, 201], toCurrentApplication)
}

export async function getApplicationForm(
  applicationId: string,
): Promise<ApplicationApiResult<ApplicationForm>> {
  const response = await requestJsonApi(formPath(applicationId))
  return readResult(response, 200, toApplicationForm)
}

export interface SaveFormRequest {
  applicationId: string
  step: FormStep
  /** Answers for `step` only; empty strings clear a saved answer. */
  answers: Answers
  /** Sent for the personal-details step only. */
  consentConfirmed?: boolean
  version: number
}

/** Saves one step and returns the persisted form state. */
export async function saveApplicationForm({
  applicationId,
  step,
  answers,
  consentConfirmed,
  version,
}: SaveFormRequest): Promise<ApplicationApiResult<ApplicationForm>> {
  const response = await requestJsonApi(formPath(applicationId), {
    method: 'PATCH',
    document: {
      data: {
        type: 'applicant-application-forms',
        id: applicationId,
        attributes: {
          step,
          answers:
            consentConfirmed === undefined
              ? answers
              : { ...answers, consentConfirmed },
          version,
        },
      },
    },
  })
  return readResult(response, 200, toApplicationForm)
}

/** Uploads the identity document image (JPG or PNG). */
export async function uploadDocumentEvidence(
  applicationId: string,
  file: File,
): Promise<ApplicationApiResult<{ present: boolean }>> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await requestJsonApi(
    `${applicantApplicationsPath}/${encodeURIComponent(applicationId)}/document-evidence`,
    { method: 'POST', formData },
  )
  // An unsupported file type is a 415 here, but it is a fixable input
  // problem for the Applicant, so it is reported like a 422.
  if (response?.status === 415) {
    return {
      kind: 'unprocessable',
      detail: await readFirstErrorDetail(response),
    }
  }
  return readResult(response, 201, (body) => {
    const parsed = documentEvidenceSchema.safeParse(body)
    return parsed.success ? parsed.data.data.attributes : undefined
  })
}

function formPath(applicationId: string): string {
  return `${applicantApplicationsPath}/${encodeURIComponent(applicationId)}/form`
}

/** Maps a response to a result, parsing the body on an expected status. */
async function readResult<T>(
  response: Response | undefined,
  expected: number | readonly number[],
  parse: (body: unknown) => T | undefined,
): Promise<ApplicationApiResult<T>> {
  if (response === undefined) {
    return { kind: 'network-error' }
  }
  const accepted = typeof expected === 'number' ? [expected] : expected
  if (accepted.includes(response.status)) {
    const value = parse(await readJson(response))
    return value === undefined ? { kind: 'unexpected' } : { kind: 'ok', value }
  }
  switch (response.status) {
    case 401:
      return { kind: 'session-expired' }
    case 403:
      return { kind: 'forbidden' }
    case 404:
      return { kind: 'not-found' }
    case 409:
      return { kind: 'conflict' }
    case 422:
      return {
        kind: 'unprocessable',
        detail: await readFirstErrorDetail(response),
      }
    default:
      return { kind: 'unexpected' }
  }
}

function toCurrentApplication(body: unknown): CurrentApplication | undefined {
  const parsed = applicationDocumentSchema.safeParse(body)
  if (!parsed.success) {
    return undefined
  }
  const { id, attributes } = parsed.data.data
  return {
    id,
    currentStep: attributes.currentStep,
    href: attributes.href,
    progress: attributes.progress,
  }
}

function toApplicationForm(body: unknown): ApplicationForm | undefined {
  const parsed = formDocumentSchema.safeParse(body)
  if (!parsed.success) {
    return undefined
  }
  const { id, attributes } = parsed.data.data
  const answers: Answers = {}
  for (const field of answerFields) {
    const value = attributes.answers[field]
    if (typeof value === 'string') {
      answers[field] = value
    }
  }
  return {
    id,
    currentStep: attributes.currentStep,
    steps: attributes.steps,
    answers,
    consentConfirmed: attributes.answers.consentConfirmed === true,
    documentEvidencePresent: attributes.documentEvidence.present,
    version: attributes.version,
  }
}
