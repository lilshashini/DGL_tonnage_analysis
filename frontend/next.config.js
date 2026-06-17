/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export as fully static HTML/CSS/JS files
  output: 'export',
  // The FastAPI will serve files from /static, so set the base path accordingly
  // trailingSlash ensures index.html is created for each route
  trailingSlash: true,
  // Disable Next.js image optimization (not compatible with static export)
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
