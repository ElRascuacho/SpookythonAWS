import { defineConfig, loadEnv } from "vite";
import { invitationAuth } from "./backend/devAuth";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    invitationAuth({
      ...loadEnv(mode, process.cwd(), ""),
      ...process.env,
    } as Record<string, string>),
  ],
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/.invite-code.local",
      ],
    },
  },
  preview: { port: 4173, strictPort: true },
}));
