import { expect, test, type Page } from '@playwright/test'

const password = 'Secret!'
const jsonApi = 'application/vnd.api+json'

async function registerApplicant(page: Page): Promise<string> {
  const email = `sign-in-${Date.now()}@example.com`
  const response = await page.request.post('/api/v1/applicant-accounts', {
    headers: { Accept: jsonApi, 'Content-Type': jsonApi },
    data: {
      data: { type: 'applicant-accounts', attributes: { email, password } },
    },
  })
  expect(response.status()).toBe(201)
  return email
}

async function signIn(page: Page, email: string, secret: string) {
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(secret)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('applicant signs in and lands on the journey chosen by the API', async ({
  page,
}) => {
  const email = await registerApplicant(page)

  await page.goto('/sign-in')
  await expect(page).toHaveTitle('Sign in | KYC')
  const sessionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/applicant-sessions') &&
      response.request().method() === 'POST',
  )
  await signIn(page, email, password)

  const response = await sessionResponse
  expect(response.status()).toBe(201)
  const { data } = (await response.json()) as {
    data: { attributes: { href: string } }
  }
  await expect(page).toHaveURL(data.attributes.href)
  const cookies = await page.context().cookies()
  expect(cookies.map((cookie) => cookie.name)).toEqual(
    expect.arrayContaining(['__Host-KYCSESSION', 'XSRF-TOKEN']),
  )
})

test('wrong password and unknown email get the same message', async ({
  page,
}) => {
  const email = await registerApplicant(page)
  const summary = page.getByRole('alert', { name: 'There is a problem' })

  await page.goto('/sign-in')
  await signIn(page, email, 'Wrong!pass')
  await expect(summary).toBeFocused()
  const wrongPasswordMessage = await summary.textContent()
  await expect(page.getByLabel('Email address')).toHaveValue(email)
  await expect(page.getByLabel('Password')).toHaveValue('')

  await page.reload()
  await signIn(page, `unknown-${Date.now()}@example.com`, password)
  await expect(summary).toBeFocused()
  expect(await summary.textContent()).toBe(wrongPasswordMessage)
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('required fields are checked before contacting the API', async ({
  page,
}) => {
  let sessionRequests = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/applicant-sessions')) {
      sessionRequests += 1
    }
  })

  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Sign in' }).click()

  const summary = page.getByRole('alert', { name: 'There is a problem' })
  await expect(summary).toBeFocused()
  await summary.getByRole('link', { name: 'Enter your password.' }).click()
  await expect(page.getByLabel('Password')).toBeFocused()
  expect(sessionRequests).toBe(0)
})
