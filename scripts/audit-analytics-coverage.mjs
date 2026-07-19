import fs from 'node:fs/promises';
import path from 'node:path';
import { Parser } from 'acorn';
import jsx from 'acorn-jsx';

const JsxParser = Parser.extend(jsx());
const ROOTS = ['src', 'pages', 'components'];
const EXTENSIONS = new Set(['.js', '.jsx']);
const STRICT = process.argv.includes('--strict');
const CAPTURED_ELEMENTS = new Set([
  'a',
  'button',
  'form',
  'input',
  'select',
  'textarea',
  'Button',
  'Checkbox',
  'Input',
  'Link',
  'NextLink',
  'RadioGroupItem',
  'Select',
  'Textarea',
]);
const CAPTURED_ROLES = new Set(['button', 'link', 'menuitem', 'slider', 'switch', 'tab']);
const HANDLERS = new Set(['onClick', 'onMouseDown', 'onPointerDown', 'onSubmit', 'onChange']);

async function sourceFiles(root) {
  const result = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await sourceFiles(full)));
    else if (EXTENSIONS.has(path.extname(entry.name))) result.push(full);
  }
  return result;
}

function jsxName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return `${jsxName(node.object)}.${jsxName(node.property)}`;
  return '';
}

function attributes(node) {
  return new Map(
    (node.attributes || [])
      .filter((attribute) => attribute.type === 'JSXAttribute')
      .map((attribute) => [attribute.name.name, attribute.value])
  );
}

function literalAttribute(attrs, name) {
  const value = attrs.get(name);
  if (!value) return '';
  if (value.type === 'Literal') return String(value.value || '');
  if (value.type === 'JSXExpressionContainer' && value.expression?.type === 'Literal') {
    return String(value.expression.value || '');
  }
  return '';
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value === 'object') {
      walk(value, visit);
    }
  }
}

const files = (await Promise.all(ROOTS.map(sourceFiles))).flat().sort();
const report = {
  files: files.length,
  interactive_elements: 0,
  forms: 0,
  dialogs_and_popups: 0,
  explicit_track_calls: 0,
  uncaptured_handlers: [],
  parse_errors: [],
};

for (const file of files) {
  const source = await fs.readFile(file, 'utf8');
  report.explicit_track_calls += (source.match(/\btrack\s*\(/g) || []).length;
  let tree;
  try {
    tree = JsxParser.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      allowHashBang: true,
    });
  } catch (error) {
    report.parse_errors.push(`${file}:${error.loc?.line || 1} ${error.message}`);
    continue;
  }

  walk(tree, (node) => {
    if (node.type !== 'JSXOpeningElement') return;
    const name = jsxName(node.name);
    const attrs = attributes(node);
    const role = literalAttribute(attrs, 'role');
    const handlers = [...HANDLERS].filter((handler) => attrs.has(handler));
    const captured =
      CAPTURED_ELEMENTS.has(name) ||
      CAPTURED_ROLES.has(role) ||
      attrs.has('data-analytics-id') ||
      attrs.has('data-analytics-skip');

    if (CAPTURED_ELEMENTS.has(name) || CAPTURED_ROLES.has(role)) report.interactive_elements += 1;
    if (name === 'form') report.forms += 1;
    if (
      (role === 'dialog' && literalAttribute(attrs, 'aria-modal') === 'true') ||
      attrs.has('data-analytics-popup')
    ) {
      report.dialogs_and_popups += 1;
    }

    if (handlers.length && /^[a-z]/.test(name) && !captured) {
      report.uncaptured_handlers.push({
        file,
        line: node.loc.start.line,
        element: name,
        handlers,
      });
    }
  });
}

console.log(JSON.stringify(report, null, 2));
if (STRICT && (report.parse_errors.length || report.uncaptured_handlers.length)) process.exitCode = 1;
