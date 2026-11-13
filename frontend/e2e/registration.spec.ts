import { expect, test } from '@playwright/test'

test('applicant registers, is sent to sign-in, and cannot reuse the email', async ({
  page,
}) => {
  const email = `applicant-${Date.now()}@example.com`

  async function register() {
    await page.goto('/create-account')
    await expect(page).toHaveTitle('Create account | KYC')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('Secret!')
    await page.getByLabel('Confirm password').fill('Secret!')
    await page.getByRole('button', { name: 'Create account' }).click()
  }

  await register()

  const confirmation = page.getByRole('heading', { name: 'Account created' })
  await expect(confirmation).toBeFocused()
  await expect(page.getByRole('status')).toContainText(email)

  await page.getByRole('link', { name: 'Sign in to your account' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)

  await register()

  const summary = page.getByRole('alert', { name: 'There is a problem' })
  await expect(summary).toBeFocused()
  await expect(summary).toContainText(
    'An account already exists for this email address.',
  )
  await expect(page.getByLabel('Email address')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
})

test('client-side validation runs before contacting the API', async ({
  page,
}) => {
  let registrationRequests = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/applicant-accounts')) {
      registrationRequests += 1
    }
  })

  await page.goto('/create-account')
  await page.getByLabel('Email address').fill('not-an-email')
  await page.getByLabel('Password', { exact: true }).fill('weak')
  await page.getByLabel('Confirm password').fill('different')
  await page.getByRole('button', { name: 'Create account' }).click()

  const summary = page.getByRole('alert', { name: 'There is a problem' })
  await expect(summary).toBeFocused()
  await expect(summary.getByRole('link')).toHaveCount(3)

  await summary.getByRole('link', { name: 'Passwords do not match.' }).click()
  await expect(page.getByLabel('Confirm password')).toBeFocused()
  expect(registrationRequests).toBe(0)
})
