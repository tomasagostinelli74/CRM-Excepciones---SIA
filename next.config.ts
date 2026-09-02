import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 es un binario nativo: Next debe requerirlo en runtime,
  // no intentar empaquetarlo en el bundle del servidor.
  serverExternalPackages: ["better-sqlite3", "exceljs", "pg"],
  experimental: {
    serverActions: {
      // Los adjuntos PDF viajan por Server Actions; el limite real de tamano
      // lo impone MAX_PDF_MB y se valida ademas en el servidor.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
