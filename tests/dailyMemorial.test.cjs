const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
require.extensions['.ts']=(m,file)=>m._compile(compile(fs.readFileSync(file,'utf8')),file);
const {getDailyMemorialTargets}=require('../src/utils/memorialCalculator.ts');
const headings=['DailyMemorialList','RecentMemorialPrintModal'].map(name=>{
  const file=ts.createSourceFile(name+'.tsx',fs.readFileSync(path.join(root,'src/components',name+'.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const fn=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='getKijitsuHeadLabel');
  assert(fn);return vm.runInNewContext(compile(fn.getText(file))+'; getKijitsuHeadLabel');
});
function target(years,date=new Date(2026,8,15),deathDate=`${2026-years}/09/15`) {
  return getDailyMemorialTargets([{id:'P1',deathDate}],[],date);
}
test('daily list and both print headings display the first anniversary and every supported memorial year',()=>{
  const cases=[[1,'一周忌'],[2,'三回忌'],[6,'七回忌'],[12,'十三回忌'],[16,'十七回忌'],[22,'二十三回忌'],[26,'二十七回忌'],[32,'三十三回忌'],[49,'五十回忌'],[99,'百回忌'],[199,'二百回忌'],[299,'三百回忌'],[399,'四百回忌']];
  for(const [years,label] of cases){const items=target(years);assert.equal(items.length,1);assert.equal(items[0].category,'年回忌');for(const heading of headings)assert.equal(heading(items[0]),label);}
  const ordinary=target(3)[0];assert.equal(ordinary.category,'祥月命日');for(const heading of headings)assert.equal(heading(ordinary),'');
  assert.equal(target(1,new Date(2026,8,14)).length,0);
});
test('leap-day first anniversary is labelled on February 28 in a common year',()=>{
  const items=target(1,new Date(2025,1,28),'2024/02/29');assert.equal(items.length,1);
  for(const heading of headings)assert.equal(heading(items[0]),'一周忌');
  assert.equal(target(1,new Date(2025,2,1),'2024/02/29').length,0);
});
