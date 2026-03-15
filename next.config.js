/** @type {import('next').NextConfig} */
const nextConfig = process.env.CAPACITOR_BUILD === "1"
  ? { output: "export" }
  : {}

module.exports = nextConfig
