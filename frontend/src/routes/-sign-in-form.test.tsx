import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { applicantSessionsPath } from '../api/applicant-sessions'
import { server } from '../test/server'

import { rateLimitMessage } from './-account-access-ui'
import { SignInForm, signInMessages } from './-sign-in-form'

expect.extend(toHaveNoViolations)

type Props = Parameters<typeof SignInForm>[0]

function renderForm(props: Partial<Props> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const user = userEvent.setup()
  const onSignedIn = vi.fn()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SignInForm onSignedIn={onSignedIn} {...props} />
    </QueryClientProvider>,
  )
  return { user, onSignedIn, ...view }
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email address'), ' ada@example.com ')
  await user.type(screen.getByLabelText('Password'), 'Secret!')
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Sign in' }))
}

function errorSummary() {
  return screen.getByRole('alert', { name: 'There is a problem' })
}

function respondWith(resolver: () => Response | Promise<Response>) {
  const requests: unknown[] = []
  server.use(
    http.post(applicantSessionsPath, async ({ request }) => {
      requests.push(await request.json())
      return resolver()
    }),
  )
  return requests
}

function signedIn(href = '/applications/42/personal-details') {
  return HttpResponse.json(
    {
      data: {
        type: 'applicant-sessions',
        id: '7f2c1e8a-1d4b-4a8e-9c35-0a1b2c3d4e5f',
        attributes: { href },
      },
    },
    { status: 201 },
  )
}

describe('SignInForm', () => {
  it('renders an accessible form without errors', async () => {
    const { container } = renderForm()

    expect(
      screen.getByRole('form', { name: 'Welcome back' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeRequired()
    expect(screen.getByLabelText('Password')).toBeRequired()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('requires both fields before calling the API', async () => {
    const requests = respondWith(() => signedIn())
    const { user, container } = renderForm()

    await submit(user)

    expect(errorSummary()).toHaveFocus()
    expect(screen.getByLabelText('Email address')).toBeInvalid()
    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
      signInMessages.emailRequired,
    )
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      signInMessages.passwordRequired,
    )
    expect(requests).toHaveLength(0)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('treats a whitespace-only email as missing', async () => {
    const { user } = renderForm()
    await user.type(screen.getByLabelText('Email address'), '   ')
    await user.type(screen.getByLabelText('Password'), 'Secret!')

    await submit(user)

    expect(errorSummary()).toHaveTextContent(signInMessages.emailRequired)
    expect(errorSummary()).not.toHaveTextContent(
      signInMessages.passwordRequired,
    )
  })

  it('moves focus to a field from the error summary', async () => {
    const { user } = renderForm()
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')

    await submit(user)
    await user.click(
      screen.getByRole('link', { name: signInMessages.passwordRequired }),
    )

    expect(screen.getByLabelText('Password')).toHaveFocus()
  })

  it('signs in and hands over the journey URL from the API', async () => {
    const requests = respondWith(() => signedIn())
    const { user, onSignedIn } = renderForm({
      returnTo: '/applications/other/review',
    })
    await fillForm(user)

    await submit(user)

    await waitFor(() =>
      expect(onSignedIn).toHaveBeenCalledWith(
        '/applications/42/personal-details',
      ),
    )
    expect(requests).toEqual([
      {
        data: {
          type: 'applicant-sessions',
          attributes: { email: 'ada@example.com', password: 'Secret!' },
        },
      },
    ])
  })

  it('shows one message for rejected credentials and keeps the email', async () => {
    respondWith(() =>
      HttpResponse.json(
        {
          errors: [
            {
              status: '401',
              code: 'invalid-credentials',
              title: 'Authentication failed',
              detail: 'Invalid email or password',
            },
          ],
        },
        { status: 401 },
      ),
    )
    const { user, container, onSignedIn } = renderForm()
    await fillForm(user)

    await submit(user)

    await waitFor(() => expect(errorSummary()).toHaveFocus())
    expect(errorSummary()).toHaveTextContent(signInMessages.invalidCredentials)
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'ada@example.com',
    )
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Email address')).not.toBeInvalid()
    expect(onSignedIn).not.toHaveBeenCalled()
    expect(await axe(container)).toHaveNoViolations()
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
    await fillForm(user)

    await submit(user)

    await waitFor(() =>
      expect(
        screen.getByLabelText('Email address'),
      ).toHaveAccessibleDescription('Enter a valid email address.'),
    )
    expect(errorSummary()).toHaveFocus()
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'ada@example.com',
    )
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
      signInMessages.networkError,
    ],
    [
      'an unexpected status',
      () => new HttpResponse(null, { status: 500 }),
      signInMessages.unexpected,
    ],
    [
      'an unsafe journey URL',
      () => signedIn('https://evil.example/'),
      signInMessages.unexpected,
    ],
  ])('explains %s and keeps the email', async (_case, resolver, message) => {
    respondWith(resolver)
    const { user, onSignedIn } = renderForm()
    await fillForm(user)

    await submit(user)

    await waitFor(() => expect(errorSummary()).toHaveTextContent(message))
    expect(errorSummary()).toHaveFocus()
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'ada@example.com',
    )
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('sends one request and exposes the pending state while signing in', async () => {
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const requests = respondWith(async () => {
      await released
      return signedIn()
    })
    const { user, onSignedIn } = renderForm()
    await fillForm(user)

    await submit(user)
    const pending = await screen.findByRole('button', { name: 'Signing in…' })
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true')
    await user.click(pending)
    await user.type(screen.getByLabelText('Password'), '{Enter}')
    release()

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1))
    expect(requests).toHaveLength(1)
  })

  it('keeps returnTo on the create-account link', async () => {
    const onNavigate = vi.fn()
    const { user } = renderForm({
      onNavigate,
      returnTo: '/applications/current',
    })

    const link = screen.getByRole('link', { name: 'Create account' })
    expect(link).toHaveAttribute(
      'href',
      '/create-account?returnTo=%2Fapplications%2Fcurrent',
    )
    await user.click(link)
    expect(onNavigate).toHaveBeenCalledWith(
      '/create-account?returnTo=%2Fapplications%2Fcurrent',
    )
  })
})
