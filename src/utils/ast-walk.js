/**
 * JSX-aware acorn-walk helpers
 *
 * acorn-walk has no walker functions for JSX node types, and its base
 * walker is missing handlers for some newer ECMAScript node types.
 * This module extends the acorn-walk base with complete JSX support
 * and missing standard node type handlers so every analyzer walks
 * the real AST exactly once.
 */

const walk = require('acorn-walk');

/**
 * Handlers for node types missing from acorn-walk's base walker.
 * These are newer ECMAScript features that the base walker doesn't handle.
 */
const missingBase = {
  OptionalMemberExpression(node, st, c) { c(node.object, st); c(node.property, st); },
  OptionalCallExpression(node, st, c) { c(node.callee, st); node.arguments.forEach(arg => c(arg, st)); },
  NullishCoalescingExpression(node, st, c) { c(node.left, st); c(node.right, st); },
  GeneratorFunction(node, st, c) {
    if (node.id) c(node.id, st);
    if (node.params) node.params.forEach(p => c(p, st));
    c(node.body, st);
  }
};

/**
 * JSX node type handlers
 */
const jsxBase = {
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
};

// Merge: base walker + missing handlers + JSX handlers
const mergedBase = { ...walk.base, ...missingBase, ...jsxBase };

function simple(node, visitors, state) {
  return walk.simple(node, visitors, mergedBase, state);
}

function recursive(node, visitors, state, override) {
  return walk.recursive(node, state, visitors, mergedBase, override);
}

function full(node, callback) {
  return walk.full(node, callback, mergedBase);
}

module.exports = { simple, recursive, full, mergedBase };
