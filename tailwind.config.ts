import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["DM Mono", "ui-monospace", "monospace"],
      },
      colors: {
        accent: {
          DEFAULT: "#8B6FE8",
          soft: "#EFE8FC",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          border: "#ECECEF",
        },
        muted: "#9CA3AF",
      },
      backgroundImage: {
        "app-gradient": "linear-gradient(135deg, #F7E9F2 0%, #ECE6FB 100%)",
        "accent-gradient": "linear-gradient(90deg, #FF4FA0, #7C5CE0)",
      },
      boxShadow: {
        card: "0 2px 12px 0 rgba(139,111,232,0.07), 0 1px 3px 0 rgba(0,0,0,0.04)",
        "card-hover": "0 4px 24px 0 rgba(139,111,232,0.13), 0 2px 8px 0 rgba(0,0,0,0.06)",
      },
      animation: {
        "spin-slow": "spin 2s linear infinite",
        "fade-in": "fadeIn 0.35s ease forwards",
        "slide-up": "slideUp 0.4s ease forwards",
        shimmer: "shimmer 1.6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
