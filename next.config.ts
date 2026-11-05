import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  devIndicators: false,
  // The Daytona SDK loads form-data with a dynamic require for file uploads,
  // which breaks when bundled; load it from node_modules at runtime instead
  serverExternalPackages: ["@daytona/sdk"],
}

export default nextConfig
