const $=id=>document.getElementById(id);const storageKey='clarity-reports-v1';let selected=[],current=null,session=null;const authStore='clarity-auth-v2';let refreshInFlight=null;const config=()=>({url:localStorage.getItem('sb-url')||'https://gvxmvvthyztptlopovyj.supabase.co',key:localStorage.getItem('sb-key')||'sb_publishable_TvvU-RDND7rQk_nMHX0qCQ_m4neXMF6'});const reports=()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{return []}};const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const setView=id=>{document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.id!==id));document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===id));if(id==='history'){renderHistory();if(session?.access_token)syncReports().then(renderHistory).catch(()=>{});}if(id==='insights'){renderInsights();if(session?.access_token)syncReports().then(renderInsights).catch(()=>{});}window.scrollTo(0,0)};document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('back').onclick=()=>setView('upload');const drop=$('drop');drop.onclick=()=>{$('files').click()};drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag')};drop.ondragleave=()=>drop.classList.remove('drag');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');addFiles(e.dataTransfer.files)};$('files').onchange=e=>addFiles(e.target.files);function addFiles(files){for(const f of files){if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(f.type)){alert('Unsupported file: '+f.name);continue}if(f.size>15*1024*1024){alert('File exceeds 15 MB: '+f.name);continue}if(!selected.some(x=>x.name===f.name&&x.size===f.size))selected.push(f)}renderFiles()}function renderFiles(){$('filelist').innerHTML=selected.map((f,i)=>`<div class="fileitem"><span>${esc(f.name)} · ${(f.size/1048576).toFixed(1)} MB</span><button data-remove="${i}">Remove</button></div>`).join('');$('filelist').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{selected.splice(+b.dataset.remove,1);renderFiles()});$('analyze').disabled=!selected.length;$('notice').textContent=selected.length?`${selected.length} file(s) ready`:'Upload a completed test to begin.'}const readFile=f=>new Promise((resolve,reject)=>{let r=new FileReader;r.onload=()=>resolve({name:f.name,type:f.type,data:r.result.split(',')[1]});r.onerror=reject;r.readAsDataURL(f)});function saveSession(value){
  session=value;
  if(value?.access_token){
    value.expires_at=value.expires_at||Math.floor(Date.now()/1000)+Number(value.expires_in||3600);
    localStorage.setItem(authStore,JSON.stringify(value));
    $('authNotice').textContent='Signed in as '+(value.user?.email||'student');
  }else{localStorage.removeItem(authStore);$('authNotice').textContent='Signed out';}
}
async function refreshSession(){
  if(refreshInFlight)return refreshInFlight;
  if(!session?.refresh_token){saveSession(null);throw Error('Session expired. Please sign in again.');}
  refreshInFlight=(async()=>{
    const {url,key}=config();
    let response=await fetch(url.replace(/\/$/,'')+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:{'apikey':key,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:session.refresh_token})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.access_token){saveSession(null);throw Error('Your login expired. Please sign in again.');}
    saveSession(data);return data;
  })().finally(()=>{refreshInFlight=null});
  return refreshInFlight;
}
async function ensureSession(){
  if(!session?.access_token)throw Error('Please sign in under Settings → Account.');
  if(!session.expires_at||session.expires_at<=Math.floor(Date.now()/1000)+90)await refreshSession();
}
async function request(path,method='GET',body,repeat=true){
  const {url,key}=config();
  if(!url||!key)throw Error('Configure Supabase in Settings first.');
  const isAuth=path.startsWith('/auth/v1/');
  if(!isAuth)await ensureSession();
  const headers={'apikey':key,'Content-Type':'application/json'};
  if(path.includes('on_conflict=id'))headers.Prefer='resolution=merge-duplicates,return=minimal';
  if(!isAuth)headers.Authorization='Bearer '+session.access_token;
  let response;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),65000);
  const worker=localStorage.getItem('clarity-worker-url')||'';
  const isAI=path==='/functions/v1/analyze-paper'&&worker.startsWith('https://');
  const target=isAI?worker.replace(/\/$/,''):url.replace(/\/$/,'')+path;
  if(isAI){delete headers.apikey;delete headers.Prefer;}
  try{response=await fetch(target,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});}
  catch(e){throw Error(e?.name==='AbortError'?'Analysis request exceeded 65 seconds. The backend did not respond in time.':'Cannot reach Supabase or the request was blocked. Check the function health link and Supabase Invocations.');}
  finally{clearTimeout(timeout);}
  if(response.status===401&&!isAuth&&repeat){await refreshSession();return request(path,method,body,false);}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===503)throw Error('Supabase returned 503 (service unavailable). Check Edge Function invocations and platform status.');
    throw Error(data.error||data.msg||data.message||`Request failed (${response.status})`);
  }
  return data;
}
const topicRules=[
  ['Algebra & equations',/algebra|equation|solve for|simplif|factor|linear|quadratic|polynomial|\bx\s*[+=-]/i],
  ['Geometry & measurement',/geometr|triangle|circle|area|perimeter|volume|angle|radius|diameter/i],
  ['Calculus',/derivat|differentiat|integrat|limit|calculus|slope|tangent/i],
  ['Statistics & probability',/statistic|probabil|mean|median|mode|variance|standard deviation|regression/i],
  ['Grammar & sentence structure',/grammar|punctuat|verb|tense|sentence|noun|pronoun|adjective|adverb|preposition/i],
  ['Reading comprehension',/passage|comprehension|according to the text|read the|main idea|inference/i],
  ['Vocabulary & spelling',/vocab|word|synonym|antonym|spell|meaning/i],
  ['Writing & expression',/essay|paragraph|writing|letter|explain in your own|composition/i],
  ['Physics concepts',/force|motion|velocity|acceleration|energy|electricity|newton/i],
  ['Chemistry concepts',/reaction|compound|atom|mole|chemical|acid|base|element/i],
  ['Biology concepts',/cell|photosynthesis|organism|genetics|respiration|biology/i]
];
function inferTopic(q,subject){
  if(typeof q.topic==='string'&&q.topic.trim())return q.topic.trim();
  const words=[q.question,q.feedback,q.solution].filter(Boolean).join(' ');
  for(const [name,pattern] of topicRules)if(pattern.test(words))return name;
  const sub=(subject||'').toLowerCase();
  if(/math/.test(sub))return 'Mathematical reasoning';
  if(/english|language/.test(sub))return 'Language skills';
  if(/science/.test(sub))return 'Science concepts';
  return 'Core '+(subject||'subject')+' concepts';
}
function prepareReport(r){
  const qs=Array.isArray(r.questions)?r.questions:[];
  const valid=new Set(['correct','incorrect','partial','needs_review']);
  for(const q of qs){
    q.status=valid.has(q.status)?q.status:'needs_review';
    q.topic=inferTopic(q,r.subject);
  }
  const buckets=new Map();
  for(const q of qs){
    const key=q.topic;
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(q);
  }
  const existing=new Map((Array.isArray(r.topics)?r.topics:[]).filter(t=>t&&t.name).map(t=>[t.name.trim().toLowerCase(),t]));
  const generated=[...buckets].map(([name,items])=>{
    const scored=items.filter(q=>q.status!=='needs_review');
    const score=scored.length?Math.round(100*scored.reduce((sum,q)=>sum+(q.status==='correct'?1:q.status==='partial'?.5:0),0)/scored.length):null;
    const old=existing.get(name.toLowerCase());
    const missed=items.filter(q=>q.status==='incorrect'||q.status==='partial');
    const uncertain=items.filter(q=>q.status==='needs_review');
    const advice=missed.length?`Review ${name.toLowerCase()} and redo ${missed.length} missed or partially correct question(s). Check your reasoning against the worked solutions, then practice 5 similar questions.`:uncertain.length?`Review ${uncertain.length} question(s) that could not be graded reliably. Confirm the written answers or provide an answer key.`:`Keep practicing ${name.toLowerCase()} to retain accuracy.`;
    return {name,accuracy:score,recommendation:old?.recommendation||advice,questionCount:items.length,needsReview:uncertain.length};
  });
  r.topics=generated.length?generated:(Array.isArray(r.topics)?r.topics:[]);
  return r;
}
function writeLocalReport(r){
  const list=reports();
  const index=list.findIndex(x=>x.id===r.id);
  if(index>=0)list[index]=r;else list.unshift(r);
  localStorage.setItem(storageKey,JSON.stringify(list));
  return list;
}
async function persistReport(r){
  writeLocalReport(r);
  if(!session?.access_token)return {cloud:false,reason:'Sign in to sync reports to Supabase.'};
  try{
    await request('/rest/v1/reports?on_conflict=id','POST',{
      id:r.id,user_id:session.user.id,report:r,created_at:r.createdAt
    });
    return {cloud:true};
  }catch(e){return {cloud:false,reason:e.message};}
}
function setSaveStatus(msg){const el=$('saveStatus');if(el)el.textContent=msg;}
async function analyze(){
  if(!session?.access_token){$('notice').textContent='Sign in under Settings → Account before analyzing a paper.';setView('settings');return;}
  const btn=$('analyze');btn.disabled=true;btn.textContent='Analyzing…';
  $('notice').textContent='Checking the paper with Gemini. Please keep this tab open until results appear.';
  try{
    const files=await Promise.all(selected.map(readFile));
    const response=await request('/functions/v1/analyze-paper','POST',{files,testName:$('testName').value||'Untitled test',subject:$('subject').value||'General'});
    if(!response.report||!Array.isArray(response.report.questions))throw Error('The AI returned an invalid report.');
    current=prepareReport({...response.report,id:crypto.randomUUID(),createdAt:new Date().toISOString(),testName:$('testName').value||'Untitled test',subject:$('subject').value||'General'});
    // Save immediately. Keep local copy even if the cloud is temporarily unavailable.
    let saveResult;
    try{saveResult=await persistReport(current);}catch(e){saveResult={cloud:false,reason:'Browser storage unavailable: '+e.message};}
    renderReport(current);setView('results');
    setSaveStatus(saveResult.cloud?'Saved automatically to History and Supabase.':'Saved to this browser. Cloud sync pending: '+(saveResult.reason||'Unknown error'));
    $('notice').textContent='Analysis complete. Open History to revisit your paper.';
  }catch(e){$('notice').textContent=e.message;}
  finally{btn.textContent='Analyze paper →';btn.disabled=!selected.length;}
}
$('analyze').onclick=analyze;

