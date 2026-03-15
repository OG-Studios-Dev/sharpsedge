import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: "#08080f",
          card: "#111118",
          surface: "#1a1a24",
          border: "#222230",
        },
        accent: {
          blue: "#4a9eff",
          green: "#22c55e",
          yellow: "#f59e0b",
          red: "#ef4444",
          champagne: "#c9a84c",
        },
        text: {
          platinum: "#e8e6f0",
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        heading: ["var(--font-inter)", "sans-serif"],
        drama: ["var(--font-playfair)", "serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
