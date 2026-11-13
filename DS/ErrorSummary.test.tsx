import { fireEvent, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ErrorSummary } from './ErrorSummary'

expect.extend(toHaveNoViolations)

describe('ErrorSummary', () => {
  it('is an alert named by its heading that lists the form message', async () => {
    const { container } = render(
      <ErrorSummary items={[]} message="We could not reach the service." />,
    )

    const summary = screen.getByRole('alert', { name: 'There is a problem' })
    expect(summary.textContent).toContain('We could not reach the service.')
    expect(
      screen.getByRole('heading', { level: 2, name: 'There is a problem' }),
    ).toBeDefined()
    expect(screen.queryByRole('list')).toBeNull()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('links each field problem to its field and calls onSelect', async () => {
    const onSelect = vi.fn()
    const { container } = render(
      <>
        <ErrorSummary
          items={[
            {
              fieldId: 'email',
              message: 'Enter your email address.',
              onSelect,
            },
          ]}
        />
        <label htmlFor="email">Email address</label>
        <input id="email" />
      </>,
    )

    const link = screen.getByRole('link', { name: 'Enter your email address.' })
    expect(link.getAttribute('href')).toBe('#email')
    fireEvent.click(link)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('can receive focus through its ref', () => {
    const ref = createRef<HTMLElement>()
    render(<ErrorSummary items={[]} message="Problem" ref={ref} />)

    ref.current?.focus()

    expect(document.activeElement).toBe(
      screen.getByRole('alert', { name: 'There is a problem' }),
    )
  })
})
