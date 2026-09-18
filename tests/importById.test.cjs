const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
require.extensions['.ts']=(m,f)=>m._compile(compile(fs.readFileSync(f,'utf8')),f);
const {convertTableToData}=require('../src/utils/externalImportUtils.ts');
test('mapped IDs override names and stale decisions, with warnings for missing IDs',()=>{
 const existingHouseholds=[{id:'DK-00001',familyHead:'甲',templeId:'temple-main'},{id:'DK-00002',familyHead:'乙',templeId:'temple-main'},{id:'K0-00001',familyHead:'丙',templeId:'sub-0'}];
 const result=convertTableToData('past_record',['ID','名前','戒名'],[['DK-00001','乙','精霊1'],['','甲','精霊2'],['DK-12345','甲','精霊3'],['K0-00001','甲','精霊4'],['1','乙','精霊5']],{householdId:'ID',householdHeadName:'名前',dharmaName:'戒名'},{existingHouseholds,conflictMode:'append',targetTempleId:'temple-main',linkingDecisions:{0:{action:'link_existing',targetHouseholdId:'DK-00002',confirmedByUser:true}}});
 assert.deepEqual(result.importedPastRecords.map(r=>r.householdId),['DK-00001','DK-99999','DK-99999','DK-00001','DK-00001']);
 assert.equal(result.stats.warnings.length,2);assert.equal(result.stats.householdsCreated,0);
});
test('wizard goes directly to preview with ID mapping and still opens matching without IDs',async ()=>{
 const f=ts.createSourceFile('modal.tsx',fs.readFileSync(path.join(__dirname,'../src/components/ExternalDataImportModal.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(f)==='handleProceedToPreview')handler=n.initializer.getText(f);ts.forEachChild(n,visit);}visit(f);assert(handler);
 for(const useImportedHouseholdIds of [true,false]){
  const calls=[];const c={rawTable:{headers:[],rawRows:[]},activeFields:[],columnMapping:{},targetType:'past_record',useImportedHouseholdIds,linkingDecisions:{},existingHouseholds:[],conflictMode:'append',autoCreateHouseholdForKakocho:false,defaultHouseholdType:'',targetTempleId:'temple-main',temples:[],extractKakochoItems:()=>[{}],setKakochoItems(){},setShowLineageModal:()=>calls.push('matching'),convertForImport:async ()=>({}),setConversionResult(){},setStep:n=>calls.push(n),alert:m=>{throw Error(m);}};
  await vm.runInNewContext(compile(`(${handler})();`),c);assert.deepEqual(calls,useImportedHouseholdIds?[3]:['matching']);
 }
});


test('temple prefix changes preserve household numbers and link later files without a local map', () => {
 const target='temple-sub-K10-unique';
 const temples=[{id:'temple-main',isMain:true},{id:target,isMain:false}];
 const old=[{id:'K2-01000',templeId:'old',familyHead:'旧世帯'}];
 const options={existingHouseholds:old,conflictMode:'append',targetTempleId:target,temples};
 const result=convertTableToData('household',['ID','氏名'],[['K2-01000','新世帯'],['K2-01001','別世帯']],{id:'ID',familyHead:'氏名'},options);
 assert.deepEqual(result.importedHouseholds.map(h=>h.id),['K10-01000','K10-01001']);
 const linked={...options,existingHouseholds:JSON.parse(JSON.stringify(result.households)),temples:[...temples].reverse()};
 const past=convertTableToData('past_record',['ID','戒名'],[['K2-01000','精霊']],{householdId:'ID',dharmaName:'戒名'},linked);
 assert.equal(past.importedPastRecords[0].householdId,'K10-01000');
 const tx=convertTableToData('accounting',['ID','金額'],[['K2-01000','1000']],{householdId:'ID',amount:'金額'},linked);
 assert.equal(tx.importedTransactions[0].householdId,'K10-01000');
 assert.throws(()=>convertTableToData('accounting',['ID','金額'],[['K2-01002','1000']],{householdId:'ID',amount:'金額'},linked),/名簿にありません/);
 assert.throws(()=>convertTableToData('household',['ID','氏名'],[['K2-01000','重複']],{id:'ID',familyHead:'氏名'},linked),/すでに使われ/);
});

test('empty temple import distinguishes file duplicates and prefix collisions from existing directory IDs',()=>{
 const target='temple-sub-K5-new',options={existingHouseholds:[],conflictMode:'append',targetTempleId:target,temples:[{id:target,name:'取込先',isMain:false}]};
 for(const ids of [['K2-01890','K2-01890'],['DK-01890','K1-01890']]){
  assert.throws(()=>convertTableToData('household',['ID','氏名'],[[ids[0],'先の世帯'],[ids[1],'後の世帯']],{id:'ID',familyHead:'氏名'},options),e=>{
   assert.match(e.message,/取込ファイル内/);assert.match(e.message,/2行目「先の世帯」/);assert.match(e.message,/3行目「後の世帯」/);assert.match(e.message,/K5-01890/);assert(e.message.includes(ids[0])&&e.message.includes(ids[1]));return true;
  });
 }
 const existing={...options,existingHouseholds:[{id:'K5-01890',familyHead:'既存世帯',templeId:target}]};
 assert.throws(()=>convertTableToData('household',['ID','氏名'],[['K2-01890','取込世帯']],{id:'ID',familyHead:'氏名'},existing),/既存名簿の「既存世帯」様（所属：取込先）/);
});