// Display AI-written mathematics safely and readably. Original text remains untouched in saved reports.
function mathFallback(latex){
  return String(latex).replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,'($1) / ($2)')
    .replace(/\\(?:Delta|delta)/g,'Δ').replace(/\\times/g,'×').replace(/\\cdot/g,'·')
    .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g,'$1').replace(/\\%/g,'%')
    .replace(/\\(?:ln|log)/g,(_,x)=>x).replace(/[{}]/g,'').replace(/\\_/g,'_')
    .replace(/\\([A-Za-z]+)/g,'$1').replace(/\\/g,'');
}
function mathHTML(raw,display=false){
  try{
    if(window.katex?.renderToString)return window.katex.renderToString(raw,{displayMode:display,throwOnError:false,trust:false,strict:'ignore',output:'html'});
  }catch(e){console.warn('Math formatting issue:',e)}
  return `<span class="math-fallback">${esc(mathFallback(raw))}</span>`;
}
function formattedInline(raw){
  const source=String(raw??'');let out='',pos=0;
  // Support $...$, $$...$$, \\(...\\), and \\[...\\] without interpreting HTML from Gemini.
  const delimiters=/(\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\])/g;
  let match;
  while((match=delimiters.exec(source))!==null){
    out+=esc(source.slice(pos,match.index));
    const formula=match[2]??match[3]??match[4]??match[5]??'';
    out+=mathHTML(formula,Boolean(match[2]!==undefined||match[5]!==undefined));
    pos=delimiters.lastIndex;
  }
  return out+esc(source.slice(pos));
}
function readableText(raw){
  let source=String(raw??'').replace(/\r\n?/g,'\n').trim();
  if(!source)return '<p>Not available.</p>';
  // Keep explicitly written steps and separate dense AI-generated explanations.
  source=source.replace(/\s+(?=(?:Step\s+\d+\s*[:.\-]|Given\s|Taking (?:natural )?logarithms\b|Substitut(?:ing|e)\b|Therefore\b|Hence\b|The maximum (?:fractional|percentage) error\b|Final answer\s*[:.]))/gi,'\n\n');
  const blocks=source.split(/\n\s*\n/).filter(Boolean);
  return blocks.map(block=>'<p>'+block.split('\n').map(line=>formattedInline(line)).join('<br>')+'</p>').join('');
}

