import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { auth, from } = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
  from: vi.fn(),
}))

vi.mock('../services/supabase', () => ({ supabase: { auth, from } }))

import { SupabaseApp } from './SupabaseApp'

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  from.mockImplementation((table: string) => {
    const member = { workspace_id: 'workspace-1', user_id: 'user-1', member_role: 'reviewer' }
    const workspace = { id: 'workspace-1', name: 'Northstar' }
    const result = table === 'workspace_members' ? [member] : table === 'workspaces' ? workspace : []
    const query: any = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: () => Promise.resolve({ data: workspace, error: null }),
      single: () => Promise.resolve({ data: workspace, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: result, error: null }).then(resolve),
    }
    return query
  })
})

afterEach(() => cleanup())

describe('Supabase role entry points', () => {
  it.each([
    ['review', 'Sign in to review content', 'CREATOR & REVIEWER'],
    ['knowledge', 'Sign in to manage sources', 'BRAND STEWARD'],
  ] as const)('opens the %s auth entry with its own context', async (initialSection, heading, context) => {
    const onExit = vi.fn()
    render(<SupabaseApp initialSection={initialSection} onTryDemo={vi.fn()} onExit={onExit} />)

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.getByText(`VERITYBRAND · ${context}`)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Choose a starting point' }))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it.each([
    ['review', 'Content review', 'CREATOR & REVIEWER'],
    ['knowledge', 'Approved sources', 'BRAND STEWARD'],
  ] as const)('lands in the selected %s workspace view after sign-in', async (initialSection, navigation, role) => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1', email: 'judge@example.com' } } } })
    render(<SupabaseApp initialSection={initialSection} onTryDemo={vi.fn()} onExit={vi.fn()} />)

    expect(await screen.findByRole('button', { name: navigation })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText(role)).toBeInTheDocument()
    expect(screen.getAllByText('Northstar')).toHaveLength(2)
  })
})
