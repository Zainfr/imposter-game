/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./frontend/index.html",
    "./frontend/src/**/*.{ts,tsx}"
  ],
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["forest"]
  }
};

