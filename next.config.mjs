/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['10.250.19.135', '172.26.17.56'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
