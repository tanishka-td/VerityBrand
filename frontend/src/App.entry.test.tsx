import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEMO_DRAFT } from './data/demoKnowledge'

const { auth } = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}))

vi.mock('./services/supabase', () => ({ supabase: { auth }, supabaseConfigMissing: false }))

import App from './App'

beforeEach(() => {
  window.localStorage.clear()
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('configured three-view entry', () => {
  it('opens separate review and source auth entry points from the restored landing page', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText(/SIGN-IN FOR WORKSPACES/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Open the review desk/i }))
    expect(await screen.findByRole('heading', { name: 'Sign in to review content' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose a starting point' }))

    await user.click(screen.getByRole('button', { name: /Open the source cabinet/i }))
    expect(await screen.findByRole('heading', { name: 'Sign in to manage sources' })).toBeInTheDocument()
  })

  it('opens Daybreak directly from the landing page without an account', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Try the sample review/i }))
    expect(await screen.findByRole('textbox', { name: 'Edit campaign caption' })).toHaveValue(DEMO_DRAFT)
    expect(screen.queryByRole('heading', { name: 'Sign in to review content' })).not.toBeInTheDocument()
    expect(screen.getByText('Guided sample · changes are temporary.')).toBeInTheDocument()
  })
})
