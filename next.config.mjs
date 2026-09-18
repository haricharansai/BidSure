/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1', '10.250.19.135', '172.26.17.56', '10.250.24.250'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Native/dynamic-require OCR deps must stay outside the bundler.
  serverExternalPackages: ['unpdf', 'tesseract.js'],
}

export default nextConfig
