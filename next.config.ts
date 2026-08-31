import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mailparser", "sanitize-html", "@aws-sdk/client-s3"],
};

export default nextConfig;
