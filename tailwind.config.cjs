/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./frontend/index.html",
    "./frontend/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f4ff",
          100: "#e0e5ff",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca"
        }
      },
      boxShadow: {
        "soft-card": "0 18px 40px rgba(15, 23, 42, 0.35)"
      }
    }
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["night"]
  }
};

