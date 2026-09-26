/**
 * JSX-aware acorn-walk helpers
 *
 * acorn-walk has no walker functions for JSX node types, so walking any
 * file containing JSX throws "No walker function defined for node type
 * JSXElement". Analyzers used to swallow that error and fall back to
 * regex parsing, which produced duplicate issues and wrong parameter
 * counts. This module extends the acorn-walk base with complete JSX
 * support so every analyzer walks the real AST exactly once.
 */

const walk = require('acorn-walk');

const jsxBase = walk.make({
  JSXElement(node, st, c) {
    c(node.openingElement, st);
    node.children.forEach(child => c(child, st));
    if (node.closingElement) c(node.closingElement, st);
  },
  JSXFragment(node, st, c) {
    node.children.forEach(child => c(child, st));
  },
  JSXOpeningElement(node, st, c) {
    if (node.name) c(node.name, st);
    node.attributes.forEach(attr => c(attr, st));
  },
  JSXClosingElement(node, st, c) {
    if (node.name) c(node.name, st);
  },
  JSXSelfClosingElement(node, st, c) {
    if (node.name) c(node.name, st);
    node.attributes.forEach(attr => c(attr, st));
  },
  JSXAttribute(node, st, c) {
    if (node.name) c(node.name, st);
    if (node.value) c(node.value, st);
  },
  JSXSpreadAttribute(node, st, c) {
    c(node.argument, st);
  },
  JSXExpressionContainer(node, st, c) {
    c(node.expression, st);
  },
  JSXSpreadChild(node, st, c) {
    c(node.expression, st);
  },
  JSXIdentifier() {},
  JSXNamespacedName() {},
  JSXMemberExpression() {},
  JSXText() {},
  JSXEmptyExpression() {}
}, walk.base);

function simple(node, visitors, state) {
  return walk.simple(node, visitors, jsxBase, state);
}

function recursive(node, visitors, state, override) {
  return walk.recursive(node, state, visitors, jsxBase, override);
}

function full(node, callback) {
  return walk.full(node, callback, jsxBase);
}

module.exports = { simple, recursive, full, jsxBase };
