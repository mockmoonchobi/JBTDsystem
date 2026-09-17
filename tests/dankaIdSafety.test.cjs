const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

// Transpile dankaIdUtils.ts to JS for testing
const dankaIdUtilsSource = fs.readFileSync(path.join(root, 'src/utils/dankaIdUtils.ts'), 'utf8');
const compiledDankaIdUtils = ts.transpileModule(dankaIdUtilsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

const stored = {};
const storage = { loadJsonState: (k,d) => stored[k] || d, saveJsonState: (k,v) => { stored[k] = v; } };
const dankaIdModule = { exports: {} };
const fn = new Function('require', 'module', 'exports', compiledDankaIdUtils);
fn(name => name === './storageUtils' ? storage : require(name), dankaIdModule, dankaIdModule.exports);

const {
  getUnlinkedHouseholdId,
  isUnlinkedHouseholdId,
  cleanAndNormalizeHouseholdId,
  generateNewHouseholdId,
  UNLINKED_HOUSEHOLD_ID
} = dankaIdModule.exports;

test('getUnlinkedHouseholdId returns temple-specific reserved 99999 IDs', () => {
  const temples = [
    { id: 'temple-main', name: '本寺' },
    { id: 'temple-k0', name: '兼務寺1' },
    { id: 'temple-k1', name: '兼務寺2' },
  ];

  // 本寺 -> DK-99999
  assert.equal(getUnlinkedHouseholdId('temple-main', temples), 'DK-99999');
  assert.equal(getUnlinkedHouseholdId(undefined, temples), 'DK-99999');

  // 兼務寺 -> K0-99999, K1-99999
  assert.equal(getUnlinkedHouseholdId('temple-k0', temples), 'K0-99999');
  assert.equal(getUnlinkedHouseholdId('temple-k1', temples), 'K1-99999');
});

test('isUnlinkedHouseholdId accurately detects all unlinked representations', () => {
  assert.equal(isUnlinkedHouseholdId('DK-99999'), true);
  assert.equal(isUnlinkedHouseholdId('K0-99999'), true);
  assert.equal(isUnlinkedHouseholdId('K1-99999'), true);
  assert.equal(isUnlinkedHouseholdId('K2-99999'), true);
  assert.equal(isUnlinkedHouseholdId('99999'), true);
  assert.equal(isUnlinkedHouseholdId('UNLINKED'), true);
  assert.equal(isUnlinkedHouseholdId('DK-UNLINKED'), true);

  // 通常の檀家IDは未設定とは判定しない
  assert.equal(isUnlinkedHouseholdId('DK-00001'), false);
  assert.equal(isUnlinkedHouseholdId('K0-00001'), false);
  assert.equal(isUnlinkedHouseholdId('DK-00123'), false);
});

test('generateNewHouseholdId never generates 99999 and avoids potential conflicts', () => {
  const temples = [
    { id: 'temple-main', name: '本寺' },
    { id: 'temple-k0', name: '兼務寺1' },
  ];

  // 空の世帯リストから本寺新規ID採番
  const id1 = generateNewHouseholdId('temple-main', [], temples);
  assert.equal(id1, 'DK-00001');

  // 兼務寺新規ID採番
  const idK0 = generateNewHouseholdId('temple-k0', [], temples);
  assert.equal(idK0, 'K0-00001');

  // 未設定ID (DK-99999) が精霊レコードや世帯に存在していても、通常採番は連番から行われること
  const existingPastRecords = [
    { id: 'P1', householdId: 'DK-99999' },
    { id: 'P2', householdId: 'DK-00001' },
  ];
  const existingHouseholds = [
    { id: 'DK-00001', familyHead: '山田' }
  ];

  const nextId = generateNewHouseholdId('temple-main', existingHouseholds, temples, existingPastRecords);
  assert.equal(nextId, 'DK-00002');
  assert.notEqual(nextId, 'DK-99999');
});


test('deleted highest ID and six-digit IDs are never reissued on this browser',()=>{
 const first=generateNewHouseholdId('temple-main',[{id:'DK-100005'}]);
 assert.equal(first,'DK-100006');
 assert.equal(generateNewHouseholdId('temple-main',[]),'DK-100007');
 assert.equal(generateNewHouseholdId('temple-main',[],undefined,[{householdId:'DK-100010'}]),'DK-100011');
});

test('new registration never updates the existing owner of its provisional ID',()=>{
 const source=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 const start=source.indexOf('const handleSaveHousehold = '),end=source.indexOf('const handleBatchUpdateHouseholds',start);
 const body=source.slice(start,end).replace('const handleSaveHousehold = ','').trim().replace(/;$/,'');
 const vm=require('node:vm');
 let households=[{id:'DK-100012',familyHead:'既存の檀家'}];
 const env={households,pastRecords:[{householdId:'DK-100020'}],transactions:[{householdId:'DK-100030'}],memorialServices:[],familyMembers:[],templeTodos:[],temples:[],loadDeletedRecordsLog:()=>[],generateNewHouseholdId,
 retainedHouseholds:()=>({}),reserveHousehold:()=>{},withCreationAudit:x=>x,withUpdateAudit:()=>{throw Error('new registration must not update');},recordHistory:()=>{},getCurrentOperatorInfo:()=>({}),recordOperationLog:()=>{},formatHouseholdLogDesc:()=>'',setHouseholds:fn=>households=fn(households)};
 const compiled=ts.transpileModule('('+body+')',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,env)({id:'DK-100012',familyHead:'吉岡よしお',familyMembers:[{id:'F1',householdId:'DK-100012'}]},true);
 assert.equal(households.length,2);assert.equal(households[1].familyHead,'既存の檀家');
 assert.equal(households[0].familyHead,'吉岡よしお');assert.equal(households[0].id,'DK-100031');
 assert.equal(households[0].familyMembers[0].householdId,households[0].id);
});

test('six digit IDs containing reserved-looking suffixes stay distinct through normalization and allocation',()=>{
 for(const id of ['DK-100000','DK-199999','DK-200000','K0-299999','K99999-00123']) {
  assert.equal(isUnlinkedHouseholdId(id),false);
 }
 for(const id of ['DK-100000','DK-199999','DK-200000']) assert.equal(cleanAndNormalizeHouseholdId(id,'temple-main'),id);
 for(const id of ['0','00000','99999','DK-99999','K1-00000','K1-99999-2']) assert.equal(isUnlinkedHouseholdId(id),true);
 assert.equal(generateNewHouseholdId('temple-main',[{id:'DK-200000'}]),'DK-200001');
});

test('roster new-household button opens the guarded creation form without writing a provisional record',()=>{
 const source=fs.readFileSync(path.join(root,'src/components/HouseholdList.tsx'),'utf8');
 const ast=ts.createSourceFile('HouseholdList.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='handleStartAddNewHousehold')handler=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(handler);
 let opened=0;const fail=()=>{throw Error('must not write or select a provisional household')};
 const js=ts.transpileModule('('+handler+')()',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 require('node:vm').runInNewContext(js,{onOpenAddModal:()=>opened++,onEditHousehold:fail,setSelectedIndividualId:fail,setViewMode:fail,setIsEditingHouseholdInline:fail,setInlineHouseholdForm:fail});
 assert.equal(opened,1);assert(source.includes('onClick={handleStartAddNewHousehold}'));
});

test('open household forms retain typed names and provisional IDs through background list refresh',()=>{
 for(const file of ['src/components/HouseholdModal.tsx','src/components/mobile/MobileHouseholdModal.tsx']) {
  const source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
  function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('initializedFormKey'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(effect);
  let draft,counter=0;const ctx={isOpen:true,initializedFormKey:{current:null},household:null,editingHousehold:null,activeTempleId:'temple-main',temples:[],existingHouseholds:[],existingPastRecords:[],masterOptions:{},generateNewHouseholdId:()=> 'DK-'+(++counter),setFormData:v=>draft=v,setFamilyMembers:()=>{}};
  const run=()=>require('node:vm').runInNewContext(ts.transpileModule('('+effect+')()',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  run();draft.familyHead='吉岡よしお';const firstId=draft.id;ctx.existingHouseholds=[{id:'DK-1'}];run();assert.equal(draft.familyHead,'吉岡よしお');assert.equal(draft.id,firstId);assert.equal(counter,1);
  ctx.isOpen=false;run();ctx.isOpen=true;run();assert.equal(draft.familyHead,'');assert.equal(counter,2);
 }
});
