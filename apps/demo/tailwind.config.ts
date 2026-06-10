import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111111",
        paper: "#ffffff",
        line: "rgba(17, 17, 17, 0.18)",
        delta: "#d84f2a",
        moss: "#3f5f4b",
        tide: "#315d75",
        night: "#111111"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"]
      },
      fontWeight: {
        thin: "200",
        extralight: "200",
        light: "200",
        normal: "200",
        medium: "400",
        semibold: "400",
        bold: "500",
        extrabold: "500",
        black: "500"
      }
    }
  },
  plugins: []
};

export default config;
