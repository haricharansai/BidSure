/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['10.250.19.135', '172.26.17.56'],
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
