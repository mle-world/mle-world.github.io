// Excerpts retain original text and source line numbers. Full records stay available.
const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
export function reportLines(report){return report.replace(/\n$/,'').split('\n');}

export function reportExcerpt(report, example, kind, {keyOnly=false}={}){
  const lines=reportLines(report);
  const useful=lines.map((text,index)=>({text,index})).filter(row=>row.text.trim()&&!/^[\s^~]+$/.test(row.text));
  const progress=useful.filter(row=>/^\s*(Epoch\s+\d+|\[\d+\]|\d+:)/i.test(row.text));
  const summary=useful.filter(row=>/(validation|hold.out|final|best)/i.test(row.text)&&/(auc|rmse|score|loss|metric)/i.test(row.text)).at(-1);
  const picks=new Set();
  const add=row=>{if(row)picks.add(row.index);};
  const exception=kind==='prediction'?example.predictedException:example.actualException;
  if(keyOnly){
    const failure=exception!=='None'?useful.filter(row=>row.text.includes(`${exception}:`)).at(-1):null;
    if(failure)add(failure);
    else{
      add(summary);
      add(useful.filter(row=>/submission (saved|written)/i.test(row.text)).at(-1));
      if(!picks.size)add(useful.at(-1));
    }
  }else if(example.excerptLines?.[kind]){
    for(const number of example.excerptLines[kind])picks.add(number-1);
  }else{
    add(useful[0]);
    if(progress.length){add(progress[0]);add(progress[Math.floor(progress.length/2)]);add(progress.at(-1));}
    else {add(useful[1]);add(useful[Math.floor(useful.length/2)]);}
    add(summary);add(useful.at(-2));add(useful.at(-1));
  }
  const list=make('ol','report-excerpt');list.dataset.report=kind;
  let previous=-1;
  for(const index of [...picks].sort((a,b)=>a-b)){
    const omitted=index-previous-1;
    if(!keyOnly&&omitted){const gap=make('li','excerpt-omission',`⋯ ${omitted} ${omitted===1?'line':'lines'} omitted`);gap.dataset.omitted=omitted;list.append(gap);}
    const row=make('li','excerpt-line');row.dataset.line=index+1;
    if(index===summary?.index || (exception!=='None'&&lines[index].includes(exception))){row.classList.add(example.terminalAgreement===1?'excerpt-match':'excerpt-miss');}
    const number=make('span','excerpt-line-number',index+1);number.setAttribute('aria-label',`Line ${index+1}`);
    row.append(number,make('code','',lines[index]));list.append(row);previous=index;
  }
  if(!keyOnly&&previous<lines.length-1){const gap=make('li','excerpt-omission',`⋯ ${lines.length-previous-1} lines omitted`);gap.dataset.omitted=lines.length-previous-1;list.append(gap);}
  return list;
}

export function excerptPanel(report,example,kind,options={}){
  const panel=make('section',`excerpt-panel excerpt-${kind}`);
  const heading=make('div','excerpt-heading');
  heading.append(make('h4','',kind==='prediction'?'World-model prediction':'Actual execution'),make('span','',options.keyOnly?'Key outcome lines':`${reportLines(report).length} lines total`));
  panel.append(heading,reportExcerpt(report,example,kind,options));return panel;
}

export function comparisonCard(example,detail,level,task){
  const correct=example.terminalAgreement===1;
  const card=make('article',`contrast-card contrast-${level}`);card.dataset.caseId=example.id;
  const header=make('div','contrast-card-heading');
  const labels=make('div','contrast-labels');
  const confidence=make('span','confidence-pill',`Q${example.bin} · raw confidence ${example.confidence.toFixed(6)}`);
  confidence.title=`Raw confidence: ${example.confidence}`;
  labels.append(confidence,make('span','contrast-verdict',correct?'Prediction matches':'Prediction misses'));
  header.append(labels,make('h3','',example.title),make('p','contrast-task',task));
  const outcomes=make('dl','contrast-outcomes');
  for(const [label,exception,metric] of [['Predicted',example.predictedException,example.predictedMetric],['Observed',example.actualException,example.actualMetric]]){
    const outcome=metric==null?(exception==='None'?'No validation score':`${exception} · no validation score`):`Validation score: ${metric}`;
    const row=make('div','');row.append(make('dt','',label),make('dd','',outcome));outcomes.append(row);
  }
  card.append(header,outcomes,make('p','contrast-caption',example.caption));
  const reports=make('div','contrast-reports');
  for(const kind of ['prediction','actual'])reports.append(excerptPanel(detail[kind],example,kind,{keyOnly:true}));
  card.append(reports);
  const full=make('details','contrast-full full-records');
  const predictionLines=reportLines(detail.prediction).length,actualLines=reportLines(detail.actual).length;
  full.append(make('summary','',predictionLines===actualLines?`View all ${predictionLines} lines in each output`:`View all ${predictionLines} predicted / ${actualLines} actual lines`));
  for(const kind of ['prediction','actual']){
    const pre=make('pre','',detail[kind]);pre.tabIndex=0;pre.dataset.fullReport=kind;pre.setAttribute('aria-label',`${level} confidence ${kind==='prediction'?'predicted':'actual'} complete terminal output`);
    full.append(make('h4','',kind==='prediction'?'World-model prediction':'Actual execution'),pre);
  }
  const metadata=make('details','contrast-metadata');metadata.append(make('summary','',`Recorded confidence & judge votes`),make('p','',`Raw confidence ${example.confidence} · ${example.votes.filter(Boolean).length}/3 terminal judges agree · ${example.id}`));
  card.append(full,metadata);return card;
}
