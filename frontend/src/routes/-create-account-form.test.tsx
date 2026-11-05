import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../test/server'

import { rateLimitMessage } from './-account-access-ui'
import { applicantAccountsPath } from './-applicant-accounts-api'
import { CreateAccountForm, registrationMessages } from './-create-account-form'

expect.extend(toHaveNoViolations)

function renderForm(props: Parameters<typeof CreateAccountForm>[0] = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <CreateAccountForm {...props} />
    </QueryClientProvider>,
  )
  return { user, ...view }
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email address'), ' ada@example.com ')
  await user.type(screen.getByLabelText('Password'), 'Secret!')
  await user.type(screen.getByLabelText('Confirm password'), 'Secret!')
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Create account' }))
}

function errorSummary() {
  return screen.getByRole('alert', { name: 'There is a problem' })
}

function respondWith(resolver: () => Response | Promise<Response>) {
  const requests: unknown[] = []
  server.use(
    http.post(applicantAccountsPath, async ({ request }) => {
      requests.push(await request.json())
      return resolver()
    }),
  )
  return requests
}

describe('CreateAccountForm', () => {
  it('describes the password policy before any submission', async () => {
    const { container } = renderForm()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      /at least 6 characters, including one uppercase letter/,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('validates on the client without calling the API', async () => {
    const { user, container } = renderForm()

    await submit(user)

    expect(errorSummary()).toHaveFocus()
    expect(errorSummary()).toHaveTextContent('Enter your email address.')
    expect(screen.getByLabelText('Email address')).toBeInvalid()
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Enter a password.',
    )
    expect(
      screen.getByLabelText('Confirm password'),
    ).toHaveAccessibleDescription('Confirm your password.')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('moves focus to a field from the error summary', async () => {
    const { user } = renderForm()
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'Secret!')
    await user.type(screen.getByLabelText('Confirm password'), 'Secret?')

    await submit(user)
    await user.click(
      screen.getByRole('link', { name: 'Passwords do not match.' }),
    )

    expect(screen.getByLabelText('Confirm password')).toHaveFocus()
  })

  it('clears a field error when the field is edited', async () => {
    const { user } = renderForm()
    await submit(user)

    await user.type(screen.getByLabelText('Email address'), 'a')

    expect(screen.getByLabelText('Email address')).not.toHaveAttribute(
      'aria-invalid',
    )
    expect(errorSummary()).not.toHaveTextContent('Enter your email address.')
  })

  it('creates the account and links to sign-in without signing in', async () => {
    const requests = respondWith(() => new HttpResponse(null, { status: 201 }))
    const onNavigate = vi.fn()
    const { user, container } = renderForm({
      onNavigate,
      returnTo: '/applications/current',
    })
    await fillValidForm(user)

    await submit(user)

    const heading = await screen.findByRole('heading', {
      name: 'Account created',
    })
    expect(heading).toHaveFocus()
    expect(requests).toEqual([
      {
        data: {
          type: 'applicant-accounts',
          attributes: { email: 'ada@example.com', password: 'Secret!' },
        },
      },
    ])
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your account for ada@example.com is ready.',
    )
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    const signIn = screen.getByRole('link', { name: 'Sign in to your account' })
    expect(signIn).toHaveAttribute(
      'href',
      '/sign-in?returnTo=%2Fapplications%2Fcurrent',
    )
    await user.click(signIn)
    expect(onNavigate).toHaveBeenCalledWith(
      '/sign-in?returnTo=%2Fapplications%2Fcurrent',
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows a duplicate email on the email field', async () => {
    respondWith(() =>
      HttpResponse.json(
        {
          errors: [
            {
              status: '409',
              code: 'email-already-registered',
              title: 'Account conflict',
              detail: 'An account already exists for this email address.',
            },
          ],
        },
        { status: 409 },
      ),
    )
    const { user } = renderForm()
    await fillValidForm(user)

    await submit(user)

    await waitFor(() => expect(errorSummary()).toHaveFocus())
    expect(screen.getByLabelText('Email address')).toBeInvalid()
    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
      registrationMessages.emailTaken,
    )
    expect(screen.getByLabelText('Password')).toHaveValue('Secret!')
  })

  it('shows API field validation errors beside their fields', async () => {
    respondWith(() =>
      HttpResponse.json(
        {
          errors: [
            {
              status: '400',
              code: 'validation-failed',
              title: 'Invalid attribute',
              detail: 'Enter a valid email address.',
              source: { pointer: '/data/attributes/email' },
            },
          ],
        },
        { status: 400 },
      ),
    )
    const { user } = renderForm()
    await fillValidForm(user)

    await submit(user)

    await waitFor(() =>
      expect(
        screen.getByLabelText('Email address'),
      ).toHaveAccessibleDescription('Enter a valid email address.'),
    )
    expect(errorSummary()).toHaveFocus()
  })

  it.each([
    [
      'rate limiting',
      () =>
        HttpResponse.json(
          { errors: [] },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      rateLimitMessage(30),
    ],
    [
      'network failure',
      () => HttpResponse.error(),
      registrationMessages.networkError,
    ],
    [
      'an unexpected error',
      () => new HttpResponse(null, { status: 500 }),
      registrationMessages.unexpected,
    ],
  ])('explains %s', async (_case, resolver, message) => {
    respondWith(resolver)
    const { user } = renderForm()
    await fillValidForm(user)

    await submit(user)

    await waitFor(() => expect(errorSummary()).toHaveTextContent(message))
    expect(errorSummary()).toHaveFocus()
  })

  it('sends one request while a submission is pending', async () => {
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const requests = respondWith(async () => {
      await released
      return new HttpResponse(null, { status: 201 })
    })
    const { user } = renderForm()
    await fillValidForm(user)

    await submit(user)
    const pending = await screen.findByRole('button', {
      name: 'Creating account…',
    })
    await user.click(pending)
    await user.type(screen.getByLabelText('Confirm password'), '{Enter}')
    release()

    await screen.findByRole('heading', { name: 'Account created' })
    expect(requests).toHaveLength(1)
  })
})
