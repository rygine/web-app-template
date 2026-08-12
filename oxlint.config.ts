import { builtinModules } from "node:module";

import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

const bannedImports = [
  {
    name: "react",
    importNames: ["useEffect"],
    message: "useEffect is not allowed",
  },
];

type ImportRule = NonNullable<
  NonNullable<OxlintConfig["rules"]>["no-restricted-imports"]
>;

type Restriction = { group: string[]; message: string };

// matched by exact name, so a local `url.ts` is not taken for Node's
const builtinImports = builtinModules
  .flatMap((name) =>
    name.startsWith("node:") ? [name] : [name, `node:${name}`],
  )
  .map((name) => ({
    name,
    message:
      "browser code must not import Node built-ins; move the work into a server function",
    allowTypeImports: true,
  }));

const restrictImports = (...patterns: Restriction[]): ImportRule => [
  "error",
  { paths: bannedImports, patterns },
];

const restrictBrowserImports = (...patterns: Restriction[]): ImportRule => [
  "error",
  { paths: [...bannedImports, ...builtinImports], patterns },
];

const clientCode: Restriction = {
  group: [
    "@/app/client/*",
    "@/app/client/**",
    "@/features/*/client/*",
    "@/features/*/client/**",
  ],
  message:
    "server and shared code must not import client code; it may touch browser globals",
};

const serverCode: Restriction = {
  group: [
    "@/app/server/*",
    "@/app/server/**",
    "@/features/*/server/*",
    "@/features/*/server/**",
  ],
  message: "server code is not allowed in this context",
};

const featureCode: Restriction = {
  group: ["@/features/*", "@/features/*/**"],
  message:
    "app is core and must not import a feature. Features contribute through nav.ts and routes/, both discovered.",
};

export default defineConfig({
  plugins: [
    "eslint",
    "import",
    "node",
    "oxc",
    "promise",
    "react",
    "typescript",
    "unicorn",
  ],
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  ignorePatterns: [
    "dist",
    ".output",
    ".nitro",
    ".tanstack",
    "coverage",
    ".yarn",
    "src/generated",
    "**/*.gen.ts",
  ],
  options: {
    typeAware: true,
  },
  rules: {
    "no-restricted-imports": restrictImports(),
    curly: ["error", "all"],
    "typescript/array-type": ["error", { default: "array" }],
    "default-case-last": "error",
    "func-style": ["error", "expression"],
    "no-underscore-dangle": [
      "error",
      {
        allow: ["__APP_NAME__", "__APP_VERSION__"],
      },
    ],
    "no-restricted-properties": [
      "error",
      {
        object: "React",
        property: "useEffect",
        message: "useEffect is not allowed",
      },
    ],
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_",
      },
    ],
    "prefer-const": "error",
    "import/newline-after-import": "error",
    "import/no-duplicates": "error",
    "import/no-unassigned-import": [
      "error",
      {
        allow: ["**/*.css", "dotenv/config"],
      },
    ],
    "react/function-component-definition": [
      "error",
      {
        namedComponents: "arrow-function",
        unnamedComponents: "arrow-function",
      },
    ],
    "react/react-in-jsx-scope": "off",
    "react/rules-of-hooks": "error",
    "react/only-export-components": [
      "warn",
      {
        allowConstantExport: true,
      },
    ],
    "react/jsx-pascal-case": [
      "error",
      {
        allowLeadingUnderscore: true,
      },
    ],
    "typescript/no-explicit-any": "error",
    "typescript/consistent-type-assertions": [
      "error",
      {
        assertionStyle: "never",
        arrayLiteralTypeAssertions: "never",
        objectLiteralTypeAssertions: "never",
      },
    ],
    "typescript/consistent-type-definitions": ["error", "type"],
    "typescript/consistent-type-exports": [
      "error",
      {
        fixMixedExportsWithInlineTypeSpecifier: true,
      },
    ],
    "typescript/consistent-type-imports": [
      "error",
      {
        fixStyle: "separate-type-imports",
      },
    ],
  },
  overrides: [
    // Catch-all first so app-root files (index.ts, nav.ts, routes.config.ts)
    // are covered; the run-location entries below refine it.
    {
      files: ["src/app/**"],
      rules: { "no-restricted-imports": restrictImports(featureCode) },
    },
    {
      files: ["src/app/nav.ts"],
      rules: { "no-restricted-imports": restrictBrowserImports(featureCode) },
    },
    {
      files: ["src/features/*/nav.ts", "src/router.tsx"],
      rules: { "no-restricted-imports": restrictBrowserImports() },
    },
    {
      files: ["src/app/client/**"],
      rules: {
        "no-restricted-imports": restrictBrowserImports(
          serverCode,
          featureCode,
        ),
      },
    },
    {
      files: ["src/app/shared/**"],
      rules: {
        "no-restricted-imports": restrictBrowserImports(
          serverCode,
          clientCode,
          featureCode,
        ),
      },
    },
    {
      files: ["src/app/server/**"],
      rules: {
        "no-restricted-imports": restrictImports(clientCode, featureCode),
      },
    },
    // App-level routes and routes.config.ts are core too, so the same ban
    // applies; routes.config.ts reaches features through node:fs, not imports.
    {
      files: ["src/routes/**", "src/routes.config.ts"],
      rules: { "no-restricted-imports": restrictImports(featureCode) },
    },
    {
      files: ["src/features/*/client/**"],
      rules: { "no-restricted-imports": restrictBrowserImports(serverCode) },
    },
    {
      files: ["src/features/*/shared/**"],
      rules: {
        "no-restricted-imports": restrictBrowserImports(serverCode, clientCode),
      },
    },
    {
      files: ["src/features/*/server/**"],
      rules: { "no-restricted-imports": restrictImports(clientCode) },
    },
    {
      files: ["**/*.test.ts", "**/*.spec.ts"],
      rules: {
        "no-restricted-imports": restrictImports(),
        "typescript/no-non-null-assertion": "off",
      },
    },
    {
      files: ["src/app/testing/e2e.ts"],
      rules: { "no-empty-pattern": "off" },
    },
  ],
});
