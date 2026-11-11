import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { DEMO_DRAFT } from './data/demoKnowledge'

const storageKey = 'veritybrand-workspaces-v3'
const offerQuestion = 'The approved offer is 10% off through November 15, 2026, but this draft says 20% off through November 30. Is the approved offer still current, or is there updated approval for the draft terms?'

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('judge demo startup', () => {
  it('restores the three choice landing page and opens the Daybreak sample without sign-in', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /Where would youlike to begin\?/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open the review desk/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open the source cabinet/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Try the sample review/i }))
    const editor = await screen.findByRole('textbox', { name: 'Edit campaign caption' })
    expect(editor).toHaveValue(DEMO_DRAFT)
    expect((await screen.findAllByText(/20% off through November 30/)).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Sample sources' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sample sources' }))
    expect(screen.getByText('Cold Brew product facts')).toBeInTheDocument()
    expect(screen.getByText('November offer approval')).toBeInTheDocument()
    expect(screen.getByText('Daybreak brand voice')).toBeInTheDocument()
  })

  it('keeps separate creator and steward destinations reachable from the landing page', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /Open the review desk/i }))
    expect(await screen.findByRole('button', { name: 'Check against sources' })).toBeInTheDocument()
    await userEvent.click(screen.getByTitle('Choose a starting point'))

    await userEvent.click(screen.getByRole('button', { name: /Open the source cabinet/i }))
    expect(await screen.findByRole('heading', { name: /Put your standards to work/ })).toBeInTheDocument()
  })

  it('keeps saved custom workspaces and drafts when starting in Daybreak', async () => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      profiles: [{ id: 'northstar', name: 'Northstar', sources: [] }],
      activeProfileId: 'northstar',
      returnProfileId: 'northstar',
      drafts: { northstar: 'A custom draft that must be preserved.' },
      analysis: {
        brand_name: 'Northstar',
        review_date: '2026-11-10',
        overall_status: 'ready_for_final_approval',
        final_approval_required: true,
        summary: { supported: 1, contradicted: 0, outdated: 0, unverified: 0 },
        findings: [{
          id: 'northstar-fact',
          claim: 'Northstar is good.',
          category: 'product_fact',
          status: 'supported',
          severity: 'low',
          explanation: 'Matches its approved source.',
          evidence: [{ source_id: 'northstar-source', title: 'Northstar facts', text: 'Northstar is good.' }],
          suggested_action: '',
          reviewer_role: null,
          requires_human_review: false,
        }],
      },
      selectedId: 'northstar-fact',
      decisions: { 'northstar-fact': 'confirmed' },
      approved: true,
      coverageAcknowledged: true,
      manualReviewRequested: false,
      activity: ['Existing activity'],
    }))

    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /Try the sample review/i }))
    expect(await screen.findByRole('textbox', { name: 'Edit campaign caption' })).toHaveValue(DEMO_DRAFT)
    await userEvent.click(screen.getByRole('button', { name: /Back to Northstar/ }))
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Edit campaign caption' })).toHaveValue('A custom draft that must be preserved.')
    })
    expect(screen.getByText('Version approved')).toBeInTheDocument()
    expect(screen.getByText('Existing activity')).toBeInTheDocument()
  })

  it('opens the sample when the saved browser state is malformed', async () => {
    window.localStorage.setItem(storageKey, '{invalid json')

    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /Try the sample review/i }))
    expect(await screen.findByRole('textbox', { name: 'Edit campaign caption' })).toHaveValue(DEMO_DRAFT)
    expect((await screen.findAllByText(/20% off through November 30/)).length).toBeGreaterThan(0)
  })

  it('asks the Offer Manager a specific question and keeps it off unrelated claims', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Try the sample review/i }))
    await screen.findAllByText(/20% off through November 30/)
    await screen.findByRole('button', { name: 'Run the check again' })
    await user.click(screen.getByRole('button', { name: 'Send claim for review' }))
    expect(await screen.findByText(offerQuestion)).toBeInTheDocument()

    const editor = screen.getByRole('textbox', { name: 'Edit campaign caption' })
    fireEvent.change(editor, { target: { value: `${DEMO_DRAFT} Our coffee is the best.` } })
    await user.click(screen.getByRole('button', { name: /Check against sources/ }))
    const claimRows = await screen.findAllByRole('button', { name: /best/ })
    const unsupportedFinding = claimRows.find((row) => row.textContent?.includes('Unverified'))
    expect(unsupportedFinding).toBeDefined()
    await user.click(unsupportedFinding!)
    await user.click(screen.getByRole('button', { name: 'Send claim for review' }))

    expect(screen.queryByText(offerQuestion)).not.toBeInTheDocument()
    expect(screen.getByText('“best” is a comparative claim, and no approved evidence for it was found.')).toBeInTheDocument()
  })
})
