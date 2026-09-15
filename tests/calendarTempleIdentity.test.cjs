const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
test('calendar temple identity follows isMain instead of reserved IDs or active temple',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/components/ReservationCalendarManager.tsx'),'utf8');
 const block=source.slice(source.indexOf('  const isAffiliatedTempleService ='),source.indexOf('  // Helper for Google Maps query:'));
 const context={temples:[{id:'temple-main',name:'兼務の寺',isMain:false},{id:'other',name:'本寺の寺',isMain:true}],templeInfo:{name:'選択中の別寺'},households:[],pastRecords:[],memorialServices:[]};
 vm.createContext(context);
 vm.runInContext(ts.transpileModule(block+'\n globalThis.resolve=getServiceTempleInfo; globalThis.affiliated=isAffiliatedTempleService; globalThis.todo=getTodoTempleInfo;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 assert.equal(context.resolve({templeId:'temple-main'}).isAffiliated,true);
 assert.equal(context.resolve({templeId:'other'}).isAffiliated,false);
 assert.equal(context.resolve({}).name,'本寺の寺');
 assert.equal(context.resolve({templeId:'missing'}).name,'所属寺院未確認');
 assert.equal(context.affiliated({templeId:'temple-main'}),true);
 assert.equal(context.todo({templeId:'other'}).name,'本寺の寺');
});
