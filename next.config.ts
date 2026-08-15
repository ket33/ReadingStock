import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // 산업 페이지 경로 개편: /industry → /industries (초기 배포분 링크 호환)
    return [
      { source: "/industry", destination: "/industries", permanent: true },
      { source: "/industry/:id", destination: "/industries/:id", permanent: true },
    ];
  },
};

export default nextConfig;
