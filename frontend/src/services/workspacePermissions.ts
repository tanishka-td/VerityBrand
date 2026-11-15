export type WorkspaceRole = 'owner' | 'editor' | 'reviewer'

export type WorkspaceMemberAccess = {
  member_role: WorkspaceRole
  can_final_approve: boolean
}

export function getWorkspacePermissions(member: WorkspaceMemberAccess) {
  const isOwner = member.member_role === 'owner'

  return {
    canEditContent: isOwner || member.member_role === 'editor',
    canManageSources: isOwner,
    canMakeDecisions: isOwner || member.member_role === 'reviewer',
    canApproveFinal: isOwner || (member.member_role === 'reviewer' && member.can_final_approve),
  }
}
