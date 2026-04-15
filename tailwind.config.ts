import type { Config } from "tailwindcss";

// NOTE: In Tailwind v4, theme configuration is done in globals.css via @theme {}
// This file is kept for IDE tooling compatibility only.
const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
