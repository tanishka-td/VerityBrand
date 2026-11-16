import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { auth, from } = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
  },
  from: vi.fn(),
}))

vi.mock('../services/supabase', () => ({ supabase: { auth, from } }))

import { SupabaseApp } from './SupabaseApp'

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  from.mockImplementation((table: string) => {
    const member = { workspace_id: 'workspace-1', user_id: 'user-1', member_role: 'reviewer', can_final_approve: false }
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

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

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
    expect(screen.queryByLabelText('Judge demo account')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Choose a starting point' }))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('returns to sign-in with a clear error when session restore fails', async () => {
    auth.getSession.mockRejectedValue(new Error('offline'))
    render(<SupabaseApp initialSection="review" onTryDemo={vi.fn()} onExit={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Sign in to review content' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('We could not restore your sign-in.')
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

  it('shows and uses only configured public judge-demo credentials', async () => {
    vi.stubEnv('VITE_JUDGE_DEMO_EMAIL', 'judge@example.com')
    vi.stubEnv('VITE_JUDGE_DEMO_PASSWORD', 'public-demo-password')
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: null })
    render(<SupabaseApp initialSection="review" onTryDemo={vi.fn()} onExit={vi.fn()} />)

    expect(await screen.findByText('judge@example.com')).toBeInTheDocument()
    expect(screen.getByText('public-demo-password')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use demo account' }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'judge@example.com', password: 'public-demo-password' })
  })

  it('lets a member switch between workspaces they belong to', async () => {
    const memberships = [
      { workspace_id: 'workspace-1', user_id: 'user-1', member_role: 'reviewer', can_final_approve: false },
      { workspace_id: 'workspace-2', user_id: 'user-1', member_role: 'editor', can_final_approve: false },
    ]
    const workspaces = new Map([['workspace-1', { id: 'workspace-1', name: 'Northstar' }], ['workspace-2', { id: 'workspace-2', name: 'Starlight' }]])
    from.mockImplementation((table: string) => {
      let selectedWorkspaceId = ''
      const query: any = {
        select: () => query,
        eq: (_column: string, value: string) => { selectedWorkspaceId = value; return query },
        order: () => query,
        limit: () => query,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: workspaces.get(selectedWorkspaceId) ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'workspace_members' ? memberships : [], error: null }).then(resolve),
      }
      return query
    })
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1', email: 'member@example.com' } } } })
    render(<SupabaseApp initialSection="review" onTryDemo={vi.fn()} onExit={vi.fn()} />)

    const selector = await screen.findByRole('combobox', { name: 'Brand workspace' })
    expect(selector).toHaveValue('workspace-1')
    await userEvent.selectOptions(selector, 'workspace-2')
    expect(await screen.findByText('Starlight')).toBeInTheDocument()
    expect(screen.getByText('editor · 0 approved sources')).toBeInTheDocument()
  })
})
