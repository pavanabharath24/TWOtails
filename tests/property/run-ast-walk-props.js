import * as fc from 'fast-check';
import * as acorn from 'acorn';
import acornJsx from 'acorn-jsx';
import { simple as walkSimple, recursive as walkRecursive, full as walkFull } from '../../src/utils/ast-walk.js';

const acornJSX = acorn.Parser.extend(acornJsx());

const arbValidJS = fc.oneof(
  fc.constant('const x = 1;'),
  fc.constant('function foo() { return 42; }'),
  fc.constant('class Foo { method() {} }'),
  fc.constant('const obj = { a: 1, b: 2 };'),
  fc.constant('if (true) { foo(); } else { bar(); }'),
  fc.constant('for (let i = 0; i < 10; i++) { console.log(i); }'),
  fc.constant('try { risky(); } catch (e) { handle(e); }'),
  fc.constant('const arrow = () => 42;'),
  fc.constant('async function asyncFoo() { await wait(); }'),
  fc.constant('const [a, b] = [1, 2];'),
  fc.constant('const { x, y } = obj;'),
  fc.constant('import { foo } from "bar";'),
  fc.constant('const template = `hello ${world}`;'),
  fc.constant('const regex = /abc/gi;'),
  fc.constant('switch (x) { case 1: break; default: break; }'),
  fc.constant('while (cond) { something(); }'),
  fc.constant('const gen = function* () { yield 1; }')
);

const jsxArb = fc.oneof(
  fc.constant('<div />'),
  fc.constant('<div>hello</div>'),
  fc.constant('<Component prop="value" />'),
  fc.constant('<div><span>nested</span></div>'),
  fc.constant('<><Fragment>content</Fragment></>'),
  fc.constant('<div {...props} />')
);

let passed = 0;
let failed = 0;

async function test(name, prop, runs = 500) {
  try {
    await fc.assert(prop, { numRuns: runs, verbose: true });
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('Running AST Walker Property Tests...\n');

  await test('simple, recursive, and full walkers visit the same nodes for valid JS', 
    fc.property(arbValidJS, (code) => {
      const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
      const simpleNodes = [];
      walkSimple(ast, { enter(node) { simpleNodes.push(node.type); } });
      const recursiveNodes = [];
      walkRecursive(ast, { enter(node) { recursiveNodes.push(node.type); } });
      const fullNodes = [];
      walkFull(ast, { enter(node) { fullNodes.push(node.type); } });
      if (JSON.stringify(simpleNodes) !== JSON.stringify(recursiveNodes)) throw new Error('simple !== recursive');
      if (JSON.stringify(recursiveNodes) !== JSON.stringify(fullNodes)) throw new Error('recursive !== full');
    }), 1000);

  await test('walkers visit every node exactly once',
    fc.property(arbValidJS, (code) => {
      const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
      const visited = new Set();
      walkSimple(ast, {
        enter(node) {
          const id = `${node.type}:${node.start}:${node.end}`;
          if (visited.has(id)) throw new Error(`Duplicate visit: ${id}`);
          visited.add(id);
        }
      });
    }), 500);

  await test('no stack overflow on deeply nested structures', async () => {
    const deepCode = 'function f() { ' + 'if (true) { '.repeat(1000) + 'return 1; ' + '} '.repeat(1000) + '}';
    const ast = acorn.parse(deepCode, { ecmaVersion: 2022, sourceType: 'module' });
    walkSimple(ast, { enter() {} });
    walkRecursive(ast, { enter() {} });
    walkFull(ast, { enter() {} });
  });

  // JSX Walker Support - use proper JSX parser
  const jsxParser = acorn.Parser.extend(require('acorn-jsx')());
  
  await test('handles JSX elements without crashing',
    fc.property(jsxArb, (code) => {
      const ast = acorn.Parser.extend(require('acorn-jsx')()).parse(code, { ecmaVersion: 2022, sourceType: 'module' });
      walkSimple(ast, { enter() {} });
      walkRecursive(ast, { enter() {} });
      walkFull(ast, { enter() {} });
    }), 200);

  await test('visits JSX nodes consistently across walkers',
    fc.property(jsxArb, (code) => {
      const ast = acorn.Parser.extend(require('acorn-jsx')()).parse(code, { ecmaVersion: 2022, sourceType: 'module' });
      const simpleNodes = [];
      walkSimple(ast, { enter(node) { simpleNodes.push(node.type); } });
      const recursiveNodes = [];
      walkRecursive(ast, { enter(node) { recursiveNodes.push(node.type); } });
      const fullNodes = [];
      walkFull(ast, { enter(node) { fullNodes.push(node.type); } });
      if (JSON.stringify(simpleNodes) !== JSON.stringify(recursiveNodes)) throw new Error('simple !== recursive');
      if (JSON.stringify(recursiveNodes) !== JSON.stringify(fullNodes)) throw new Error('recursive !== full');
    }), 200);

  await test('enter is called before children, leave after',
    fc.property(arbValidJS, (code) => {
      const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
      const events = [];
      walkFull(ast, {
        enter(node) { events.push({ type: node.type, phase: 'enter' }); },
        leave(node) { events.push({ type: node.type, phase: 'leave' }); }
      });
      const stack = [];
      for (const event of events) {
        if (event.phase === 'enter') stack.push(event.type);
        else { if (stack.pop() !== event.type) throw new Error('Mismatched leave'); }
      }
      if (stack.length !== 0) throw new Error('Stack not empty');
    }), 500);

  await test('every enter has matching leave',
    fc.property(arbValidJS, (code) => {
      const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
      let enterCount = 0, leaveCount = 0;
      walkFull(ast, { enter() { enterCount++; }, leave() { leaveCount++; } });
      if (enterCount !== leaveCount) throw new Error('enter !== leave');
    }), 500);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(e => { console.error(e); process.exit(1); });