function renderReport(r){
  prepareReport(r);
  $('reportTitle').textContent=r.testName;
  $('reportSubtitle').textContent=r.summary||'Review each answer and your personalized improvement plan.';
  const qs=r.questions||[],graded=qs.filter(q=>['correct','incorrect','partial'].includes(q.status)),correct=graded.filter(q=>q.status==='correct').length;
  $('accuracy').textContent=graded.length?Math.round(100*graded.reduce((sum,q)=>sum+(q.status==='correct'?1:q.status==='partial'?.5:0),0)/graded.length)+'%':'N/A';
  $('correct').textContent=correct+'/'+qs.length;
  $('incorrect').textContent=qs.filter(q=>q.status==='incorrect'||q.status==='partial'||q.status==='needs_review').length;
  $('questions').innerHTML=qs.map((q,i)=>`<div class="question"><div class="qtop"><strong>Q${esc(q.number??i+1)}. ${formattedInline(q.question)}</strong><span class="tag ${q.status==='correct'?'correct':q.status==='incorrect'?'incorrect':''}">${esc(q.status||'needs_review')}</span></div><p class="answer"><b>Topic:</b> ${esc(q.topic)}</p><p class="answer"><b>Your answer:</b> ${formattedInline(q.studentAnswer||'Not detected')}</p><div class="answer"><b>Feedback:</b> ${readableText(q.feedback||'')}</div><button class="secondary" data-solution="${i}">Show solution</button><div class="solution hidden" id="solution-${i}"><h3>Step-by-step solution</h3><div class="math-prose">${readableText(q.solution||'Unavailable')}</div><h4>Solution verification</h4><div class="math-prose">${readableText(q.solutionCheck||'Please independently verify this solution.')}</div></div></div>`).join('');
  document.querySelectorAll('[data-solution]').forEach(b=>b.onclick=()=>{const box=$('solution-'+b.dataset.solution);box.classList.toggle('hidden');b.textContent=box.classList.contains('hidden')?'Show solution':'Hide solution'});
  const topics=(r.topics||[]).sort((a,b)=>(a.accuracy??101)-(b.accuracy??101));
  $('weaknesses').innerHTML=topics.map(t=>`<div class="topic"><div class="qtop"><strong>${esc(t.name)}</strong><span class="tag">${t.accuracy===null?'Review needed':esc(t.accuracy)+'% accuracy'}</span></div><div class="bar"><div style="width:${Math.max(0,Math.min(100,Number(t.accuracy)||0))}%"></div></div><p>${esc(t.recommendation||'Practice related questions and review the worked solutions.')}</p><small>${esc(t.questionCount??'')} related question(s)</small></div>`).join('')||'<p class="sub">No questions were identified. Upload a clearer paper, including student answers, to generate topic insights.</p>';
}
async function save(){
  if(!current)return;
  setSaveStatus('Saving report…');
  try{
    const outcome=await persistReport(current);
    setSaveStatus(outcome.cloud?'Saved to History and Supabase.':'Saved locally. Cloud sync failed: '+outcome.reason);
  }catch(e){setSaveStatus('Unable to save: '+e.message);}
}
$('save').onclick=save;
$('export').onclick=()=>{if(!current)return;let blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='clarity-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};function renderHistory(){const list=reports().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));$('historyList').innerHTML=list.length?list.map((r,i)=>`<div class="historyrow"><div><strong>${esc(r.testName)}</strong><br><small>${esc(r.subject)} · ${new Date(r.createdAt).toLocaleDateString()}</small></div><button data-open="${i}">View report →</button></div>`).join(''):'<p class="sub">No saved reports yet. Analyze and save your first test.</p>';$('historyList').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{current=prepareReport(list[+b.dataset.open]);renderReport(current);setSaveStatus('Previously saved report.');setView('results')})}function renderInsights(){const list=reports(),agg={};list.forEach(r=>(prepareReport(r).topics||[]).forEach(t=>{if(t.accuracy===null||!Number.isFinite(Number(t.accuracy)))return;const name=t.name||'Other';(agg[name]??=[]).push(Number(t.accuracy))}));$('insightsContent').innerHTML=`<p class="sub">${list.length} saved test(s) · Topic performance across saved reports</p>`+(Object.entries(agg).map(([name,scores])=>{const avg=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);return `<div class="topic"><strong>${esc(name)}</strong><div class="bar"><div style="width:${avg}%"></div></div><p>${avg}% average accuracy · ${scores.length} test(s)</p></div>`}).join('')||'<p class="sub">Save analyses to unlock progress tracking.</p>')};$('workerUrl').value=localStorage.getItem('clarity-worker-url')||'';$('supabaseUrl').value=config().url;$('supabaseKey').value=config().key;$('saveSettings').onclick=()=>{const worker=$('workerUrl').value.trim().replace(/\/$/,'');if(worker&&!/^https:\/\/[a-z0-9.-]+(?:\/[^?#]*)?$/i.test(worker)){$('settingsNotice').textContent='Enter a valid HTTPS Cloudflare Worker URL';return;}localStorage.setItem('clarity-worker-url',worker);localStorage.setItem('sb-url',$('supabaseUrl').value.trim());localStorage.setItem('sb-key',$('supabaseKey').value.trim());$('settingsNotice').textContent='Saved';updateConnection()};function updateConnection(){$('connection').textContent=localStorage.getItem('clarity-worker-url')?'● Cloudflare AI configured':config().url?'● Backend configured':'● Local mode'}updateConnection();$('clearHistory').onclick=()=>{if(confirm('Delete all locally saved reports?')){localStorage.removeItem(storageKey);alert('Local history cleared. Cloud reports are unchanged.')}};async function auth(mode){try{const d=await request('/auth/v1/'+(mode==='signup'?'signup':'token?grant_type=password'),'POST',{email:$('email').value,password:$('password').value});if(d.access_token){saveSession(d);$('authNotice').textContent='Signed in';await syncReports()}else $('authNotice').textContent='Check your email to confirm your account.'}catch(e){$('authNotice').textContent=e.message}}$('signIn').onclick=()=>auth('signin');$('signUp').onclick=()=>auth('signup');$('signOut').onclick=()=>{saveSession(null)};async function syncReports(){try{const rows=await request('/rest/v1/reports?select=report&order=created_at.desc');let map=new Map(reports().map(r=>[r.id,r]));rows.forEach(row=>{if(row.report?.id)map.set(row.report.id,prepareReport(row.report))});localStorage.setItem(storageKey,JSON.stringify([...map.values()].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))))}catch(e){$('authNotice').textContent='Signed in; sync unavailable: '+e.message}}try{
  session=JSON.parse(localStorage.getItem(authStore)||sessionStorage.getItem('clarity-session')||'null');
  sessionStorage.removeItem('clarity-session');
  if(session?.access_token){
    saveSession(session);
    ensureSession().then(syncReports).catch(e=>{$('authNotice').textContent=e.message});
  }
}catch{saveSession(null)};
window.addEventListener('storage',e=>{if(e.key===authStore){try{session=JSON.parse(e.newValue||'null')}catch{session=null}}});

