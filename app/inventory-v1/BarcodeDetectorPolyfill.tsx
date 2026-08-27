'use client'

import { useEffect } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

type DetectorResult = {
  rawValue: string
  format?: string
}

export default function BarcodeDetectorPolyfill() {
  useEffect(() => {
    if (typeof window === 'undefined' || (window as any).BarcodeDetector) return

    class ZXingBarcodeDetector {
      private reader = new BrowserMultiFormatReader()
      private canvas = document.createElement('canvas')

      constructor(_options?: { formats?: string[] }) {}

      async detect(source: HTMLVideoElement): Promise<DetectorResult[]> {
        if (!source.videoWidth || !source.videoHeight || source.readyState < 2) return []

        this.canvas.width = source.videoWidth
        this.canvas.height = source.videoHeight
        const context = this.canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return []

        context.drawImage(source, 0, 0, this.canvas.width, this.canvas.height)

        try {
          const result = this.reader.decodeFromCanvas(this.canvas)
          return [{
            rawValue: result.getText(),
            format: String(result.getBarcodeFormat?.() ?? ''),
          }]
        } catch {
          return []
        }
      }
    }

    ;(window as any).BarcodeDetector = ZXingBarcodeDetector
  }, [])

  return null
}
