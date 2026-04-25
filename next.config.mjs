// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Redirect root to /tickets
  async redirects() {
    return [{ source: '/', destination: '/tickets', permanent: false }]
  },
}

export default nextConfig
