import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
]

const noStoreHeaders = [
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/api/balcao/:path*',
        headers: noStoreHeaders,
      },
      {
        source: '/api/inventory/:path*',
        headers: noStoreHeaders,
      },
      {
        source: '/api/products/:path*',
        headers: noStoreHeaders,
      },
    ]
  },
}

export default nextConfig
