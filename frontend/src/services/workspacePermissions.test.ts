import { describe, expect, it } from 'vitest'
import { getWorkspacePermissions } from './workspacePermissions'

describe('workspace role permissions', () => {
  it('lets Owners manage sources and approve', () => {
    expect(getWorkspacePermissions({ member_role: 'owner', can_final_approve: false })).toEqual({
      canEditContent: true,
      canManageSources: true,
      canMakeDecisions: true,
      canApproveFinal: true,
    })
  })

  it('lets Editors work on drafts without source or approval authority', () => {
    expect(getWorkspacePermissions({ member_role: 'editor', can_final_approve: false })).toEqual({
      canEditContent: true,
      canManageSources: false,
      canMakeDecisions: false,
      canApproveFinal: false,
    })
  })

  it('lets Reviewers record decisions but only authorized Reviewers approve', () => {
    expect(getWorkspacePermissions({ member_role: 'reviewer', can_final_approve: false })).toMatchObject({
      canManageSources: false,
      canMakeDecisions: true,
      canApproveFinal: false,
    })
    expect(getWorkspacePermissions({ member_role: 'reviewer', can_final_approve: true })).toMatchObject({
      canManageSources: false,
      canMakeDecisions: true,
      canApproveFinal: true,
    })
  })
})
