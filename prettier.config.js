// Markdown and YAML only. Biome formats code. These options apply to code fenced in Markdown.
// Tables use single-space padding (scripts/prettier-plugin-compact-tables.mjs).

/** @type {import('prettier').Config} */
export default {
    plugins: ['./scripts/prettier-plugin-compact-tables.mjs'],
    singleQuote: true,
    tabWidth: 4,
    printWidth: 120,
    proseWrap: 'always',
    overrides: [
        {
            files: ['*.md', '*.mdc'],
            options: { parser: 'markdown-compact', tabWidth: 2 },
        },
        {
            files: ['*.yml', '*.yaml'],
            options: { tabWidth: 2 },
        },
    ],
};
