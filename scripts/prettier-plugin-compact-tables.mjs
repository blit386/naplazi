// Prettier pads table columns, so one cell edit rewrites every row. This keeps Prettier's
// Markdown printer and prints tables with one space of padding. Cell text still goes through
// Prettier, so emphasis and escaping stay the same.

import { doc } from 'prettier';
import * as markdown from 'prettier/plugins/markdown';

const { hardline, join } = doc.builders;
const { printDocToString } = doc.printer;
const basePrinter = markdown.printers.mdast;

const DELIMITERS = {
    left: ':---',
    right: '---:',
    center: ':---:',
};

// printWidth Infinity: a row is one line, so the cell printer must not wrap.
const printCell = (cellPath, options, print) =>
    printDocToString(print(cellPath), { ...options, printWidth: Number.POSITIVE_INFINITY }).formatted;

const printTable = (path, options, print) => {
    const { node } = path;

    const rows = path.map(
        (rowPath) => rowPath.map((cellPath) => printCell(cellPath, options, print), 'children'),
        'children',
    );

    const columns = Math.max(node.align?.length ?? 0, ...rows.map((row) => row.length));
    const cellsOf = (row) => Array.from({ length: columns }, (_unused, index) => row.at(index) ?? '');
    const lineOf = (row) => `| ${cellsOf(row).join(' | ')} |`;
    const delimiters = Array.from({ length: columns }, (_unused, index) => DELIMITERS[node.align?.at(index)] ?? '---');
    const [head, ...body] = rows;

    // hardline, not "\n": Prettier reapplies list and blockquote prefixes when the table is nested.
    return join(hardline, [lineOf(head), `| ${delimiters.join(' | ')} |`, ...body.map(lineOf)]);
};

const printer = {
    ...basePrinter,
    print(path, options, print, args) {
        if (path.node.type === 'table') {
            return printTable(path, options, print);
        }

        return basePrinter.print(path, options, print, args);
    },
};

export const parsers = {
    'markdown-compact': { ...markdown.parsers.markdown, astFormat: 'mdast-compact' },
};

export const printers = {
    'mdast-compact': printer,
};
