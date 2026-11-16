import { afterEach, describe, expect, it, vi } from 'vitest'

const { createWorker, recognize } = vi.hoisted(() => {
  const recognize = vi.fn()
  return { createWorker: vi.fn(async () => ({ recognize })), recognize }
})

vi.mock('tesseract.js', () => ({ createWorker }))

import { extractImageText } from './imageOcr'

afterEach(() => {
  recognize.mockReset()
  createWorker.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('extractImageText', () => {
  it('returns OCR text, confidence and image-region coordinates', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 900, close: vi.fn() })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['image'], { type: 'image/png' })))
    recognize.mockResolvedValue({ data: {
      text: '20% OFF through November 30, 2026',
      confidence: 91.4,
      blocks: [{ paragraphs: [{ text: '20% OFF through November 30, 2026', confidence: 88.6, bbox: { x0: 100, y0: 200, x1: 900, y1: 350 } }] }],
    } })

    const result = await extractImageText(new File(['pixels'], 'creative.png', { type: 'image/png' }))

    expect(result).toMatchObject({
      text: '20% OFF through November 30, 2026',
      confidence: 91,
      width: 1200,
      height: 900,
      paragraphs: [{ confidence: 89, box: { x0: 100, y0: 200, x1: 900, y1: 350 } }],
    })
  })

  it('rejects unsupported formats before starting OCR', async () => {
    await expect(extractImageText(new File(['text'], 'draft.txt', { type: 'text/plain' }))).rejects.toThrow('Choose a PNG, JPG, or WebP image.')
    expect(createWorker).not.toHaveBeenCalled()
  })

  it('rejects oversized uploads before starting OCR', async () => {
    const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
    await expect(extractImageText(tooLarge)).rejects.toThrow('smaller than 10 MB')
    expect(createWorker).not.toHaveBeenCalled()
  })
})
