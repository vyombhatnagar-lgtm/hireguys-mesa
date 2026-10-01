/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['mammoth', 'unpdf', '@electric-sql/pglite'] },
};
export default nextConfig;
