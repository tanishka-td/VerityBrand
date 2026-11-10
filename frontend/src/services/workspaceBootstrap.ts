export async function createInitialOwnerMembership(client: any, workspaceId: string, userId: string) {
  const membership = { workspace_id: workspaceId, user_id: userId, member_role: 'owner' }
  const inserted = await client.from('workspace_members').insert(membership)
  if (inserted.error && inserted.error.code !== '23505') throw inserted.error

  // The select policy requires membership. Read only after the insert commits.
  const result = await client.from('workspace_members')
    .select('workspace_id,user_id,member_role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()
  if (result.error) throw result.error
  if (inserted.error && !result.data) throw inserted.error
  if (!result.data) throw new Error('Workspace owner membership was not returned after creation.')
  return result.data
}
