const $=id=>document.getElementById(id);const storageKey='clarity-reports-v1';let selected=[],current=null,session=null;const authStore='clarity-auth-v2';let refreshInFlight=null;const config=()=>({url:localStorage.getItem('sb-url')||'https://gvxmvvthyztptlopovyj.supabase.co',key:localStorage.getItem('sb-key')||'sb_publishable_TvvU-RDND7rQk_nMHX0qCQ_m4neXMF6'});const reportKey=()=>storageKey+(session?.user?.id?'-'+session.user.id:'-guest');const reports=()=>{try{return JSON.parse(localStorage.getItem(reportKey())||'[]')}catch{return []}};const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const setView=id=>{document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.id!==id));document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===id));if(id==='history'){renderHistory();if(session?.access_token)syncReports().then(renderHistory).catch(()=>{});}if(id==='insights'){renderInsights();if(session?.access_token)syncReports().then(renderInsights).catch(()=>{});}window.scrollTo(0,0)};document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('back').onclick=()=>setView('upload');const drop=$('drop');drop.onclick=()=>{$('files').click()};drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag')};drop.ondragleave=()=>drop.classList.remove('drag');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');addFiles(e.dataTransfer.files)};$('files').onchange=e=>addFiles(e.target.files);// Large PDFs are processed locally, page-by-page, before Cloudflare uploads.
// A 50 MB scanned PDF can become a series of small JPEG page requests.
const MAX_PDF_BYTES=80*1024*1024;
const MAX_IMAGE_BYTES=60*1024*1024;
const MAX_TOTAL_PAGES=36;
const BATCH_PAGES=3;
const MAX_PAGE_BASE64=1_450_000;
function addFiles(files){
  for(const f of files){
    if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(f.type)){
      alert('Unsupported file: '+f.name);continue;
    }
    const limit=f.type==='application/pdf'?MAX_PDF_BYTES:MAX_IMAGE_BYTES;
    if(f.size>limit){alert('File is larger than the supported '+Math.round(limit/1048576)+' MB limit: '+f.name+'. Reduce the file size or split the PDF.');continue;}
    if(!selected.some(x=>x.name===f.name&&x.size===f.size))selected.push(f);
  }
  renderFiles();
}
function renderFiles(){
  $('filelist').innerHTML=selected.map((f,i)=>`<div class="fileitem"><span>${esc(f.name)} · ${(f.size/1048576).toFixed(1)} MB${f.type==='application/pdf'?' · pages compressed automatically':''}</span><button data-remove="${i}">Remove</button></div>`).join('');
  $('filelist').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{selected.splice(+b.dataset.remove,1);renderFiles()});
  $('analyze').disabled=!selected.length;
  $('notice').textContent=selected.length?`${selected.length} file(s) ready · PDFs are processed in batches (up to ${MAX_TOTAL_PAGES} pages total).`:'Upload a completed test to begin.';
}
function currentProgress(text){$('notice').textContent=text;}
async function imageToBase64(file){
  const img=await createImageBitmap(file);
  try{
    const maxDimension=1900;
    let factor=Math.min(1,maxDimension/Math.max(img.width,img.height));
    let canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*factor));
    canvas.height=Math.max(1,Math.round(img.height*factor));
    let ctx=canvas.getContext('2d',{alpha:false});
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let data=jpegForWorker(canvas);
    canvas.width=canvas.height=0;
    return {name:file.name,type:'image/jpeg',data};
  }finally{img.close?.();}
}
function jpegForWorker(canvas){
  // Base64 size limit is intentionally below the Worker's per-file/request limits.
  let data='';
  for(let i=0;i<6;i++){
    const quality=[.82,.73,.63,.54,.46,.38][i];
    data=canvas.toDataURL('image/jpeg',quality).split(',')[1];
    if(data.length<=MAX_PAGE_BASE64)return data;
    const w=Math.round(canvas.width*.82),h=Math.round(canvas.height*.82);
    if(w<400||h<400)break;
    const resized=document.createElement('canvas');resized.width=w;resized.height=h;
    resized.getContext('2d',{alpha:false}).drawImage(canvas,0,0,w,h);
    canvas.width=w;canvas.height=h;
    canvas.getContext('2d',{alpha:false}).drawImage(resized,0,0);
    resized.width=resized.height=0;
  }
  if(data.length>MAX_PAGE_BASE64)throw Error('One page is too complex to compress. Try exporting this page at a lower resolution.');
  return data;
}
async function preparePages(files){
  const prepared=[];
  for(const f of files){
    if(f.type!=='application/pdf'){
      if(prepared.length>=MAX_TOTAL_PAGES)throw Error(`Maximum ${MAX_TOTAL_PAGES} pages per analysis. Split your paper into smaller tests.`);
      currentProgress('Compressing image '+f.name+'…');
      prepared.push(await imageToBase64(f));
      continue;
    }
    if(!window.pdfjsLib)throw Error('PDF reader did not load. Refresh the page and check your internet connection.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    currentProgress('Opening PDF '+f.name+'…');
    let task,doc;
    try{
      task=window.pdfjsLib.getDocument({data:new Uint8Array(await f.arrayBuffer()),useSystemFonts:true});
      doc=await task.promise;
      if(doc.numPages+prepared.length>MAX_TOTAL_PAGES){
        throw Error(`This selection has ${doc.numPages+prepared.length} pages. Clarity supports up to ${MAX_TOTAL_PAGES} pages per analysis to control processing costs. Split the PDF into smaller tests.`);
      }
      for(let n=1;n<=doc.numPages;n++){
        currentProgress(`Preparing ${f.name}: page ${n} of ${doc.numPages}. Large PDFs are compressed on your device.`);
        const page=await doc.getPage(n);
        const base=page.getViewport({scale:1});
        const scale=Math.min(1.65,1900/Math.max(base.width,base.height));
        const viewport=page.getViewport({scale});
        const canvas=document.createElement('canvas');
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const ctx=canvas.getContext('2d',{alpha:false});
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
        await page.render({canvasContext:ctx,viewport,background:'rgb(255,255,255)'}).promise;
        const data=jpegForWorker(canvas);
        prepared.push({name:`${f.name} — page ${n}`,type:'image/jpeg',data});
        canvas.width=canvas.height=0;
        page.cleanup();
        // Yield to the UI; otherwise big PDFs make the page appear frozen.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }catch(e){throw Error(`Could not prepare PDF “${f.name}”: ${e.message||e}`);}
    finally{if(doc)await doc.destroy().catch(()=>{});}
  }
  return prepared;
}
function saveSession(value){
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
  catch(e){throw Error(e?.name==='AbortError'?'Analysis request exceeded 65 seconds. The backend did not respond in time.':(isAI?'Cannot reach the Cloudflare AI Worker. Check its URL and Cloudflare logs.':'Cannot reach Supabase. Check your connection and Supabase settings.'));}
  finally{clearTimeout(timeout);}
  if(response.status===401&&!isAuth&&repeat){await refreshSession();return request(path,method,body,false);}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===503)throw Error(isAI?'Cloudflare AI service returned 503. Check Cloudflare Worker logs.':'Supabase returned 503. Check service status.');
    throw Error(data.error||data.msg||data.message||`Request failed (${response.status})`);
  }
  return data;
}
const subjectAliases={
  mathematics:['math','maths','mathematics','algebra','calculus','geometry','statistics','jee maths'],
  physics:['physics','phys','jee physics'],
  chemistry:['chemistry','chem','jee chemistry'],
  biology:['biology','bio','life sciences'],
  english:['english','language','english language','literature'],
  economics:['economics','econ'],
  history:['history'],
  geography:['geography','geo'],
  computer_science:['computer science','computer','informatics','programming','cs'],
  business:['business','business studies','commerce','accountancy','accounting'],
};
function subjectKey(subject){
  const raw=String(subject||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ');
  if(!raw)return 'general';
  for(const [key,aliases] of Object.entries(subjectAliases))if(aliases.includes(raw))return key;
  return raw.replace(/\s+/g,'_');
}
const gradingFocus={
  mathematics:'Show algebraic derivation and verify the final result.',
  physics:'Check formulas, units, working, and significant figures.',
  chemistry:'Check reactions, stoichiometry, units and reasoning.',
  biology:'Check scientific concepts, terminology and explanations.',
  english:'Check grammar, interpretation, evidence and writing quality.',
  economics:'Check definitions, graphs, calculations and evaluation.',
  history:'Check factual accuracy, chronology and source-based reasoning.',
  geography:'Check case studies, maps, data and geographic reasoning.',
  computer_science:'Check algorithms, code logic and computational reasoning.',
  business:'Check case evidence, calculations and business reasoning.'
};
function subjectLabel(key){
  return ({mathematics:'Mathematics',physics:'Physics',chemistry:'Chemistry',biology:'Biology',english:'English',computer_science:'Computer Science',economics:'Economics',history:'History',geography:'Geography',business:'Business Studies',general:'General'})[key]||key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
const subjectTopicRules={
  mathematics:[
    ['Sequences, series & binomial theorem',/binomial|coefficient|expansion|series|sequence|summation|\bsum_?\b|\ba_\d|\bk\b.{0,20}coefficient/i],
    ['Calculus',/derivat|differentiat|integrat|limit|tangent|stationary|slope|\bdx\b/i],
    ['Probability & statistics',/probabil|permutation|combination|variance|standard deviation|median|distribution/i],
    ['Trigonometry',/trigon|sin\b|cos\b|tan\b|radian/i],
    ['Vectors & matrices',/matrix|matrices|determinant|vector|eigen/i],
    ['Coordinate geometry',/coordinate|circle|parabola|ellipse|hyperbola|distance formula/i],
    ['Algebra & equations',/algebra|equation|quadratic|polynomial|factor|root|simplif|\bx\s*[+=-]/i],
    ['Geometry',/triangle|polygon|angle|radius|perimeter|area/i]
  ],
  physics:[
    ['Measurement & uncertainty',/uncertainty|percentage error|fractional error|propagation|significant figure|least count/i],
    ['Heat & thermodynamics',/calorim|heat capacity|temperature|thermal|latent heat|entropy/i],
    ['Mechanics',/motion|force|acceleration|velocity|projectile|momentum|friction|newton|kinematic/i],
    ['Electricity & magnetism',/current|resistance|voltage|circuit|capacitor|magnetic|electric field/i],
    ['Waves & optics',/wave|refraction|reflection|diffraction|lens|frequency|wavelength/i],
    ['Modern physics',/quantum|nuclear|photoelectric|electron|photon/i]
  ],
  chemistry:[
    ['Stoichiometry & mole calculations',/mole|molar|stoichiometr|limiting reagent|avogadro/i],
    ['Chemical equilibrium',/equilibrium|le chatelier|\bkc\b|\bkp\b/i],
    ['Acids, bases & pH',/acid|base|titration|ph\b|buffer/i],
    ['Organic chemistry',/organic|alkane|alkene|benzene|alcohol|ester|isomer/i],
    ['Redox & electrochemistry',/redox|oxidation|reduction|electrochem|cell potential/i],
    ['Chemical bonding',/bond|hybrid|electron configuration|orbital|periodic/i]
  ],
  biology:[
    ['Cell biology',/cell|organelle|membrane|mitosis|meiosis/i],
    ['Genetics',/gene|genetic|dna|rna|inherit|allele/i],
    ['Human physiology',/digest|respirat|circulat|hormone|kidney/i],
    ['Ecology',/ecosystem|population|food chain|habitat|biodiversity/i],
    ['Plant biology',/photosynth|transpir|chlorophyll|stomata/i]
  ],
  english:[
    ['Reading comprehension',/passage|comprehension|infer|according to|main idea|theme|author/i],
    ['Grammar & usage',/grammar|verb|tense|subject.verb|article|preposition|punctuat|sentence/i],
    ['Vocabulary',/synonym|antonym|vocab|meaning|spell|word choice/i],
    ['Writing & structure',/essay|paragraph|letter|composition|argument|writing|summar/i],
    ['Literary analysis',/poem|metaphor|simile|imagery|character|narrat|literary/i]
  ],
  economics:[['Microeconomics',/demand|supply|elasticity|consumer|monopoly|marginal/i],['Macroeconomics',/gdp|inflation|unemployment|fiscal|monetary|interest rate/i]],
  computer_science:[['Programming & algorithms',/code|algorithm|loop|function|array|complexity|variable/i],['Databases & systems',/database|sql|network|memory|operating system/i]],
  history:[['Historical interpretation & evidence',/histor|source|cause|consequence|revolution|empire|treaty/i]],
  geography:[['Physical geography',/climate|weather|river|mountain|earthquake|plate/i],['Human geography',/population|urban|migration|development|settlement/i]],
  business:[['Finance & accounting',/profit|cash flow|balance sheet|revenue|asset|ratio/i],['Marketing & strategy',/market|brand|promotion|strategy|consumer/i]]
};
function inferTopic(q,subject){
  // Prefer Gemini's specific topic when provided; ignore broad placeholders.
  if(typeof q.topic==='string'&&q.topic.trim()&&!/^(general|other|miscellaneous|core concepts|unknown)$/i.test(q.topic.trim()))return q.topic.trim();
  const key=subjectKey(subject), words=[q.question,q.feedback,q.solution].filter(Boolean).join(' ');
  for(const [name,pattern] of subjectTopicRules[key]||[])if(pattern.test(words))return name;
  return subjectLabel(key)+' — Other concepts';
}
function prepareReport(r){
  r.subjectKey=subjectKey(r.subject);
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
    const example=missed.slice(0,3).map(q=>'Q'+String(q.number||'?')).join(', ');
    const advice=missed.length?`Priority: review ${name}. Rework ${example} without looking at the solution, identify the mistake in each, then solve 5 similar problems and check your answers.`:uncertain.length?`Review ${uncertain.length} question(s) that could not be graded reliably. Confirm the written answers or provide an answer key.`:`Keep practicing ${name.toLowerCase()} to retain accuracy.`;
    return {name,accuracy:score,recommendation:old?.recommendation||advice,questionCount:items.length,needsReview:uncertain.length};
  });
  r.topics=generated.length?generated:(Array.isArray(r.topics)?r.topics:[]);
  r.analysisCoverage={found:qs.length,graded:qs.filter(q=>q.status!=='needs_review').length,review:qs.filter(q=>q.status==='needs_review').length};
  return r;
}
function writeLocalReport(r){
  const list=reports();
  const index=list.findIndex(x=>x.id===r.id);
  if(index>=0)list[index]=r;else list.unshift(r);
  localStorage.setItem(reportKey(),JSON.stringify(list));
  return list;
}
async function persistReport(r){
  r=prepareReport(r);
  r.cloudSync='pending';
  writeLocalReport(r);
  if(!session?.access_token)return {cloud:false,reason:'Please sign in to sync reports.'};
  if(r.ownerId&&r.ownerId!==session.user?.id)return {cloud:false,reason:'This report belongs to another account.'};
  r.ownerId=session.user.id;
  try{
    await request('/rest/v1/reports?on_conflict=id','POST',{
      id:r.id,user_id:session.user.id,report:{...r,cloudSync:'saved'},created_at:r.createdAt
    });
    // Confirm a round trip to the database rather than claiming cloud save on POST alone.
    const results=await request('/rest/v1/reports?id=eq.'+encodeURIComponent(r.id)+'&select=id');
    if(!Array.isArray(results)||!results.some(x=>x.id===r.id))throw Error('Cloud write could not be verified.');
    r.cloudSync='saved';writeLocalReport(r);
    return {cloud:true};
  }catch(e){r.cloudSync='pending';writeLocalReport(r);return {cloud:false,reason:e.message};}
}
async function retryPendingSync(){
  if(!session?.access_token)return {saved:0,pending:0};
  let saved=0,pending=0;
  for(const r of reports().filter(x=>x.cloudSync!=='saved')){
    const result=await persistReport(r);
    if(result.cloud)saved++;else pending++;
  }
  return {saved,pending};
}
function setSaveStatus(msg){const el=$('saveStatus');if(el)el.textContent=msg;}
async function analyze(){
  if(!session?.access_token){$('notice').textContent='Sign in under Settings → Account before analyzing a paper.';setView('settings');return;}
  if(!$('subject').value.trim()){$('notice').textContent='Choose the subject before analyzing so the paper is graded correctly.';$('subject').focus();return;}
  const btn=$('analyze');btn.disabled=true;btn.textContent='Preparing paper…';
  let partial=null,finishedBatches=0;
  try{
    const pages=await preparePages(selected);
    if(!pages.length)throw Error('No readable pages were found.');
    const totalBatches=Math.ceil(pages.length/BATCH_PAGES);
    const baseName=$('testName').value||'Untitled test', subject=subjectLabel(subjectKey($('subject').value));
    partial={id:crypto.randomUUID(),createdAt:new Date().toISOString(),testName:baseName,subject,questions:[],topics:[],summary:'Processing paper in page batches.',analysisStatus:'in_progress',totalPages:pages.length,processedPages:0};
    for(let start=0;start<pages.length;start+=BATCH_PAGES){
      const group=pages.slice(start,start+BATCH_PAGES);
      const index=Math.floor(start/BATCH_PAGES)+1;
      btn.textContent=`Analyzing ${index}/${totalBatches}…`;
      currentProgress(`Analyzing pages ${start+1}–${start+group.length} of ${pages.length} · batch ${index}/${totalBatches}. Keep this tab open.`);
      // A separate Gemini request is made for each small batch to avoid request limits.
      const response=await request('/functions/v1/analyze-paper','POST',{
        files:group,
        testName:baseName+` · pages ${start+1}–${start+group.length} of ${pages.length}`,
        subject: `${subject}. ${gradingFocus[subjectKey(subject)]||'Grade according to this subject and show clear worked explanations.'}`
      });
      if(!response.report||!Array.isArray(response.report.questions))throw Error(`AI returned an invalid report for batch ${index}.`);
      for(const q of response.report.questions){
        q.sourcePages=`${start+1}–${start+group.length}`;
        // Repeated question numbers across batches must remain distinguishable.
        q.number=q.number?String(q.number):String(partial.questions.length+1);
        partial.questions.push(q);
      }
      const summary=response.report.summary;
      if(summary)partial.summary=(partial.summary==='Processing paper in page batches.'?'':partial.summary+' ') +summary;
      partial.processedPages=start+group.length;
      finishedBatches++;
      // Save after each batch too, so incomplete processing doesn't discard graded pages.
      prepareReport(partial);
      try{await persistReport(partial);}catch(e){console.warn('Interim report could not sync:',e);}
    }
    partial.analysisStatus='complete';
    partial.summary=partial.summary.trim()||'Review your marked answers and the suggested improvement areas.';
    current=prepareReport(partial);
    const saved=await persistReport(current).catch(e=>({cloud:false,reason:e.message}));
    renderReport(current);setView('results');
    setSaveStatus(saved.cloud?'All analyzed pages saved to History and Supabase.':'Saved in this browser; cloud sync pending: '+(saved.reason||'Unknown error'));
    $('notice').textContent='Analysis complete. Open History to revisit your paper.';
  }catch(e){
    if(partial&&finishedBatches>0){
      partial.analysisStatus='partial';
      partial.summary=`Partial analysis (${partial.processedPages} of ${partial.totalPages} pages). ${partial.summary}`;
      current=prepareReport(partial);
      let saveResult=await persistReport(current).catch(err=>({cloud:false,reason:err.message}));
      renderReport(current);setView('results');
      setSaveStatus(`Some pages could not be analyzed: ${e.message}. The first ${partial.processedPages} pages were saved ${saveResult.cloud?'to the cloud':'locally'}. Retry the remaining pages separately.`);
    }else{$('notice').textContent=e.message||String(e);}
  }finally{btn.textContent='Analyze paper →';btn.disabled=!selected.length;}
}
$('analyze').onclick=analyze;

// Clarity v4: prose-aware mathematics renderer.
// Never render student/AI-provided strings as HTML; escape prose, KaTeX trust:false.
function mathFallback(value) {
  let s=String(value??'');
  for(let run=0;run<8;run++){
    const next=s.replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g,'($1) / ($2)');
    if(next===s)break;
    s=next;
  }
  return s.replace(/\\(?:Delta|delta)\b/g,'Δ').replace(/\\sum\b/g,'Σ')
    .replace(/\\times\b/g,'×').replace(/\\cdot\b/g,'·')
    .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g,'$1')
    .replace(/\\%/g,'%').replace(/\\([A-Za-z]+)/g,'$1')
    .replace(/\^\{([^{}]*)\}/g,'^$1').replace(/_\{([^{}]*)\}/g,'_$1');
}
function normalizeMathInput(input) {
  return String(input??'').trim()
    .replace(/^\$+|\$+$/g,'')
    .replace(/(^|[^\\\w])sum_\{/g,'$1\\sum_{')
    .replace(/(^|[^\\\w])(?:frac|dfrac|tfrac)\{/g,'$1\\frac{')
    .replace(/(^|[^\\\w])sqrt\{/g,'$1\\sqrt{')
    .replace(/\bDelta\b(?![^$]*[a-z])/g,'\\Delta')
    .replace(/×/g,'\\times ').replace(/≤/g,'\\le ').replace(/≥/g,'\\ge ')
    .replace(/\b(?:sum|frac|sqrt)_(?!\{)/g,m=>m);
}
function mathHTML(formula, display=false) {
  const raw=normalizeMathInput(formula);
  try{
    if(window.katex?.renderToString){
      return window.katex.renderToString(raw,{displayMode:display,throwOnError:true,trust:false,strict:'ignore',output:'html'});
    }
  }catch(err){console.warn('Formula could not be typeset:',raw.slice(0,90),err.message);}
  return `<span class="math-fallback">${esc(mathFallback(raw))}</span>`;
}
// Match a *single* mathematical atom, never arbitrary English paragraphs.
const mathAtom = String.raw`(?:\\(?:frac|dfrac|tfrac)\{[^{}]+\}\{[^{}]+\}|\\sqrt\{[^{}]+\}|(?:\\sum|sum)_\{[^{}]+\}\^\{[^{}]+\}(?:\s+[a-zA-Z]_?[a-zA-Z\d]+)?(?:\s+[a-zA-Z]\^[a-zA-Z\d]+)?|\([^()\n]{1,110}\)(?:\^\{?\d+\}?)?|\d*[a-zA-Z](?:_\{?[A-Za-z\d]+\}?)?(?:\^\{?[\dA-Za-z]+\}?)?|\d+(?:\.\d+)?)`;
const mathCandidate = new RegExp(String.raw`(?:\\(?:frac|dfrac|tfrac|sqrt)\{[^\n]*|(?:\\sum|sum)_\{[^{}]+\}\^\{[^{}]+\}(?:\s*[a-zA-Z]_?\{?[a-zA-Z\d]+\}?)?(?:\s*x\^\{?[a-zA-Z\d]+\}?)?|\([^()\n]{1,110}\)(?:\^\{?\d+\}?)?(?:\s*[=+\-*/]\s*${mathAtom})*|[a-zA-Z]_\{?[a-zA-Z\d]+\}?(?:\s*[=+\-*/]\s*${mathAtom})+|[a-zA-Z]\^\{?[a-zA-Z\d]+\}?|(?:\d+\s*[=+*/]\s*)+[a-zA-Z\d])`,'g');
function mathScore(expr){
  return /(?:\\(?:sum|frac|sqrt)|\bsum_\{|\^|_|=|[+*/])/g.test(expr);
}
function wrapMath(expr){return `<span class="math-inline-wrap">${mathHTML(expr)}</span>`;}
function renderLooseMath(source){
  const raw=String(source??'');
  let result='',last=0,m;
  mathCandidate.lastIndex=0;
  while((m=mathCandidate.exec(raw))){
    const candidate=m[0];
    if(!mathScore(candidate))continue;
    result+=esc(raw.slice(last,m.index));
    result+=wrapMath(candidate);
    last=m.index+candidate.length;
  }
  result+=esc(raw.slice(last));
  return result;
}
function formattedInline(input){
  const raw=String(input??'');
  const delimiters=/(\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\])/g;
  let html='',last=0,match;
  while((match=delimiters.exec(raw))){
    html+=renderLooseMath(raw.slice(last,match.index));
    html+=mathHTML(match[2]??match[3]??match[4]??match[5],match[2]!==undefined||match[5]!==undefined);
    last=delimiters.lastIndex;
  }
  return html+renderLooseMath(raw.slice(last));
}
function readableText(raw){
  let source=String(raw??'').replace(/\r\n?/g,'\n').trim();
  if(!source)return '<p>Not available.</p>';
  source=source.replace(/\s+(?=(?:Step\s+\d+\s*[:.\-]|Given\b|Multiplying\b|Differentiating\b|Equating\b|Substituting\b|Therefore\b|Hence\b|Final answer\s*[:.]))/gi,'\n\n');
  source=source.replace(/([.!?])\s+(?=[A-Z][a-z]{2,}\b)/g,'$1\n');
  return source.split(/\n\s*\n|\n/g).map(t=>t.trim()).filter(Boolean).map(t=>{
    const isHeader=/^(Step\s+\d+\s*[:.\-]|Final answer\s*[:.])/i.test(t);
    return isHeader?`<h4 class="solution-step">${formattedInline(t)}</h4>`:`<p>${formattedInline(t)}</p>`;
  }).join('');
}
function renderReport(r){
  prepareReport(r);
  $('reportTitle').textContent=r.testName;
  $('reportSubtitle').textContent=(r.summary||'Review each answer and your personalized improvement plan.')+' · '+r.analysisCoverage.graded+' of '+r.analysisCoverage.found+' questions graded'+(r.analysisCoverage.review?' · '+r.analysisCoverage.review+' need manual review':'');
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
$('export').onclick=()=>{if(!current)return;let blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='clarity-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};function renderHistory(){
  const list=reports().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const filter=$('historySubject');
  const subjects=[...new Set(list.map(r=>subjectKey(r.subject)))].sort();
  if(filter){const previous=filter.value;filter.innerHTML='<option value="all">All subjects</option>'+subjects.map(k=>`<option value="${esc(k)}">${esc(subjectLabel(k))}</option>`).join('');filter.value=subjects.includes(previous)?previous:'all';}
  const view=list.filter(r=>!filter||filter.value==='all'||subjectKey(r.subject)===filter.value);
  $('historyList').innerHTML=view.length?view.map(r=>`<div class="historyrow"><div><strong>${esc(r.testName)}</strong><br><small>${esc(subjectLabel(subjectKey(r.subject)))} · ${new Date(r.createdAt).toLocaleDateString()} · ${r.analysisStatus==='partial'?'PARTIAL ANALYSIS · ':''}${r.cloudSync==='saved'?'Cloud saved':'Local only · sync pending'}</small></div><button data-open="${esc(r.id)}">View report →</button></div>`).join(''):'<p class="sub">No reports for this subject yet.</p>';
  $('historyList').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{current=prepareReport(list.find(r=>r.id===b.dataset.open));renderReport(current);setSaveStatus(current.cloudSync==='saved'?'Saved to Supabase · available on other devices.':'Local copy · cloud sync pending. Click Save report again to retry.');setView('results');});
}
function renderInsights(){
  const list=reports();
  const subjects=[...new Set(list.map(r=>subjectKey(r.subject)))].sort();
  const filter=$('insightsSubject');
  if(filter){const previous=filter.value;filter.innerHTML='<option value="all">All subjects (overview)</option>'+subjects.map(k=>`<option value="${esc(k)}">${esc(subjectLabel(k))}</option>`).join('');filter.value=subjects.includes(previous)?previous:'all';}
  const selected=filter?.value||'all';
  const filtered=selected==='all'?list:list.filter(r=>subjectKey(r.subject)===selected);
  const bySubject={};
  for(const r of filtered){
    const key=subjectKey(r.subject),bucket=bySubject[key]??={reports:0,topics:{}};
    bucket.reports++;
    for(const t of (prepareReport(r).topics||[])){
      if(t.accuracy===null||!Number.isFinite(Number(t.accuracy)))continue;
      // Include subject in grouping so "Algebra" from one course never merges with another.
      (bucket.topics[t.name||'Other']??=[]).push({accuracy:Number(t.accuracy),weight:Math.max(1,Number(t.questionCount)||1)});
    }
  }
  const body=Object.entries(bySubject).sort(([a],[b])=>a.localeCompare(b)).map(([key,group])=>{
    const cards=Object.entries(group.topics).map(([name,values])=>{
      const weight=values.reduce((n,v)=>n+v.weight,0);
      const avg=Math.round(values.reduce((n,v)=>n+v.accuracy*v.weight,0)/weight);
      return {name,avg,weight};
    }).sort((a,b)=>a.avg-b.avg);
    return `<section class="subject-group"><h2>${esc(subjectLabel(key))}</h2><p class="sub">${group.reports} saved test(s) · Weakest topics shown first</p>`+(cards.map(t=>`<div class="topic"><div class="qtop"><strong>${esc(t.name)}</strong><span class="tag">${t.avg}%</span></div><div class="bar"><div style="width:${t.avg}%"></div></div><p>${t.avg<60?'High priority: review incorrect questions and practise 5 similar problems.':t.avg<80?'Review partially correct answers and practise targeted questions.':'Maintain with occasional revision.'}</p><small>Based on approximately ${t.weight} graded question(s)</small></div>`).join('')||'<p class="sub">No reliably graded topics yet. Upload a completed paper with readable answers.</p>')+'</section>';
  }).join('');
  $('insightsContent').innerHTML=`<p class="sub">${filtered.length} saved test(s) · ${selected==='all'?'Results separated by subject':esc(subjectLabel(selected))}</p>`+(body||'<p class="sub">No reports for this subject yet.</p>');
}
if($('historySubject'))$('historySubject').onchange=renderHistory;
if($('insightsSubject'))$('insightsSubject').onchange=renderInsights;
$('workerUrl').value=localStorage.getItem('clarity-worker-url')||'';$('supabaseUrl').value=config().url;$('supabaseKey').value=config().key;$('saveSettings').onclick=()=>{const worker=$('workerUrl').value.trim().replace(/\/$/,'');if(worker&&!/^https:\/\/[a-z0-9.-]+(?:\/[^?#]*)?$/i.test(worker)){$('settingsNotice').textContent='Enter a valid HTTPS Cloudflare Worker URL';return;}localStorage.setItem('clarity-worker-url',worker);localStorage.setItem('sb-url',$('supabaseUrl').value.trim());localStorage.setItem('sb-key',$('supabaseKey').value.trim());$('settingsNotice').textContent='Saved';updateConnection()};function updateConnection(){$('connection').textContent=localStorage.getItem('clarity-worker-url')?'● Cloudflare AI configured':config().url?'● Backend configured':'● Local mode'}updateConnection();$('clearHistory').onclick=()=>{if(confirm('Delete all locally saved reports?')){localStorage.removeItem(reportKey());alert('This account’s local history cleared. Cloud reports are unchanged.')}};async function auth(mode){try{const d=await request('/auth/v1/'+(mode==='signup'?'signup':'token?grant_type=password'),'POST',{email:$('email').value,password:$('password').value});if(d.access_token){saveSession(d);$('authNotice').textContent='Signed in';await syncReports()}else $('authNotice').textContent='Check your email to confirm your account.'}catch(e){$('authNotice').textContent=e.message}}$('signIn').onclick=()=>auth('signin');$('signUp').onclick=()=>auth('signup');$('signOut').onclick=()=>{saveSession(null)};async function syncReports(){try{await retryPendingSync();const rows=await request('/rest/v1/reports?select=report&order=created_at.desc');let map=new Map(reports().map(r=>[r.id,r]));rows.forEach(row=>{if(row.report?.id)map.set(row.report.id,prepareReport(row.report))});localStorage.setItem(reportKey(),JSON.stringify([...map.values()].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))))}catch(e){$('authNotice').textContent='Signed in; cloud sync unavailable: '+e.message}}try{
  session=JSON.parse(localStorage.getItem(authStore)||sessionStorage.getItem('clarity-session')||'null');
  sessionStorage.removeItem('clarity-session');
  if(session?.access_token){
    saveSession(session);
    ensureSession().then(syncReports).catch(e=>{$('authNotice').textContent=e.message});
  }
}catch{saveSession(null)};
window.addEventListener('storage',e=>{if(e.key===authStore){try{session=JSON.parse(e.newValue||'null')}catch{session=null}}});


// Self-service rescue for locally saved history from versions before account scoping.
const recoveryButton=$('recoverHistory');
if(recoveryButton)recoveryButton.onclick=async()=>{
  if(!session?.user?.id){$('settingsNotice').textContent='Sign in before recovering older reports.';return;}
  let legacy=[];try{legacy=JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{}
  if(!Array.isArray(legacy)||!legacy.length){$('settingsNotice').textContent='No older browser-only reports were found.';return;}
  if(!confirm('Import '+legacy.length+' older browser reports into the currently signed-in account? Only do this if they belong to this student.'))return;
  for(const old of legacy){if(!old?.id)continue;const r=prepareReport({...old,ownerId:session.user.id,cloudSync:'pending'});writeLocalReport(r);}
  const result=await retryPendingSync();
  $('settingsNotice').textContent='Recovered '+legacy.length+' reports. Cloud synced: '+result.saved+'; pending: '+result.pending+'.';
};
const syncButton=$('syncNow');
if(syncButton)syncButton.onclick=async()=>{
  $('settingsNotice').textContent='Synchronizing report history…';
  try{const r=await retryPendingSync();await syncReports();$('settingsNotice').textContent='Cloud synced '+r.saved+' report(s); '+r.pending+' pending.';}
  catch(e){$('settingsNotice').textContent='Cloud sync failed: '+e.message;}
};
