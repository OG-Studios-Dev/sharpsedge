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
          bg: "#0a0a0f",
          card: "#141419",
          border: "#1e1e26",
          surface: "#1a1a22",
        },
        accent: {
          blue: "#4a9eff",
          green: "#22c55e",
          yellow: "#eab308",
          red: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};

export default config;
