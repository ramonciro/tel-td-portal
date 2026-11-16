// Checagem manual do backend (16/11/2026): só regras que apontam BUG de verdade — variável que não existe, chave
// repetida, código que nunca executa etc. Não há regras de estilo, de propósito, para não gerar alertas de ruído.
// Uso:  npm run lint     (não roda no deploy e não trava nada; baixa o ESLint na hora, sem mexer no package-lock).
export default [
  {
    ignores: [
      "node_modules/**",
      "uploads/**",
      // Arquivo antigo no formato ES module, que nenhuma parte do backend importa (o projeto usa require).
      "src/middlewares/authorizeRoles.js",
    ],
  },
  {
    files: ["**/*.js"],
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        require: "readonly", module: "writable", exports: "writable", process: "readonly", console: "readonly",
        __dirname: "readonly", __filename: "readonly", Buffer: "readonly", URL: "readonly", URLSearchParams: "readonly",
        fetch: "readonly", AbortController: "readonly", TextEncoder: "readonly", TextDecoder: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly",
        setImmediate: "readonly", structuredClone: "readonly", Intl: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "no-const-assign": "error",
      "no-redeclare": "error",
      "no-self-assign": "error",
      "no-func-assign": "error",
      "no-unsafe-finally": "error",
      "no-unsafe-negation": "error",
      "no-cond-assign": "error",
      "no-empty-pattern": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
    },
  },
];
