import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as acorn from 'acorn';
import { walk } from 'acorn-walk';
import { simple as walkSimple, recursive as walkRecursive, full as walkFull } from '../../src/utils/ast-walk.js';

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
  fc.constant('export default function() {}'),
  fc.constant('import { foo } from "bar";'),
  fc.constant('const template = `hello ${world}`;'),
  fc.constant('const regex = /abc/gi;'),
  fc.constant('switch (x) { case 1: break; default: break; }'),
  fc.constant('do { something(); } while (cond);'),
  fc.constant('while (cond) { something(); }'),
  fc.constant('with (obj) { something(); }'),
  fc.constant('const gen = function* () { yield 1; }')
);

describe('AST Walker Properties', () => {
  describe('Walker Consistency', () => {
    it('simple, recursive, and full walkers visit the same nodes for valid JS', () => {
      fc.assert(fc.property(arbValidJS, (code) => {
        const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
        
        const simpleNodes = [];
        walkSimple(ast, {
          enter(node) { simpleNodes.push(node.type); }
        });
        
        const recursiveNodes = [];
        walkRecursive(ast, {
          enter(node) { recursiveNodes.push(node.type); }
        });
        
        const fullNodes = [];
        walkFull(ast, {
          enter(node) { fullNodes.push(node.type); }
        });
        
        expect(simpleNodes).toEqual(recursiveNodes);
        expect(recursiveNodes).toEqual(fullNodes);
      }), { numRuns: 1000 });
    });

    it('walkers visit every node exactly once', () => {
      fc.assert(fc.property(arbValidJS, (code) => {
        const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
        
        const visited = new Set();
        walkSimple(ast, {
          enter(node) {
            const id = `${node.type}:${node.start}:${node.end}`;
            expect(visited.has(id)).toBe(false);
            visited.add(id);
          }
        });
      }), { numRuns: 500 });
    });

    it('no stack overflow on deeply nested structures', () => {
      const deepCode = 'function f() { ' + 'if (true) { '.repeat(1000) + 'return 1; ' + '} '.repeat(1000) + '}';
      const ast = acorn.parse(deepCode, { ecmaVersion: 2022, sourceType: 'module' });
      
      expect(() => {
        walkSimple(ast, { enter() {} });
        walkRecursive(ast, { enter() {} });
        walkFull(ast, { enter() {} });
      }).not.toThrow();
    });
  });

  describe('JSX Walker Support', () => {
    const jsxArb = fc.oneof(
      fc.constant('<div />'),
      fc.constant('<div>hello</div>'),
      fc.constant('<Component prop="value" />'),
      fc.constant('<div><span>nested</span></div>'),
      fc.constant('<><Fragment>content</Fragment></>'),
      fc.constant('<div {...props} />')
    );

    it('handles JSX elements without crashing', () => {
      fc.assert(fc.property(jsxArb, (code) => {
        const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module', plugins: ['jsx'] });
        
        expect(() => {
          walkSimple(ast, { enter() {} });
          walkRecursive(ast, { enter() {} });
          walkFull(ast, { enter() {} });
        }).not.toThrow();
      }), { numRuns: 200 });
    });

    it('visits JSX nodes consistently across walkers', () => {
      fc.assert(fc.property(jsxArb, (code) => {
        const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module', plugins: ['jsx'] });
        
        const simpleNodes = [];
        walkSimple(ast, { enter(node) { simpleNodes.push(node.type); } });
        
        const recursiveNodes = [];
        walkRecursive(ast, { enter(node) { recursiveNodes.push(node.type); } });
        
        const fullNodes = [];
        walkFull(ast, { enter(node) { fullNodes.push(node.type); } });
        
        expect(simpleNodes).toEqual(recursiveNodes);
        expect(recursiveNodes).toEqual(fullNodes);
      }), { numRuns: 200 });
    });
  });

  describe('Walker State Machine Properties', () => {
    it('enter is called before children, leave after', () => {
      fc.assert(fc.property(arbValidJS, (code) => {
        const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
        
        const events = [];
        walkFull(ast, {
          enter(node) { events.push({ type: node.type, phase: 'enter' }); },
          leave(node) { events.push({ type: node.type, phase: 'leave' }); }
        });
        
        const stack = [];
        for (const event of events) {
          if (event.phase === 'enter') {
            stack.push(event.type);
          } else {
            expect(stack.pop()).toBe(event.type);
          }
        }
        expect(stack.length).toBe(0);
      }), { numRuns: 500 });
    });

    it('every enter has matching leave', () => {
      fc.assert(fc.property(arbValidJS, (code) => {
        const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
        
        let enterCount = 0;
        let leaveCount = 0;
        
        walkFull(ast, {
          enter() { enterCount++; },
          leave() { leaveCount++; }
        });
        
        expect(enterCount).toBe(leaveCount);
      }), { numRuns: 500 });
    });
  });
});
