const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
for(const file of ['KakochoList.tsx','mobile/MobileKakochoModal.tsx']) {
  test(`${file}: new household supplies its tomb number, manual corrections and existing records are preserved`,()=>{
    const ast=ts.createSourceFile(file,fs.readFileSync(path.join(__dirname,'../src/components',file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const handlers={};
    function visit(n){
      if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
        const attrs=n.attributes.properties;
        const value=attrs.find(a=>a.name?.text==='value')?.initializer?.getText(ast)||'';
        const change=attrs.find(a=>a.name?.text==='onChange')?.initializer;
        for(const field of ['householdId','burialLocation'])if(value.includes('formData.'+field)&&change)handlers[field]=change.expression.getText(ast);
      }
      ts.forEachChild(n,visit);
    }visit(ast);
    const context={formData:{householdId:'',burialLocation:''},households:[{id:'H1',tombNumber:'A-12'},{id:'H2',tombNumber:'B-34'},{id:'H3'}],editingRecord:null,isEditing:false,burialEdited:false,getHouseholdSponsorName:()=>''};
    context.setFormData=v=>{context.formData=v;};context.setBurialEdited=v=>{context.burialEdited=v;};
    function change(field,value){assert(handlers[field]);vm.runInNewContext(`(${handlers[field]})({target:{value:${JSON.stringify(value)}}})`,context);}
    change('householdId','H1');assert.equal(context.formData.burialLocation,'A-12');
    change('householdId','H2');assert.equal(context.formData.burialLocation,'B-34');
    change('householdId','H3');assert.equal(context.formData.burialLocation,'');
    change('burialLocation','納骨堂 C-5');change('householdId','H1');assert.equal(context.formData.burialLocation,'納骨堂 C-5');
    change('burialLocation','');change('householdId','H2');assert.equal(context.formData.burialLocation,'');
    context.editingRecord={id:'P1'};context.isEditing=true;context.burialEdited=false;context.formData.burialLocation='別の墓地';
    change('householdId','H1');assert.equal(context.formData.burialLocation,'別の墓地');
  });
}
