const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/components/TanagyoPatronMapModal.tsx'),'utf8');
const ast=ts.createSourceFile('map.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let append,draw;
function visit(n){if(ts.isIfStatement(n)&&n.thenStatement.getText(ast).includes('routeCoords.push')&&!n.thenStatement.getText(ast).includes('resolvedPins.forEach'))append=n.getText(ast);if(ts.isIfStatement(n)&&n.expression.getText(ast)==='activeStep === 3 && routeCoords.length > 1')draw=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);
const sort=source.match(/displayPatrons.sort\([^;]+;/)[0];
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function route(orders,activeStep=3){const ctx={activeStep,displayPatrons:orders.map((tanagyoOrder,i)=>({tanagyoOrder,coord:{lat:i,lng:i}})),routeCoords:[],routePolylineRef:{current:{setLatLngs:coords=>{ctx.drawn=coords}}}};vm.runInNewContext(compile(sort+'displayPatrons.forEach(h=>{const coord=h.coord;'+append+'});'+draw),ctx);return JSON.parse(JSON.stringify(ctx.drawn));}
test('map connects only numbered pins in number order and clears the line after reset',()=>{
 assert(append&&draw);assert.deepEqual(route([undefined,undefined]),[]);assert.deepEqual(route([undefined,1]),[]);
 assert.deepEqual(route([3,undefined,1,2,0,-1]),[[2,2],[3,3],[0,0]]);
 assert.deepEqual(route([undefined,undefined,undefined]),[]);assert.deepEqual(route([1,2],2),[]);
});
