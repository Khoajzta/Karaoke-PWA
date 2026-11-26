import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");
          if (!moduleId.includes("/node_modules/")) return;

          if (moduleId.includes("/firebase/") || moduleId.includes("/@firebase/")) return "firebase-vendor";
          if (
            moduleId.includes("/react/") ||
            moduleId.includes("/react-dom/") ||
            moduleId.includes("/scheduler/")
          ) return "react-vendor";
          if (moduleId.includes("/lucide-react/")) return "icons";
          if (moduleId.includes("/@dnd-kit/")) return "drag-and-drop";
          if (moduleId.includes("/react-youtube/")) return "youtube-player";
          if (moduleId.includes("/qrcode.react/")) return "qr-code";
        }
      }
    }
  },
  server: {
    host: true,
    port: 3000
  }
});
