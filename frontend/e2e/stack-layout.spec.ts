import { expect, test } from '@playwright/test'

const jsonApi = 'application/vnd.api+json'

test('application form lays out actions without forwarding style props to the DOM', async ({
  page,
}) => {
  // The form now loads saved answers, so it needs a signed-in Applicant.
  const email = `layout-${Date.now()}@example.com`
  const password = 'Secret!'
  const registered = await page.request.post('/api/v1/applicant-accounts', {
    headers: { Accept: jsonApi, 'Content-Type': jsonApi },
    data: {
      data: { type: 'applicant-accounts', attributes: { email, password } },
    },
  })
  expect(registered.status()).toBe(201)
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Start application' }).click()

  const reactWarnings: string[] = []
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text().includes('justifyContent')
    ) {
      reactWarnings.push(message.text())
    }
  })

  await expect(page).toHaveURL(/\/applications\/[^/]+\/personal-details$/)
  const actions = page.getByRole('button', { name: 'Back' }).locator('xpath=..')
  await expect(actions).toHaveCSS('justify-content', 'space-between')
  expect(reactWarnings).toEqual([])
})
