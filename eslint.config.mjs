import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Reglas recomendadas de Next (incluye react-hooks y accesibilidad basica)
 * mas las de TypeScript.
 */
const config = [
  { ignores: [".next/**", "node_modules/**", "data/**", "storage/**", "padron/**"] },
  ...coreWebVitals,
  ...typescript,
];

export default config;
