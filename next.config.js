/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdfkit', 'qrcode', 'bcryptjs'],
  experimental: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
