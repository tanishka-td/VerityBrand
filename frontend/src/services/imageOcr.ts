import { createWorker } from 'tesseract.js'

export type OcrBox = { x0: number; y0: number; x1: number; y1: number }
export type OcrParagraph = { text: string; confidence: number; box: OcrBox }
export type ImageOcrResult = {
  text: string
  confidence: number
  paragraphs: OcrParagraph[]
  width: number
  height: number
}
export type OcrProgress = { status: string; percent: number }

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_PIXELS = 24_000_000
let workerPromise: ReturnType<typeof createWorker> | null = null
let onProgress: ((progress: OcrProgress) => void) | undefined

function getWorker() {
  workerPromise ??= createWorker('eng', 1, {
    logger: (message) => onProgress?.({ status: message.status, percent: Math.round((message.progress ?? 0) * 100) }),
  }).catch((error: unknown) => {
    workerPromise = null
    throw error
  })
  return workerPromise
}

async function prepareImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
    throw new Error('Choose a PNG, JPG, or WebP image.')
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 10 MB.')

  let bitmap: ImageBitmap | undefined
  let svgUrl: string | undefined
  try {
    let source: CanvasImageSource
    let width: number
    let height: number
    if (file.type === 'image/svg+xml') {
      svgUrl = URL.createObjectURL(file)
      const image = new Image()
      image.src = svgUrl
      await image.decode()
      source = image
      width = image.naturalWidth
      height = image.naturalHeight
    } else {
      bitmap = await createImageBitmap(file)
      source = bitmap
      width = bitmap.width
      height = bitmap.height
    }
    if (width * height > MAX_IMAGE_PIXELS) throw new Error('This image is too large to check safely. Use an image under 24 megapixels.')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser could not prepare the image for text extraction.')
    context.drawImage(source, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('This image could not be prepared for text extraction.')), 'image/png')
    })
    return { blob, width, height }
  } finally {
    bitmap?.close()
    if (svgUrl) URL.revokeObjectURL(svgUrl)
  }
}

export async function extractImageText(file: File, reportProgress?: (progress: OcrProgress) => void): Promise<ImageOcrResult> {
  const prepared = await prepareImage(file)
  onProgress = reportProgress
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(prepared.blob, {}, { text: true, blocks: true })
    const paragraphs = (data.blocks ?? []).flatMap((block) => block.paragraphs ?? [])
      .map((paragraph) => ({
        text: paragraph.text.trim(),
        confidence: Math.round(paragraph.confidence),
        box: { x0: paragraph.bbox.x0, y0: paragraph.bbox.y0, x1: paragraph.bbox.x1, y1: paragraph.bbox.y1 },
      }))
      .filter((paragraph) => paragraph.text.length > 0)
    const text = paragraphs.length ? paragraphs.map((paragraph) => paragraph.text).join('\n') : data.text.trim()
    if (!text) throw new Error('No readable text was found. Try a sharper, higher-contrast image.')
    return { text, confidence: Math.round(data.confidence), paragraphs, width: prepared.width, height: prepared.height }
  } finally {
    onProgress = undefined
  }
}
