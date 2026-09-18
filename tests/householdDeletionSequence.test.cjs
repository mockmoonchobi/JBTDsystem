const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {workbook}=require('./rowSyncFixture.cjs');
const root=path.resolve(__dirname,'..');require.cache[path.join(root,'src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
const {exportToSheets,importFromSheets}=require('../src/lib/googleSheets.ts');
const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
test('five consecutive household deletions use normal export with preserved related rows',async()=>{
const m=workbook('delete-sequence'),old=global.fetch;global.fetch=m.fetch;
const temple={...EMPTY_TEMPLE_INFO,id:'temple-main',isMain:true,name:'試験寺院'};
let rows=Array.from({length:6},(_,i)=>({id:'DK-0000'+i,templeId:temple.id,familyHead:'Name'+i,familyMembers:[]}));
let logs=[];
const publish=()=>exportToSheets('token','delete-sequence',temple,rows,[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],[temple],{deletedRecords:[...logs],onlyChangedTables:true,targetTablesOnly:logs.length ? ['檀家名簿','家族構成','操作・削除履歴'] : undefined});
try{await publish();await importFromSheets('token','delete-sequence',{requireCompleteSchema:true,readOnly:true});
m.calls.length=0;
for(let i=0;i<5;i++){const row=rows[0];rows=rows.slice(1);logs.push({logId:'L'+i,id:row.id,entityType:'household',actionType:'delete',deletedAt:'2026-09-17T00:00:00Z',deletedTimestamp:1789603200000+i});await publish();}
const writes=m.calls.flatMap(c=>c.body.requests||[]).filter(r=>r.updateCells);
assert.equal(writes.length,5);assert(writes.every(r=>r.updateCells.start.columnIndex>0 && r.updateCells.rows[0].values.length===3));
assert(m.calls.filter(c=>c.url.includes('values:batchGet')).every(c=>!decodeURIComponent(c.url).includes('過去帳')));
assert.equal(m.sheets.get('檀家名簿').rows.filter(r=>r[r.length-3]==='1').length,5);
}finally{global.fetch=old;}
});
const {saveIncrementalRows:save,rememberRowSyncRead:remember}=require('../src/utils/rowSyncClient.ts');
const {ROW_META}=require('../src/utils/rowSyncPlan.ts');
const {householdDeletions}=require('../src/utils/householdDeletion.ts');
const hh=['ID','名前'], lh=['履歴ID','操作','対象種別','対象ID'];
const desired=(ids,removed)=>({'檀家名簿':[hh,...ids.map(id=>[id,id])],'操作・削除履歴':[lh,...removed.map(id=>['D'+id,'delete','household',id])]});
const spec=m=>[...m.sheets.values()].map(({properties:p})=>({sheetId:p.sheetId,title:p.title,...p.gridProperties}));
const updates=d=>Object.entries(d).map(([name,values])=>({range:"'"+name+"'!A1",values}));
async function deletionBook(id){const m=workbook(id);const b={'檀家名簿':[[...hh,...ROW_META],...['A','B','C'].map(id=>[id,id,'','','old'])],'操作・削除履歴':[[...lh,...ROW_META]]};for(const [title,rows] of Object.entries(b))m.add(title,rows);await remember(id,b);return {m,b};}
test('subsequent deletes preserve peer edits, additions and tombstones without full merge',async()=>{
 const {m}=await deletionBook('peers');
 await save('t','peers',updates(desired(['B','C'],['A'])),spec(m),m.fetch);
 const rows=m.sheets.get('檀家名簿').rows;
 rows[2][1]='peer edited B';rows.push(['OTHER','peer new','','','peer']);
 m.sheets.get('操作・削除履歴').rows.push(['PEER','update','household','B','','','peer']);
 await save('t','peers',updates(desired(['C'],['A','B'])),spec(m),m.fetch);
 assert.equal(rows[2][1],'peer edited B');assert.equal(rows[2][2],'1');assert.equal(rows[3][2],'');assert.equal(rows[4][0],'OTHER');
 assert.equal(m.calls.filter(c=>c.body.requests).length,2);
});
test('deletion acknowledgement loss is verified before any resend',async()=>{
 const {m}=await deletionBook('lost-delete'); const d=updates(desired(['B','C'],['A']));m.loseResponse();
 await assert.rejects(save('t','lost-delete',d,spec(m),m.fetch),/response lost/);
 const count=m.calls.filter(c=>c.body.requests).length;
 await save('t','lost-delete',d,spec(m),m.fetch);
 assert.equal(m.calls.filter(c=>c.body.requests).length,count);
 assert.equal(m.sheets.get('操作・削除履歴').rows.filter(r=>r[0]==='DA').length,1);
});
test('unknown deletion result retains journal and does not resend or acknowledge',async()=>{
 const {m}=await deletionBook('uncertain-delete');const d=updates(desired(['B','C'],['A']));
 const blocked=async(url,...args)=>{if(url.endsWith(':batchUpdate'))throw Error('connection lost');return m.fetch(url,...args);};
 await assert.rejects(save('t','uncertain-delete',d,spec(m),blocked),/connection lost/);
 await assert.rejects(save('t','uncertain-delete',d,spec(m),m.fetch),/まだ確認できません/);
 assert(m.memory.get('row-sync-pending-v1:uncertain-delete'));assert.equal(m.calls.filter(c=>c.body.requests).length,0);
});
test('missing proof, edits and unrelated changes cannot use deletion-only saving',async()=>{
 const {b}=await deletionBook('classify-delete');
 const d=desired(['B','C'],['A']);assert(householdDeletions(d,b));
 const noProof=structuredClone(d);noProof['操作・削除履歴']=[lh];assert.equal(householdDeletions(noProof,b),null);
 const edit=structuredClone(d);edit['檀家名簿'][1][1]='edited';assert.equal(householdDeletions(edit,b),null);
 assert.equal(householdDeletions({...d,'出納・会計':[['ID'],['NEW']]},b),null);
});
test('a deletion made while the first save is in flight remains queued for the second save',async()=>{
 const {m}=await deletionBook('in-flight-delete');
 const {queueAudit,currentPageAudit}=require('../src/utils/pendingAudit.ts');
 const entry=id=>({logId:'D'+id,id,entityType:'household',actionType:'delete',deletedTimestamp:1});
 queueAudit([entry('A')]);let added=false;
 const request=async(url,...args)=>{if(url.endsWith(':batchUpdate')&&!added){added=true;queueAudit([entry('B')]);}return m.fetch(url,...args);};
 await save('t','in-flight-delete',updates(desired(['B','C'],['A'])),spec(m),request);
 assert.deepEqual((await currentPageAudit()).map(e=>e.id),['B']);
 await save('t','in-flight-delete',updates(desired(['C'],['A','B'])),spec(m),m.fetch);
 assert.equal((await currentPageAudit()).length,0);
 assert.equal(m.sheets.get('檀家名簿').rows[2][2],'1');
 assert.equal(m.calls.filter(c=>c.body.requests).length,2);
});
test('Sheets numeric formatting must not turn an unchanged household into an edit',async()=>{
 const {b}=await deletionBook('formatted-delete');
 b['檀家名簿']=[['ID','名前','緯度',...ROW_META],['A','A','35.500000','','','old'],['B','B','35.600000','','','old']];
 const d={'檀家名簿':[['ID','名前','緯度'],['B','B',35.6]],'操作・削除履歴':[lh,['DA','delete','household','A']]};
 assert(householdDeletions(d,b));
 d['檀家名簿'][1][2]=35.7;assert.equal(householdDeletions(d,b),null);
});
test('formatted coordinates allow repeated deletion-only commits without editing numeric cells',async()=>{
 const {m,b}=await deletionBook('coordinate-sequence');
 const header=['ID','名前','緯度'];
 b['檀家名簿']=[[...header,...ROW_META],...['A','B','C'].map(id=>[id,id,'35.600000','','','old'])];
 m.sheets.get('檀家名簿').rows=structuredClone(b['檀家名簿']);await remember('coordinate-sequence',b);
 for(const deleted of [['A'],['A','B']]){
  const d={'檀家名簿':[header,...['A','B','C'].filter(id=>!deleted.includes(id)).map(id=>[id,id,35.6])],'操作・削除履歴':[lh,...deleted.map(id=>['D'+id,'delete','household',id])]};
  await save('t','coordinate-sequence',updates(d),spec(m),m.fetch);
 }
 const writes=m.calls.flatMap(c=>c.body.requests||[]).filter(r=>r.updateCells);
 assert.equal(writes.length,2);assert(writes.every(r=>r.updateCells.start.columnIndex===3));
 assert.equal(m.sheets.get('檀家名簿').rows[3][2],'35.600000');
});
test('acknowledging deletion pads omitted trailing cells before metadata',()=>{
 const {acceptHouseholdDeletion}=require('../src/utils/householdDeletion.ts');
 const {activeGrid}=require('../src/utils/rowSyncPlan.ts');
 const base={'檀家名簿':[['ID','名前','備考','更新日',...ROW_META],['A','A'],['B','B']], '操作・削除履歴':[[...lh,...ROW_META]]};
 const expected={'檀家名簿':[base['檀家名簿'][0],['A','A','','','1','date','op']], '操作・削除履歴':[[...lh,...ROW_META],['DA','delete','household','A','','','op']]};
 const accepted=acceptHouseholdDeletion(base,expected);
 assert.deepEqual(activeGrid(accepted['檀家名簿']).slice(1).map(r=>r[0]),['B']);
});
