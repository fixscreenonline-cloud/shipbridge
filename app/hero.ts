import { heroui } from "@heroui/react";

export default heroui({
  themes: {
    light: {
      colors: {
        background: "#F3F5F8",
        foreground: "#10243E",
        content1: "#FFFFFF",
        primary: { DEFAULT: "#10243E", foreground: "#FFFFFF" },
        secondary: { DEFAULT: "#FFB020", foreground: "#10243E" },
        success: { DEFAULT: "#1F8A5B", foreground: "#FFFFFF" },
        focus: "#FFB020",
      },
    },
  },
});
