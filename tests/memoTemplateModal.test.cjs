const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');

test('memo manager creates, edits, selects and deletes the last template without recreating it',()=>{
  const slots=[];let cursor=0,effects=[],first=true,stored=[],chosen,tree;
  const React={
    createElement:(type,props,...children)=>({type,props:props||{},children}),
    useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef:()=>({current:null}),useEffect:fn=>{if(first)effects.push(fn);},
  };
  const templates={INITIAL_NOTICE_TEMPLATES:[],DEFAULT_KAKU2_MEMO_TEMPLATE:'標準',getAllSavedNoticeTemplates:()=>stored,saveAllNoticeTemplates:t=>{stored=t;}};
  const imports={react:React,'../utils/memorialCalculator':templates,'../utils/deletedRecordsLog':{recordOperationLog(){},getCurrentOperatorInfo:()=>({})},'./SaveConfirmModal':{SaveConfirmModal:'save-confirm'},'./DeleteConfirmModal':{DeleteConfirmModal:'delete-confirm'}};
  const context={exports:{},require:name=>imports[name]||{},setTimeout(){}};
  const source=fs.readFileSync(path.join(__dirname,'../src/components/Kaku2MemoTemplateModal.tsx'),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);
  const props={isOpen:true,onClose(){},renderPreview:()=>null,onTemplateSelected:t=>{chosen=t;}};
  function render(){cursor=0;tree=context.exports.Kaku2MemoTemplateModal(props);for(const fn of effects)fn();effects=[];if(first){first=false;render();}}
  const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:node?.children?node.children.map(text).join(''):'';
  function find(predicate,node=tree){if(!node)return; if(Array.isArray(node)){for(const c of node){const match=find(predicate,c);if(match)return match;}}else if(typeof node==='object'){if(predicate(node))return node;return find(predicate,node.children);}}
  function click(label){const button=find(n=>n.type==='button'&&text(n)===label);assert(button,label);button.props.onClick();render();}
  render();
  click('新規追加');assert.equal(stored.length,1);
  const textarea=find(n=>n.type==='textarea');textarea.props.onChange({target:{value:'保存する新しい文章'}});render();
  click('保存してこのテンプレートを使う');
  assert.equal(stored[0].content,'保存する新しい文章');assert.equal(chosen.id,stored[0].id);
  click('このテンプレートを削除');
  const dialog=find(n=>n.type==='delete-confirm'&&n.props.title==='テンプレートの削除');assert(dialog);dialog.props.onConfirm();render();
  assert.equal(stored.length,0);assert(text(tree).includes('角２宛名面メモは未登録です'));
  assert(!find(n=>n.type==='textarea'));
});
