/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0d12",
        carbon: "#11141b",
        fog: "#f4f6fb",
        electric: {
          50: "#f3f4ff",
          100: "#e8eaff",
          300: "#adb6ff",
          500: "#6d5dfc",
          600: "#5847f2",
          700: "#4332d9",
        },
      },
      boxShadow: {
        glow: "0 0 55px rgba(109, 93, 252, 0.28)",
        panel: "0 22px 70px rgba(11, 13, 18, 0.12)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
