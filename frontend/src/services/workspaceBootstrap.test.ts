import { describe, expect, it, vi } from 'vitest'
import { createInitialOwnerMembership } from './workspaceBootstrap'

describe('createInitialOwnerMembership', () => {
  it('inserts without requesting a returned row, then reads membership after commit', async () => {
    const membership = { workspace_id: 'workspace-1', user_id: 'user-1', member_role: 'owner' }
    const calls: string[] = []
    const client = {
      from: vi.fn(() => ({
        insert: vi.fn(async (value) => { calls.push(`insert:${JSON.stringify(value)}`); return { error: null } }),
        select: vi.fn(() => {
          calls.push('select')
          return {
            eq: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: membership, error: null })) })) })),
          }
        }),
      })),
    }

    await expect(createInitialOwnerMembership(client, membership.workspace_id, membership.user_id)).resolves.toEqual(membership)
    expect(calls).toEqual([`insert:${JSON.stringify(membership)}`, 'select'])
  })

  it('loads the winning membership if another session bootstraps at the same time', async () => {
    const membership = { workspace_id: 'workspace-1', user_id: 'user-1', member_role: 'owner' }
    let selects = 0
    const client = {
      from: vi.fn(() => ({
        insert: vi.fn(async () => ({ error: { code: '23505', message: 'duplicate key' } })),
        select: vi.fn(() => {
          selects += 1
          return { eq: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: membership, error: null })) })) })) }
        }),
      })),
    }

    await expect(createInitialOwnerMembership(client, membership.workspace_id, membership.user_id)).resolves.toEqual(membership)
    expect(selects).toBe(1)
  })
})
