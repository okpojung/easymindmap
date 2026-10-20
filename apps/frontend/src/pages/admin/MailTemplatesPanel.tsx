import { useEffect, useState } from 'react';
import { adminApi, type AdminMailTemplate } from '@/services/cloud/adminApi';
export function MailTemplatesPanel() {
 const [items,setItems]=useState<AdminMailTemplate[]>([]),[id,setId]=useState(''),[subject,setSubject]=useState(''),[text,setText]=useState('');
 const [preview,setPreview]=useState<{subject:string;text:string}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const current=items.find(x=>x.id===id);
 async function load(){try{const r=await adminApi.mailTemplates();setItems(r.templates);}catch(e){setMessage((e as Error).message);}}
 useEffect(()=>{void load();},[]);
 function choose(x:AdminMailTemplate){setId(x.id);setSubject(x.subject);setText(x.text);setPreview(null);setMessage('');}
 async function action(save:boolean){if(!current||busy)return;setBusy(true);setMessage('');try{const body={subject,text,baseUpdatedAt:current.updatedAt};if(save){const r=await adminApi.saveMailTemplate(id,body);setItems(items.map(x=>x.id===id?{...x,subject,text,updatedAt:r.updatedAt}:x));setMessage('메일 발송문을 저장했습니다. 이후 발송부터 적용됩니다.');}else setPreview(await adminApi.previewMailTemplate(id,body));}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <section data-testid="admin-mail-templates"><h2>메일발송문 관리</h2><p>제목과 일반 텍스트 본문만 편집합니다. 수신자·발신자·권한·SMTP 설정은 변경하지 않습니다. 미리보기는 가상 예시이며 메일을 보내지 않습니다.</p>
 <div>{items.map(x=><button key={x.id} disabled={busy} onClick={()=>choose(x)}>{x.label}</button>)}</div>
 {current&&<fieldset disabled={busy}><legend>{current.label}</legend><p>허용 변수: {current.variables.map(x=>'{{'+x+'}}').join(', ')} / 본문 필수: {current.required.join(', ')}</p>
 <label>제목<input aria-label="메일 제목" maxLength={200} value={subject} onChange={e=>{setSubject(e.target.value);setPreview(null);}} style={{display:'block',width:'100%'}}/></label>
 <label>본문<textarea aria-label="메일 본문" maxLength={20000} rows={14} value={text} onChange={e=>{setText(e.target.value);setPreview(null);}} style={{display:'block',width:'100%'}}/></label>
 {current.footer&&<p>자동 추가되는 필수 안내: {current.footer}</p>}
 <button onClick={()=>{setSubject(current.defaultSubject);setText(current.defaultText);setPreview(null);}}>기본 문구 불러오기</button><button onClick={()=>void action(false)}>가상 예시 미리보기</button><button onClick={()=>void action(true)}>저장</button></fieldset>}
 <button disabled={busy} onClick={()=>{setId('');setPreview(null);void load();}}>새로고침</button>
 {message&&<p role="status">{message}</p>}{preview&&<div><h3>미리보기 (실제 발송 없음)</h3><strong>{preview.subject}</strong><pre style={{whiteSpace:'pre-wrap'}}>{preview.text}</pre></div>}
 </section>;
}
