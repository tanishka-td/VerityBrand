import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { DEMO_DRAFT } from './data/demoKnowledge'

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

async function openDaybreakReview() {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: /Try the sample review/i }))
  await screen.findByRole('button', { name: 'Run the check again' })
}

describe('review workflow', () => {
  it('keeps owner confirmation, creator revision, recheck, and final approval as separate stages', async () => {
    const user = userEvent.setup()
    await openDaybreakReview()

    await user.click(screen.getByRole('button', { name: 'Send claim for review' }))
    await user.click(screen.getByRole('button', { name: 'Source is current' }))
    expect(screen.getByText('Source confirmed. Claim still needs attention.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve this version' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apply this change to the draft' }))
    const editor = screen.getByRole('textbox', { name: 'Edit campaign caption' })
    expect(editor).toHaveValue(DEMO_DRAFT.replace('20% off through November 30, 2026', '10% off through November 15, 2026'))
    await user.click(screen.getByText('Draft revision history'))
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === DEMO_DRAFT)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Check against sources' }))
    await screen.findByRole('button', { name: 'Run the check again' })
    expect(screen.getByText('Version 02')).toBeInTheDocument()

    const cleanedDraft = DEMO_DRAFT
      .replace('20% off through November 30, 2026', '10% off through November 15, 2026')
      .replace('The Summer Blend is still available through August 31, 2026, and uses Guatemala beans.\n', '')
      .replace('Daybreak is the best cold brew in the city.', '')
      .trim()
    await user.clear(editor)
    await user.type(editor, cleanedDraft)
    await user.click(screen.getByRole('button', { name: 'Check against sources' }))
    await screen.findByRole('button', { name: 'Run the check again' })
    expect(screen.getByText('Version 03')).toBeInTheDocument()

    await user.click(screen.getByLabelText('I reviewed the remaining copy and am comfortable approving this version.'))
    await user.click(screen.getByRole('button', { name: 'Approve this version' }))

    expect(screen.getByText('Version approved')).toBeInTheDocument()
    expect(screen.getByText(/Final authorized approval.*Version 03/)).toBeInTheDocument()
  })

  it('records an exception without treating it as verification or final approval', async () => {
    const user = userEvent.setup()
    await openDaybreakReview()

    await user.click(screen.getByRole('button', { name: 'Send claim for review' }))
    fireEvent.change(screen.getByPlaceholderText('Add a short reason'), { target: { value: 'Approved for this campaign only.' } })
    await user.click(screen.getByRole('button', { name: 'Record' }))

    expect(screen.getByText('Owner approved this exception')).toBeInTheDocument()
    expect(screen.getAllByText('Mismatch').length).toBeGreaterThan(0)
    expect(screen.getByText('Exception approved')).toBeInTheDocument()
    expect(screen.queryByText('The promotion matches the current approved offer.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve this version' })).not.toBeInTheDocument()
    expect(screen.queryByText('Version approved')).not.toBeInTheDocument()
  })

  it('preserves custom checked revision history while opening Daybreak', async () => {
    window.localStorage.setItem('veritybrand-workspaces-v3', JSON.stringify({
      profiles: [{ id: 'northstar', name: 'Northstar', sources: [] }],
      activeProfileId: 'northstar',
      returnProfileId: 'northstar',
      drafts: { northstar: 'Custom saved copy.' },
      draftRevisionsByProfile: {
        northstar: [{
          id: 'northstar-revision-1',
          content: 'Custom saved copy.',
          checked_at: '2026-11-09T12:00:00.000Z',
          analysis: { overall_status: 'ready_for_final_approval' },
        }],
      },
    }))

    const user = userEvent.setup()
    await openDaybreakReview()
    await user.click(screen.getByRole('button', { name: /Back to Northstar/ }))
    await user.click(screen.getByText('Draft revision history'))

    expect(screen.getAllByText('Custom saved copy.').length).toBeGreaterThan(0)
  })
})
