/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Stop MIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Referrer policy
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Force HTTPS for 1 year
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // Restrict browser features
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
  },
  // Content Security Policy
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js inline scripts + Vercel Analytics
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
      // Styles: self + inline (needed for Tailwind/CSS-in-JS) + unpkg for Leaflet
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      // Images: self + data URIs (for map tiles/icons) + tile servers
      "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.tomtom.com",
      // Fonts from self (next/font self-hosts them)
      "font-src 'self'",
      // API calls: your Render backend + external APIs
      `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL || ''} https://api.openweathermap.org https://api.tomtom.com wss:`,
      // Leaflet CSS from unpkg
      "style-src-elem 'self' 'unsafe-inline' https://unpkg.com",
      // Workers for map rendering
      "worker-src blob:",
    ].join('; '),
  },
]

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Re-enable Vercel image optimization (WebP/AVIF auto-conversion)
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // Cache static assets aggressively (they have content hashes)
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

export default nextConfig
