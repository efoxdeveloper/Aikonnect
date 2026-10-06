/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        gray: { 50: "#fafafa", 100: "#f5f5f5", 200: "#e7e7e7", 300: "#d6d7d5", 500: "#737373", 700: "#404040", 900: "#171717" },
        emerald: { 50: "#f6f7f6", 100: "#ebf7f0", 200: "#a4ebbe", 300: "#64de92", 400: "#2bc666", 500: "#23a455", 600: "#1f934c", 700: "#1d8242", 800: "#186d38", 900: "#105029" },
        green: { 50: "#f6f7f6", 100: "#ebf7f0", 200: "#a4ebbe", 300: "#64de92", 400: "#2bc666", 500: "#23a455", 600: "#1f934c", 700: "#1d8242", 800: "#186d38", 900: "#105029", 950: "#052e27" },
        red: { 50: "#fef2f2", 100: "#f5dada", 200: "#efcaca", 600: "#c94545", 700: "#b93737", 800: "#9f2f2f" },
        amber: { 50: "#fff7e8", 100: "#ffedc4", 500: "#c9820d", 600: "#b47405", 700: "#a66a00", 800: "#855500" },
        blue: { 50: "#eff6ff", 100: "#dce9fb", 500: "#3b72d9", 600: "#315da8", 700: "#315da8" },
        purple: { 50: "#f5f3ff", 100: "#ebe7ff", 500: "#7b5bd6", 600: "#6941c6", 700: "#6941c6" },
        violet: { 50: "#f5f3ff", 100: "#ebe7ff", 500: "#7b5bd6", 600: "#6941c6", 700: "#6941c6" },
        slate: { 200: "#e7e7e7", 900: "#171717", 950: "#042d1d" },
      },
      fontFamily: { sans: ["Inter", "sans-serif"], mono: ["Inter", "sans-serif"] },
    },
  },
  plugins: [],
};
