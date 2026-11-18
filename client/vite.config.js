import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  // 배포할 때마다 바뀌는 번호 → 맵(.glb) 주소 뒤에 붙여서, 새 맵을 올리면 휴대폰도 바로 새로 받음
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
});
