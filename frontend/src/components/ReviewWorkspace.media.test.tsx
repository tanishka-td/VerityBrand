import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { extractImageText } = vi.hoisted(() => ({ extractImageText: vi.fn() }))
vi.mock('../services/imageOcr', () => ({ extractImageText }))

import { ReviewWorkspace } from './ReviewWorkspace'
import type { ComponentProps } from 'react'

const baseProps: ComponentProps<typeof ReviewWorkspace> = {
  brandName: 'Daybreak Coffee',
  isSample: true,
  sourceCount: 4,
  draft: 'Existing Daybreak caption.',
  setDraft: vi.fn(),
  analysis: null,
  selectedFinding: null,
  onSelectFinding: vi.fn(),
  isChecking: false,
  dirty: false,
  decision: 'not_sent',
  decisions: {},
  revisions: [],
  approvedRevisionId: null,
  activity: [],
  approved: false,
  coverageAcknowledged: false,
  manualReviewRequested: false,
  onCoverageAcknowledged: vi.fn(),
  exceptionNote: '',
  setExceptionNote: vi.fn(),
  notice: '',
  onDismissNotice: vi.fn(),
  onReview: vi.fn(),
  onRequestReview: vi.fn(),
  onConfirmReview: vi.fn(),
  onRequestEvidence: vi.fn(),
  onApproveException: vi.fn(),
  onApplyWording: vi.fn(),
  onApprove: vi.fn(),
  onRequestManualReview: vi.fn(),
  onApproveManualReview: vi.fn(),
  onOpenSources: vi.fn(),
  onLoadSample: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('image text review', () => {
  it('requires a human text check before adding OCR output to the working copy', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:creative') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    extractImageText.mockResolvedValue({
      text: '20% OFF through November 30, 2026',
      confidence: 91,
      width: 1200,
      height: 900,
      paragraphs: [{ text: '20% OFF through November 30, 2026', confidence: 89, box: { x0: 100, y0: 200, x1: 900, y1: 350 } }],
    })
    const user = userEvent.setup()
    const setDraft = vi.fn()
    render(<ReviewWorkspace {...baseProps} setDraft={setDraft} />)

    await user.upload(screen.getByLabelText('Read image text'), new File(['creative'], 'offer.png', { type: 'image/png' }))

    expect(await screen.findByText('OVERALL OCR CONFIDENCE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show extracted text region 1' })).toBeInTheDocument()
    const useImageText = screen.getByRole('button', { name: 'Use image text as draft' })
    expect(useImageText).toBeDisabled()
    await user.click(screen.getByLabelText('I checked the extracted words against the image.'))
    await user.click(useImageText)

    expect(setDraft).toHaveBeenCalledWith('20% OFF through November 30, 2026')
    expect(screen.getByText('Image text is now the working copy. Run a fresh check.')).toBeInTheDocument()
  })
})
