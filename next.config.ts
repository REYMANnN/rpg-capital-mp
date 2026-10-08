import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /sobre.md, /credito.md etc. — versão em texto das páginas para buscadores e IAs.
  async rewrites() {
    return [{ source: "/:pagina(index|sobre|credito|integracoes|edu|cultura).md", destination: "/paginas-md/:pagina" }];
  },
};

export default nextConfig;
