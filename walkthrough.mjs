// Animated feedback loop from Figure 1(b); Figure 2 is shown directly from the paper.
import {renderLoopScene, illustrativeConfidence} from './animation-scenes.mjs';
const $ = id => document.getElementById(id);
let scenario='high', loopMode='auto';
const loopLabels=['Sample codes','Predict','Reports','Select / combine','Gate','Feedback','Verify final'];
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
function caption(prefix, step, labels, title, description) {
  $(`${prefix}-progress`).textContent=`STEP ${step+1} / ${labels.length}`;
  $(`${prefix}-step-title`).textContent=title;
  $(`${prefix}-step-description`).textContent=description;
}
function createPlayer(prefix, labels, render, onCycle=()=>{}, timing={step:1800,final:2600}) {
  const state={step:0,playing:false,timer:null,wanted:!reducedMotion.matches,visible:false,cycles:0};
  const root=$(`${prefix}-animation`);
  function update() {
    const names=labels();
    root.dataset.step=state.step; root.dataset.playing=state.playing; root.dataset.cycles=state.cycles;
    root.dataset.playback=state.wanted?'automatic':'paused';
    $(`${prefix}-play`).textContent=state.wanted?'Pause':state.step===names.length-1?'Replay':'Play';
    $(`${prefix}-play`).setAttribute('aria-label',`${state.wanted?'Pause':'Play'} ${prefix==='loop'?'main loop':'policy'} animation`);
    root.querySelector('.step-caption').setAttribute('aria-live',state.wanted?'off':'polite');
    $(`${prefix}-next`).disabled=state.step===names.length-1;
    // Retain the step buttons during playback so keyboard focus stays put.
    const steps=$(`${prefix}-steps`);
    if (steps.dataset.labels!==names.join('|')) {
      steps.replaceChildren(...names.map((name,i)=>{
        const button=document.createElement('button');button.type='button';button.textContent=`${i+1}. ${name}`;
        button.dataset.animationStep=i;button.addEventListener('click',()=>go(i));return button;
      }));steps.dataset.labels=names.join('|');
    }
    [...steps.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===state.step)));
    render(state.step);
  }
  function stop(){clearTimeout(state.timer);state.timer=null;state.playing=false;}
  function pause(){state.wanted=false;stop();update();}
  function go(step){state.wanted=false;stop();state.step=Math.max(0,Math.min(labels().length-1,step));update();}
  function tick(){
    if(state.timer!==null||!state.playing)return;
    state.timer=setTimeout(()=>{
      state.timer=null;
      if(!state.playing)return;
      if(state.step===labels().length-1){onCycle();state.step=0;state.cycles++;}
      else state.step++;
      update();tick();
    },state.step===labels().length-1?timing.final:timing.step);
  }
  function sync(){
    const shouldPlay=state.wanted&&state.visible&&!document.hidden;
    if(!shouldPlay)stop();else {state.playing=true;tick();}
    update();
  }
  function restart(){stop();state.step=0;state.cycles=0;state.wanted=!reducedMotion.matches;sync();}
  $(`${prefix}-play`).addEventListener('click',()=>{
    if(state.wanted)pause();else {state.wanted=true;sync();}
  });
  $(`${prefix}-next`).addEventListener('click',()=>go(state.step+1));
  $(`${prefix}-reset`).addEventListener('click',restart);
  document.addEventListener('visibilitychange',sync);
  reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)pause();});
  new IntersectionObserver(entries=>{state.visible=entries[0].isIntersecting;sync();},{threshold:0}).observe(root);
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',sync);
  return {state,go,update,pause,restart};
}

function renderLoop(step) {
  const run = scenario === 'low';
  const confidence = illustrativeConfidence[scenario].toFixed(2);
  const threshold = illustrativeConfidence.threshold.toFixed(2);
  $('loop-animation').dataset.scenario = scenario;
  $('loop-animation').dataset.route = run ? 'run' : 'skip';
  const descriptions = [
    ['Sample N candidate programs', 'The MLE agent proposes multiple programs. Code 1, Code 2, and Code N are separate candidates for the same research step.'],
    ['Predict every candidate’s execution', 'MLE-World reads each candidate’s code and execution context. One 4B inference per candidate predicts its execution without a training run.'],
    ['One predicted report per candidate', 'Code 1 maps to Output 1, Code 2 to Output 2, and Code N to Output N. Each report contains logs, errors, a score, and confidence.'],
    ['Return one program and its confidence', `The policy selects or combines one program. Its MLE-World report supplies confidence p_max = ${confidence} in this illustration. Selected code keeps its prediction; newly combined code receives a new prediction.`],
    run ? ['Low confidence: run real code', `The illustrative confidence ${confidence} is below the ${threshold} threshold. Run the returned program for real training and evaluation, then use its observed execution report.`] : ['High confidence: skip execution', `The illustrative confidence ${confidence} meets the ${threshold} threshold. Use the predicted execution report as feedback and skip this real run.`],
    ['Return feedback to the MLE agent', run ? 'The observed execution report guides the agent’s next candidate programs. Repeat prediction, selection, and gating at the next research step.' : 'The predicted execution report guides the agent’s next candidate programs. Repeat prediction, selection, and gating at the next research step.'],
    ['Final submission: real run', 'At the end of search, return a program verified through real execution and selected by the best real validation score.']
  ];
  renderLoopScene($('loop-diagram'), {step, scenario, playing: $('loop-animation').dataset.playing === 'true'});
  $('loop-verification').classList.toggle('active', step === 6);
  caption('loop', step, loopLabels, ...descriptions[step]);
}

const loopPlayer=createPlayer('loop',()=>loopLabels,renderLoop,()=>{
  if(loopMode==='auto'){scenario=scenario==='high'?'low':'high';}
},{step:3000,final:3500});
$('loop-scenario').addEventListener('change',event=>{loopMode=event.target.value;scenario=loopMode==='auto'?'high':loopMode;loopPlayer.restart();});
loopPlayer.update();
$('walkthrough').dataset.animationReady='true';

// Optional agent control mirrors visible controls and never runs code or inference.
if(document.modelContext?.registerTool) {
  const definition={name:'show_method_step',title:'Explore the main feedback loop',description:'Show a step of the main feedback loop from Figure 1(b), from multiple code candidates through selection and confidence gating.',
    inputSchema:{type:'object',properties:{view:{type:'string',enum:['loop']},step:{type:'integer',minimum:0,maximum:6},scenario:{type:'string',enum:['high','low']}},required:['view','step'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['view','step','scenario'].includes(k))||input.view!=='loop'||!Number.isInteger(input.step))throw new Error('Invalid method step.');
      if(input.scenario!==undefined&&!['high','low'].includes(input.scenario))throw new Error('Invalid scenario.');
      if(input.step<0||input.step>=loopLabels.length)throw new Error('Step is outside this animation.');
      scenario=input.scenario??scenario;loopMode=scenario;$('loop-scenario').value=loopMode;loopPlayer.go(input.step);
      const target=$('loop-animation');target.scrollIntoView({block:'start'});
      return {view:'loop',step:input.step,totalSteps:loopLabels.length,scenario,route:target.dataset.route};
    }};
  const lifecycle=new AbortController();
  (async()=>{try{await document.modelContext.registerTool(definition,{signal:lifecycle.signal});}catch(error){console.warn(`Optional method tool unavailable: ${error.message}`);}})();
  window.addEventListener('pagehide',event=>{if(!event.persisted)lifecycle.abort();},{once:true});
}
