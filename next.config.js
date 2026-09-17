/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdfkit', 'qrcode', 'bcryptjs'],
  allowedDevOrigins: ['event.neoclare.com', 'localhost:5000', '127.0.0.1:5000', '*.neoclare.com'],
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
