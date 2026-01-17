/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Dark theme colors
        dark: {
          bg: "#111827",
          card: "#1f2937",
          border: "#374151",
        },
      },
    },
  },
  plugins: [],
};
