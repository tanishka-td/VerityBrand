import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

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

function StatefulWorkspace({ onDraftChange }: { onDraftChange: (value: string) => void }) {
  const [draft, setDraft] = useState(baseProps.draft)
  return <ReviewWorkspace {...baseProps} draft={draft} setDraft={(value) => { setDraft(value); onDraftChange(value) }} />
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('image text review', () => {
  it('shows the chosen image immediately, identifies it, and removes it without retaining a preview', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    let finishOcr: ((value: { text: string; confidence: number; width: number; height: number; paragraphs: Array<{ text: string; confidence: number; box: { x0: number; y0: number; x1: number; y1: number } }> }) => void) | undefined
    extractImageText.mockImplementation(() => new Promise((resolve) => { finishOcr = resolve }))
    const user = userEvent.setup({ applyAccept: false })
    render(<ReviewWorkspace {...baseProps} />)

    await user.upload(screen.getByLabelText('Upload image'), new File(['image'], 'campaign.jpg', { type: 'image/jpeg' }))
    expect(screen.getByRole('img', { name: 'Image being reviewed: campaign.jpg' })).toHaveAttribute('src', 'blob:first')
    expect(screen.getByText('IMAGE BEING ANALYSED')).toBeInTheDocument()
    expect(screen.getAllByText('campaign.jpg')).toHaveLength(2)
    expect(screen.getByText(/does not interpret the image or verify visual claims/)).toBeInTheDocument()

    finishOcr?.({ text: '20% off', confidence: 90, width: 1200, height: 900, paragraphs: [] })
    await screen.findByText('OCR CONFIDENCE · ENGLISH TEXT')
    await user.upload(screen.getByLabelText('Replace image'), new File(['replacement'], 'campaign-new.jpg', { type: 'image/jpeg' }))
    expect(screen.getByRole('img', { name: 'Image being reviewed: campaign-new.jpg' })).toHaveAttribute('src', 'blob:second')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first')
    finishOcr?.({ text: 'New image text', confidence: 92, width: 800, height: 600, paragraphs: [] })
    expect(await screen.findByLabelText('Extracted image text')).toHaveValue('New image text')
    await user.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(screen.queryByRole('img', { name: 'Image being reviewed: campaign-new.jpg' })).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second')
  })

  it('rejects unsupported image types and files over 10 MB', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<ReviewWorkspace {...baseProps} />)
    const imageUpload = screen.getByLabelText('Upload image')
    await user.upload(imageUpload, new File(['not an image'], 'campaign.gif', { type: 'image/gif' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Choose a PNG, JPG, or WebP image.')
    expect(extractImageText).not.toHaveBeenCalled()

    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
    await user.upload(imageUpload, oversized)
    expect(await screen.findByRole('status')).toHaveTextContent('Choose an image smaller than 10 MB.')
    expect(extractImageText).not.toHaveBeenCalled()
  })

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
    const user = userEvent.setup({ applyAccept: false })
    const setDraft = vi.fn()
    render(<StatefulWorkspace onDraftChange={setDraft} />)

    await user.upload(screen.getByLabelText('Upload image'), new File(['creative'], 'offer.png', { type: 'image/png' }))

    expect(await screen.findByText('OCR CONFIDENCE · ENGLISH TEXT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show extracted text region 1' })).toBeInTheDocument()
    const useImageText = screen.getByRole('button', { name: 'Use image text as draft' })
    expect(useImageText).toBeDisabled()
    await user.click(screen.getByLabelText('I checked the extracted words against the image.'))
    await user.click(useImageText)

    expect(setDraft).toHaveBeenCalledWith('20% OFF through November 30, 2026')
    expect(screen.getByText('Image text is now the working copy. Run a fresh check.')).toBeInTheDocument()
  })
})

describe('text document review', () => {
  it('previews the selected filename and text, replaces it, and restores the original working copy when removed', async () => {
    const user = userEvent.setup()
    const setDraft = vi.fn()
    render(<StatefulWorkspace onDraftChange={setDraft} />)
    const upload = screen.getByLabelText('Upload text')

    await user.upload(upload, new File(['Draft from the first file.'], 'campaign-one.txt', { type: 'text/plain' }))
    expect(screen.getByText('campaign-one.txt')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Edit campaign caption' })).toHaveValue('Draft from the first file.')

    await user.upload(screen.getByLabelText('Replace text file'), new File(['Updated copy.'], 'campaign-two.md', { type: 'text/markdown' }))
    expect(screen.getByText('campaign-two.md')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Edit campaign caption' })).toHaveValue('Updated copy.')
    await user.click(screen.getByRole('button', { name: 'Remove file' }))
    expect(screen.queryByText('campaign-two.md')).not.toBeInTheDocument()
    expect(setDraft).toHaveBeenLastCalledWith(baseProps.draft)
  })

  it('rejects non-text extensions without replacing the current draft', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const setDraft = vi.fn()
    render(<ReviewWorkspace {...baseProps} setDraft={setDraft} />)
    await user.upload(screen.getByLabelText('Upload text'), new File(['no'], 'copy.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Choose a .txt or .md file.')
    expect(setDraft).not.toHaveBeenCalled()
  })

  it('rejects text files over 2 MB without replacing the current draft', async () => {
    const user = userEvent.setup()
    const setDraft = vi.fn()
    render(<ReviewWorkspace {...baseProps} setDraft={setDraft} />)
    const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText('Upload text'), oversized)
    expect(await screen.findByRole('status')).toHaveTextContent('That file is over 2 MB.')
    expect(setDraft).not.toHaveBeenCalled()
  })
})
