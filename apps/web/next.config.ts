import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El valor por defecto es 1 MB, menor que el logo de la clínica (hasta
      // 2 MB, lib/clinicas/actions.ts) más el relleno del multipart. Se
      // queda bajo los 4,5 MB que Vercel admite por petición a una función.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
