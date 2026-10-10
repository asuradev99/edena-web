import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projects} from '../projects.js';
test('project catalog resolves every canvas and has unique stable IDs',()=>{
 assert.equal(new Set(projects.map(p=>p.id)).size,projects.length);
 for(const p of projects){const source=readFileSync(new URL('../'+p.page,import.meta.url),'utf8');assert.ok(source.includes(`id="${p.canvas}"`),p.id);assert.ok(source.includes('canvas-ui.js'),p.page);}
 assert.equal(projects[0].id,'symmetry:scene');
});
test('workspace loads projects on demand and the tours expose lazy factories',()=>{
 const root=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.equal((root.match(/<iframe\b/g)||[]).length,1);assert.equal((root.match(/<canvas\b/g)||[]).length,0);
 for(const name of ['basics','academy']){const source=readFileSync(new URL(`../src/examples/${name}.ts`,import.meta.url),'utf8');for(const project of projects.filter(p=>p.page===name+'.html'))assert.ok(source.includes(`id:'${project.canvas}'`),project.id);}
});
