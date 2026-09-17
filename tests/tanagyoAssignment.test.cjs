const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
require.extensions['.ts']=(m,p)=>m._compile(compile(fs.readFileSync(p,'utf8')),p);
const {setTanagyoParticipation,updateTanagyoAssignment,nextTanagyoOrder,numberUnassignedTanagyo,resetTanagyoNumbers,reconcileTanagyoAccounting,resetTanagyoAccountingSelection}=require('../src/utils/tanagyoAssignment.ts');
const h=(id,order,extra={})=>({id,familyHead:id,tanagyoMonthlyVisit:true,tanagyoDate:'8/13',tanagyoPriestId:'P1',tanagyoPriestName:'担当1',tanagyoOrder:order,tanagyoTimeSlot:'午後',...extra});
function handler(name){const ast=ts.createSourceFile('map.tsx',fs.readFileSync(require('node:path').join(__dirname,'../src/components/TanagyoPatronMapModal.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let text;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)text=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(text);return text;}
test('new participation clears stale assignment but preserves household data and visit notes',()=>{
 const before=h('A',7,{tanagyoMonthlyVisit:false,tanagyoAddress:'訪問先',tanagyoNotes:'注意',yago:'山屋'}),result=setTanagyoParticipation(before,true);
 assert.equal(result.tanagyoOrder,undefined);assert.equal(result.tanagyoDate,'');assert.equal(result.tanagyoPriestId,'');assert.equal(result.tanagyoTimeSlot,'');assert.equal(result.tanagyoNotes,'注意');assert.equal(result.yago,'山屋');assert.equal(before.tanagyoOrder,7);
 assert.equal(setTanagyoParticipation(result,true),result);assert.equal(setTanagyoParticipation(h('A',2),false).tanagyoOrder,undefined);
});
test('route edits invalidate numbering; pin edits and unchanged assignments preserve it',()=>{
 assert.equal(updateTanagyoAssignment(h('A',7),{tanagyoDate:'8/14'}).tanagyoOrder,undefined);
 assert.equal(updateTanagyoAssignment(h('A',7),{tanagyoPriestId:'P2'}).tanagyoOrder,undefined);
 assert.equal(updateTanagyoAssignment(h('A',7),{tanagyoDate:''}).tanagyoTimeSlot,'');
 assert.equal(updateTanagyoAssignment(h('A',7),{latitude:35}).tanagyoOrder,7);
 assert.equal(updateTanagyoAssignment(h('A',7),{tanagyoPriestId:'P1'}).tanagyoOrder,7);
});
test('append numbering handles gaps, consecutive clicks, repeats, and unrelated routes',()=>{
 let rows=[h('A',3),h('B',undefined),h('C',undefined),h('X',99,{tanagyoDate:'8/14'})];const ids=new Set(['A','B','C']);
 rows=numberUnassignedTanagyo(rows,ids,'B');rows=numberUnassignedTanagyo(rows,ids,'C');
 assert.deepEqual(rows.map(h=>h.tanagyoOrder),[3,4,5,99]);assert.equal(numberUnassignedTanagyo(rows,ids,'B'),rows);assert.equal(numberUnassignedTanagyo(rows,ids,'X'),rows);
 assert.equal(nextTanagyoOrder([]),1);
});
test('current route reset handler clears only visible date and priest numbers and stops numbering',()=>{
 let rows=[h('A',3),h('B',4),h('X',8,{tanagyoPriestId:'P2'}),h('Y',9,{tanagyoDate:'8/14'})];const before=structuredClone(rows),calls=[];
 const context={step3FilterDate:'8/13',step3FilterPriestId:'P1',step3TargetHouseholds:rows.slice(0,2),setLocalHouseholds:f=>{rows=f(rows)},resetTanagyoNumbers,setIsNumberingMode:v=>calls.push(v),setHasChanges:v=>calls.push(v)};
 vm.runInNewContext(compile('('+handler('handleResetCurrentNumbers')+')()'),context);
 assert.deepEqual(rows.map(h=>h.tanagyoOrder),[undefined,undefined,8,9]);assert.equal(rows[0].tanagyoTimeSlot,'午後');assert.equal(rows[0].tanagyoPriestId,'P1');assert.deepEqual(rows.slice(2),before.slice(2));assert.deepEqual(calls,[false,true]);
});
test('bulk date assignment does not re-enable non-participants or modify filtered-out temples',()=>{
 let rows=[h('A',3),h('X',4,{templeId:'other'}),h('N',8,{tanagyoMonthlyVisit:false})];
 const context={priests:[{id:'P2',name:'担当2'}],tanagyoPatrons:[rows[0]],step2FilterDate:'8/13',setLocalHouseholds:f=>{rows=f(rows)},updateTanagyoAssignment,setHasChanges:()=>{},alert:()=>{throw Error('unexpected alert')}};
 vm.runInNewContext(compile('('+handler('handleAssignAllDateToSelectedPriest')+')("P2")'),context);
 assert.equal(rows[0].tanagyoPriestId,'P2');assert.equal(rows[0].tanagyoOrder,undefined);assert.equal(rows[1].tanagyoPriestId,'P1');assert.equal(rows[2].tanagyoMonthlyVisit,false);
});
const row=(id,extra={})=>({householdId:id,selected:false,amount:10000,category:'棚経',notes:'メモ',alreadyRecorded:false,...extra});
test('accounting refresh preserves explicit selection and amounts, adds unselected rows and deselects newly recorded rows',()=>{
 const prev=[row('A',{selected:true,amount:25000,notes:'入力済'}),row('B',{selected:true})];
 const next=reconcileTanagyoAccounting(prev,[row('A'),row('B',{alreadyRecorded:true}),row('C')]);
 assert.deepEqual(next.map(r=>r.selected),[true,false,false]);assert.equal(next[0].amount,25000);assert.equal(next[0].notes,'入力済');
 const reset=resetTanagyoAccountingSelection(next);assert(reset.every(r=>!r.selected));assert.equal(reset[0].amount,25000);assert.equal(reset[1].alreadyRecorded,true);
 assert(reconcileTanagyoAccounting([],next).every(r=>!r.selected));
});
