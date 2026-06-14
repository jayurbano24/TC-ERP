import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['src/modules/**/internal/*'],
              message: 'Architecture violation: Cannot import from the internal directory of a module. Use the module API instead.'
            },
            {
              group: ['src/infrastructure/**/internal/*'],
              message: 'Architecture violation: Infrastructure internals should not be accessed directly.'
            }
          ]
        }
      ]
    }
  }
]);

export default eslintConfig;
