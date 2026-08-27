/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { border: "hsl(var(--border))", ring: "hsl(var(--ring))" },
      fontFamily: { sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"] },
    },
  },
  plugins: [],
};
