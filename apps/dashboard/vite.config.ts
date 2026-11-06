import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { port: 5173 },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(process.env.VITE_API_URL || ""),
    "import.meta.env.VITE_PUBLIC_IP": JSON.stringify(process.env.VITE_PUBLIC_IP || "your-aws-ip"),
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@jacxishippingorg/jx-ui-react")) {
            return "vendor-jxui";
          }
          if (id.includes("node_modules/lucide-react") || id.includes("node_modules/motion")) {
            return "vendor-motion";
          }
        },
      },
    },
  },
});
