const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),vm=require('vm'),ts=require('typescript');
const source=fs.readFileSync('src/components/TempleInfoModal.tsx','utf8');
const tree=ts.createSourceFile('modal.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function nodes(predicate){const result=[];function visit(n){if(predicate(n))result.push(n);ts.forEachChild(n,visit);}visit(tree);return result;}
test('fee-name composition never creates or changes a category in all three slots',()=>{
 for(const slot of [1,2,3]){
  const input=nodes(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(tree)==='input'&&n.getText(tree).includes(`value={currentTemple.feeType${slot} || ''}`))[0];
  const handler=input.attributes.properties.find(a=>a.name?.getText(tree)==='onChange').initializer.expression.getText(tree);
  for(const category of [undefined,'祠堂金']){
   const temple={[`feeType${slot}Category`]:category};
   for(const text of ['h','ほ','ほけんりょう','保険料']){
    vm.runInNewContext(compile(`(${handler})({target:{value:${JSON.stringify(text)}}})`),{currentTemple:temple,updateCurrentTemple:u=>Object.assign(temple,u)});
    assert.equal(temple[`feeType${slot}`],text);assert.equal(temple[`feeType${slot}Category`],category);
   }
  }
 }
});
test('saving rejects missing and unregistered categories before calling persistence',()=>{
 const handler=nodes(n=>ts.isVariableDeclaration(n)&&n.name.getText(tree)==='executeSaveAndClose')[0].initializer.getText(tree);
 for(const category of [undefined,'h','墓地せいそうりょう']){
  const messages=[];const temple={id:'t',name:'テスト寺',feeType1:'保険料',feeType1Category:category};
  vm.runInNewContext(compile(`(${handler})();`),{initialSnapshotRef:{current:null},templeList:[temple],masterStateMap:{t:{incomeCategories:['祠堂金']}},EMPTY_MASTER_OPTIONS:{},selectedTempleId:'t',setShowSaveConfirm(){},showNotice:m=>messages.push(m)});
  assert.equal(messages.length,1);assert.match(messages[0],/勘定科目を選択/);
 }
});
