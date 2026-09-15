const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
require.extensions['.ts']=(m,f)=>m._compile(compile(fs.readFileSync(f,'utf8')),f);
const {convertTableToData}=require('../src/utils/externalImportUtils.ts');
test('mapped IDs override names and stale decisions, with warnings for missing IDs',()=>{
 const existingHouseholds=[{id:'DK-00001',familyHead:'甲',templeId:'temple-main'},{id:'DK-00002',familyHead:'乙',templeId:'temple-main'},{id:'K0-00001',familyHead:'丙',templeId:'sub-0'}];
 const result=convertTableToData('past_record',['ID','名前','戒名'],[['DK-00001','乙','精霊1'],['','甲','精霊2'],['DK-12345','甲','精霊3'],['K0-00001','甲','精霊4'],['1','乙','精霊5']],{householdId:'ID',householdHeadName:'名前',dharmaName:'戒名'},{existingHouseholds,conflictMode:'append',targetTempleId:'temple-main',linkingDecisions:{0:{action:'link_existing',targetHouseholdId:'DK-00002',confirmedByUser:true}}});
 assert.deepEqual(result.importedPastRecords.map(r=>r.householdId),['DK-00001','DK-99999','DK-99999','K0-00001','DK-00001']);
 assert.equal(result.stats.warnings.length,2);assert.equal(result.stats.householdsCreated,0);
});
test('wizard goes directly to preview with ID mapping and still opens matching without IDs',()=>{
 const f=ts.createSourceFile('modal.tsx',fs.readFileSync(path.join(__dirname,'../src/components/ExternalDataImportModal.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(f)==='handleProceedToPreview')handler=n.initializer.getText(f);ts.forEachChild(n,visit);}visit(f);assert(handler);
 for(const useImportedHouseholdIds of [true,false]){
  const calls=[];const c={rawTable:{headers:[],rawRows:[]},activeFields:[],columnMapping:{},targetType:'past_record',useImportedHouseholdIds,linkingDecisions:{},existingHouseholds:[],conflictMode:'append',autoCreateHouseholdForKakocho:false,defaultHouseholdType:'',targetTempleId:'temple-main',temples:[],extractKakochoItems:()=>[{}],setKakochoItems(){},setShowLineageModal:()=>calls.push('matching'),convertTableToData:()=>({}),setConversionResult(){},setStep:n=>calls.push(n),alert:m=>{throw Error(m);}};
  vm.runInNewContext(compile(`(${handler})();`),c);assert.deepEqual(calls,useImportedHouseholdIds?[3]:['matching']);
 }
});
