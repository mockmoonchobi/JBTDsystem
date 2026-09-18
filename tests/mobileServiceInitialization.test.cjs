const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
test('temple selection survives new array props and remote refreshes until the form closes',()=>{
 const source=fs.readFileSync('src/components/mobile/MobileServiceModal.tsx','utf8'),ast=ts.createSourceFile('modal.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
 function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('initializedForm.current'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(effect);
 let form,step,resets=0;
 const c={isOpen:true,service:null,initialDate:'2026/09/18',initialHouseholdId:undefined,initialPastRecordId:undefined,initialMilestoneType:undefined,activeTempleId:'ALL',temples:[{id:'main',isMain:true,name:'本寺'},{id:'sub',name:'兼務寺'}],priests:[],households:[],pastRecords:[],todayStr:'2026/09/18',initializedForm:{current:null},setIsConfirmDeleteOpen(){},setFormData:v=>{form=typeof v==='function'?v(form):v;resets++;},setCurrentStep:v=>step=v,setIsOtherMemorialType(){},setCustomMemorialTypeName(){},setHouseholdSearchQuery(){},setHouseholdDistrictFilter(){},setHouseholdKanaFilter(){},filterDanmuPriests:()=>[],sortPriestsForTemple:()=>[]};
 const context=vm.createContext(c),run=()=>vm.runInContext(ts.transpileModule('('+effect+')()',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 run();assert.equal(step,'step_temple');form.templeId='sub';form.notes='編集中';step='step_category';const initialized=resets;
 c.priests=[];c.temples=c.temples.map(t=>({...t}));run();assert.equal(resets,initialized);assert.equal(form.templeId,'sub');assert.equal(form.notes,'編集中');assert.equal(step,'step_category');
 c.isOpen=false;run();c.isOpen=true;run();assert.equal(resets,initialized+1);assert.equal(step,'step_temple');
});
