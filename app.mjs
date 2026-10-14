import {policyTrials, validQuantile} from './model.mjs';
import {comparisonCard, excerptPanel, reportLines} from './confidence-evidence.mjs';
import {initSolutionStories} from './solution-stories.mjs';

const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const fmt = (n, digits = 1) => n == null ? '—' : Number(n).toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
const pct = n => n == null ? '—' : `${fmt(n * 100)}%`;
const score = n => n == null ? 'Unavailable' : Number(n).toLocaleString('en-US', {maximumSignificantDigits: 7});
const thresholdText = n => String(n);
const measureNames = {terminal: 'terminal agreement', exception: 'exception agreement', metric: 'metric agreement'};
const descriptions = {
  terminal: 'Mean agreement across three LLM judge votes per program, comparing the predicted and actual execution reports.',
  exception: 'Exact agreement between predicted and actual exception classes. “None” denotes a run with no reported exception.',
  metric: 'Agreement within 5% relative error of the real validation metric. Only numeric references enter the denominator; missing predicted metrics count as misses.'
};
let confidence, policyData, tasks, stories, storyView, selectedExamples = [], currentCase;
let caseVersion = 0, solutionVersion = 0;
const state = {quantile: 4, measure: 'terminal', caseId: null, policy: 'debug_pclean', setting: 'confidence', task: null, seed: 34, left: 'base', right: 'debug_pclean'};
const cache = new Map();

function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter(c => c != null));
  return node;
}
function svgElement(tag, attrs = {}, content) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (content != null) node.textContent = content;
  return node;
}
function svgRoot(width, height, title, description) {
  const svg = svgElement('svg', {viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title});
  svg.append(svgElement('title', {}, title), svgElement('desc', {}, description));
  return svg;
}
function text(svg, x, y, value, anchor = 'middle', attrs = {}) {
  svg.append(svgElement('text', {x, y, 'text-anchor': anchor, ...attrs}, value));
}
function line(svg, x1, y1, x2, y2, attrs = {}) {
  svg.append(svgElement('line', {x1, y1, x2, y2, stroke: '#dce3ee', ...attrs}));
}
function options(select, values) {
  select.replaceChildren(...values.map(v => element('option', {value: v.id}, v.label)));
}
function announce(value) { $('announcement').textContent = value; }
function taskLabel(id) { return tasks.find(t => t.id === id)?.label || id; }
function policy(id) { return policyData.policies.find(p => p.id === id); }
function trial(id) { return policyTrials(policyData.trials, id, state.setting, state.task, state.seed)[0]; }
function currentQuantile() { return confidence.quantiles.find(q => q.id === state.quantile); }
async function json(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then(r => {
    if (!r.ok) throw new Error(`Could not load ${path} (${r.status}).`);
    return r.json();
  }).catch(e => { cache.delete(path); throw e; }));
  return cache.get(path);
}
function downloadCode(code, filename) {
  const url = URL.createObjectURL(new Blob([code], {type: 'text/x-python;charset=utf-8'}));
  const link = element('a', {href: url, download: filename});
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function drawConfidence() {
  const width = Math.max(240, Math.min(1040, $('confidence-chart').clientWidth || 640));
  const svg = svgRoot(width, 260, 'Observed agreement across five confidence quantiles',
    confidence.quantiles.map(q => `Q${q.id}: ${pct(q.metrics[state.measure].mean)} ${measureNames[state.measure]} from ${q.metrics[state.measure].n} references.`).join(' ') + ' Each confidence group contains 340 programs. Selected examples are separate from these aggregate statistics.');
  const step = (width - 66) / 5, x = q => 44 + (q - .5) * step, y = p => 189 - p * 1.62;
  for (const v of [0, 50, 100]) {
    line(svg, 44, y(v), width - 22, y(v)); text(svg, 35, y(v) + 4, `${v}%`, 'end');
  }
  for (const q of confidence.quantiles) {
    const value = q.metrics[state.measure].mean;
    const bar = svgElement('rect', {x: x(q.id) - step * .27, y: y(value * 100), width: step * .54, height: 189 - y(value * 100), rx: 4, fill: ['#d8b38c','#b8b9bf','#9bb2c9','#72a99e','#468d81'][q.id-1], 'data-quantile-bar': q.id});
    bar.append(svgElement('title', {}, `Q${q.id} · ${q.label}: ${pct(value)} agreement, ${q.metrics[state.measure].n} references`));
    svg.append(bar);
    text(svg, x(q.id), y(value * 100) - 9, fmt(value * 100), 'middle', {'data-quantile-rate': q.id, style: 'font-weight:750;fill:#35445d'});
    text(svg, x(q.id), 210, `Q${q.id}`, 'middle', {style: 'font-weight:500'});
    text(svg, x(q.id), 229, `n=${q.metrics[state.measure].n}`, 'middle', {'data-quantile-n':q.id,style:'font-size:12px;fill:#64738a'});
  }
  text(svg, width / 2 + 8, 253, 'Lower to higher model confidence');
  $('confidence-chart').replaceChildren(svg);
}

function renderConfidenceTrend() {
  all('[data-metric]').forEach(b => b.setAttribute('aria-pressed', b.dataset.metric === state.measure));
  $('metric-description').textContent = descriptions[state.measure];
  $('trend-title').textContent = {terminal:'Terminal-output agreement',exception:'Exception-class agreement',metric:'Validation-metric agreement'}[state.measure];
  $('trend-low').textContent = pct(confidence.quantiles[0].metrics[state.measure].mean);
  $('trend-high').textContent = pct(confidence.quantiles.at(-1).metrics[state.measure].mean);
  drawConfidence();
}

async function renderComparison() {
  const root=$('confidence-comparison');
  root.replaceChildren(...['low','high'].map(level=>element('div',{'data-comparison-slot':level,role:'status'},'Loading recorded comparison…')));
  await Promise.all(['low','high'].map(async level=>{
    const example=confidence.loopExamples[level],slot=root.querySelector(`[data-comparison-slot="${level}"]`);
    try {
      const detail=await json(`data/cases/${example.id}.json`);
      slot.replaceWith(comparisonCard(example,detail,level,taskLabel(example.task)));
    } catch(error) {
      slot.replaceChildren('This recorded comparison could not be loaded. ',element('button',{type:'button',class:'button small-button contrast-retry',onclick:()=>void renderComparison()},'Retry comparison'));
      slot.removeAttribute('role');handleError(error);
    }
  }));
}

async function renderConfidence() {
  const q = currentQuantile(), metric = q.metrics[state.measure];
  selectedExamples = q.examples.map(id => confidence.examples.find(c => c.id === id));
  $('example-summary').textContent = q.id <= 2 ? 'Selected examples · 2 incorrect predictions' : q.id === 3 ? 'Selected examples · 1 lower-confidence miss + 1 higher-confidence match' : 'Selected examples · 2 correct predictions';
  $('quantile-display').textContent = `Q${q.id} · ${q.label}`;
  $('confidence-slider').value = q.id;
  $('confidence-slider').setAttribute('aria-valuetext', `Q${q.id}, ${q.label.toLowerCase()} confidence, ${q.percentileLow} to ${q.percentileHigh} percentile; two selected examples`);
  $('quantile-rank').textContent = `${q.percentileLow}–${q.percentileHigh}th percentile of model confidence`;
  $('quantile-range').textContent = `${q.confidenceMin}\nto ${q.confidenceMax}`;
  all('[data-quantile]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.quantile) === q.id));
  $('accuracy-label').textContent = `Observed ${measureNames[state.measure]}`;
  $('accuracy-value').textContent = pct(metric.mean);
  $('accuracy-denominator').textContent = `All ${fmt(metric.n, 0)} ${state.measure === 'metric' ? 'numeric references' : 'programs'}${state.measure === 'terminal' ? ' · 3 votes each' : ''}`;
  $('quantile-count').textContent = fmt(q.count, 0);
  $('quantile-share').textContent = `${fmt(q.share * 100, 0)}% of all ${fmt(confidence.totalPrograms, 0)}`;
  $('numeric-count').textContent = fmt(q.numericReferences, 0);
  if (!selectedExamples.some(c => c.id === state.caseId)) state.caseId = selectedExamples[0].id;
  await renderCase();
}

async function renderCase() {
  const version = ++caseVersion;
  const index = selectedExamples.findIndex(c => c.id === state.caseId), c = selectedExamples[index];
  currentCase = null;
  $('previous-case').disabled = index <= 0; $('next-case').disabled = index >= selectedExamples.length - 1;
  $('case-position').textContent = `${index + 1} / ${selectedExamples.length}`;
  $('case-title').textContent = c.title;
  $('case-caption').textContent = c.caption;
  $('case-task').textContent = taskLabel(c.task);
  $('example-buttons').replaceChildren(...selectedExamples.map((item, i) => element('button', {type: 'button', 'data-example': item.id, 'aria-pressed': String(item.id === c.id), onclick: () => { state.caseId = item.id; void renderCase().catch(handleError); }},
    element('span', {class: 'example-number'}, `0${i + 1}`), element('span', {class: 'example-copy'}, element('strong', {}, item.title), element('span', {}, element('b', {class: item.terminalAgreement === 1 ? 'positive' : 'negative'}, item.terminalAgreement === 1 ? 'Correct' : 'Incorrect'), ` · Confidence percentile ${fmt(item.confidencePercentile)} · ${item.lengths.prediction.lines} predicted lines`)))));
  $('case-content').removeAttribute('data-case-id');
  $('case-stage').textContent = c.stage;
  $('case-confidence-rank').textContent = `Confidence percentile ${fmt(c.confidencePercentile)} · Q${c.bin}`;
  $('case-confidence').textContent = `Raw confidence ${thresholdText(c.confidence)}`;
  const verdict = (label, value, positive) => element('span', {class: 'verdict'}, label, element('strong', {class: positive == null ? '' : positive ? 'positive' : 'negative'}, value));
  $('case-verdicts').replaceChildren(
    verdict('Terminal votes ', `${c.votes.filter(Boolean).length}/3 agree`, c.terminalAgreement === 1),
    verdict('Exception ', `${c.predictedException} → ${c.actualException}`, c.exceptionMatch),
    verdict('Validation score ', `${score(c.predictedMetric)} → ${score(c.actualMetric)}`, c.metricEligible ? c.metricMatch : null)
  );
  $('predicted-output').textContent = 'Loading recorded prediction…';
  $('actual-output').textContent = 'Loading reference…';
  $('case-excerpts').replaceChildren(element('p',{class:'small',role:'status'},'Loading original report excerpts…'));
  $('full-case-logs').open = false; $('full-case-logs').hidden = true;
  $('predicted-length').textContent = ''; $('actual-length').textContent = '';
  for (const id of ['logs-start', 'logs-end', 'expand-logs']) $(id).disabled = true;
  $('terminal-comparison').classList.remove('expanded');
  $('expand-logs').setAttribute('aria-expanded', 'false'); $('expand-logs').textContent = 'Expand logs';
  $('candidate-code').textContent = ''; $('candidate-context').textContent = '';
  $('case-identity').textContent = ''; $('case-code-count').textContent = '';
  $('download-case').disabled = true;
  try {
    const detail = await json(`data/cases/${c.id}.json`);
    if (version !== caseVersion) return;
    currentCase = detail;
    $('predicted-output').textContent = detail.prediction || '(No predicted output)';
    $('actual-output').textContent = detail.actual || '(No recorded output)';
    $('case-excerpts').replaceChildren(...['prediction','actual'].map(kind=>excerptPanel(detail[kind],c,kind)));
    $('case-full-summary').textContent = `View all ${reportLines(detail.prediction).length} predicted / ${reportLines(detail.actual).length} actual lines`;
    $('full-case-logs').hidden = false;
    $('predicted-output').scrollTop = 0; $('actual-output').scrollTop = 0;
    $('predicted-length').textContent = `${fmt(c.lengths.prediction.lines, 0)} lines · ${fmt(c.lengths.prediction.characters, 0)} chars`;
    $('actual-length').textContent = `${fmt(c.lengths.actual.lines, 0)} lines · ${fmt(c.lengths.actual.characters, 0)} chars`;
    for (const id of ['logs-start', 'logs-end', 'expand-logs']) $(id).disabled = false;
    $('candidate-code').textContent = detail.code;
    $('case-code-count').textContent = `${detail.code.trimEnd().split('\n').length} lines`;
    $('case-identity').textContent = `${c.id} · code SHA-256 ${detail.codeHash.slice(0, 12)}`;
    $('candidate-context').textContent = `TASK\n${c.task}\n\nEXECUTION ENVIRONMENT\n${detail.environment || 'Not recorded'}\n\nDATA OVERVIEW\n${detail.dataOverview || 'Not recorded'}\n\nRuntime budget: ${detail.runtimeBudget ?? 'Not recorded'} seconds\nObserved elapsed time: ${detail.elapsedSeconds ?? 'Not recorded'} seconds`;
    $('download-case').disabled = false;
    $('case-content').dataset.caseId = c.id;
  } catch (e) {
    if (version !== caseVersion) return;
    $('case-excerpts').replaceChildren(element('div',{class:'error-banner'},'This saved example could not be loaded. ', element('button', {class: 'button small-button', type: 'button', onclick: () => void renderCase().catch(handleError)}, 'Retry')));
    $('predicted-output').textContent = 'The selected prediction is unavailable until the example finishes loading.';
    $('actual-output').textContent = 'Reference unavailable until the example finishes loading.';
    announce('The selected example could not be loaded. Use Retry.');
    throw e;
  }
}

function solutionPanel(d) {
  const p = policy(d.policy);
  const box = element('div', {'data-trial-id': d.id});
  box.append(element('div', {class: 'solution-title'}, element('h4', {}, `${taskLabel(d.task)} · seed ${d.seed}`), element('span', {class: `tag ${d.valid ? 'positive' : 'negative'}`}, d.valid ? 'Valid submission' : 'Invalid / missing submission')));
  const stats = element('dl', {class: 'solution-stats'});
  for (const [label, value] of [['Leaderboard percentile', fmt(d.percentile)], ['Private-test score', score(d.testScore)], ['Program-reported validation metric', score(d.validationMetric)], ['Real execution cost', `${fmt(d.executionHours, 2)} h`]]) stats.append(element('div', {}, element('dt', {}, label), element('dd', {}, value)));
  box.append(stats, element('p', {class: 'small'}, `${d.lowerIsBetter ? 'Lower' : 'Higher'} raw score is better · ${fmt(d.realExecutions, 0)} real executions${d.gold ? ' · Gold medal' : d.medal ? ' · Medal earned' : ''}.`));
  if (!d.valid) box.append(element('p', {class: 'small negative'}, 'This trial contributes zero percentile. Saved code, when available, is shown for inspection; it did not produce a valid final submission.'));
  if (d.libraries.length) box.append(element('div', {class: 'libraries', 'aria-label': 'Libraries imported in saved code'}, ...d.libraries.map(l => element('span', {class: 'tag'}, l))));
  const plan = element('details', {}, element('summary', {}, 'Agent’s recorded plan'), element('p', {class: 'solution-plan'}, d.plan || 'No plan was recorded.'));
  box.append(plan);
  if (d.terminal) box.append(element('details', {}, element('summary', {}, 'Final program’s execution output'), element('pre', {tabindex: '0'}, d.terminal)));
  if (d.codeAvailable) {
    box.append(element('div', {class: 'solution-actions'}, element('button', {type: 'button', class: 'button small-button', onclick: () => downloadCode(d.code, `${d.id}.py`)}, 'Download program'), element('span', {}, `${d.lines} lines · final step ${d.step ?? 'unknown'}`)));
    box.append(element('p', {class: 'solution-hash', title: `Node ${d.nodeId}\nCode SHA-256 ${d.codeHash}\nSubmission SHA-256 ${d.submissionHash || 'Unavailable'}`}, `Node ${d.nodeId?.slice(0, 12) || 'unavailable'} · code SHA-256 ${d.codeHash?.slice(0, 12) || 'unavailable'}${d.valid ? ' · submission hash verified' : ''}`));
    box.append(element('pre', {tabindex: '0', 'aria-label': `${p.label} final Python program`, class: 'final-code'}, d.code));
  } else box.append(element('p', {class: 'empty-state'}, 'No final program was saved for this trial.'));
  return box;
}

async function renderSolutions() {
  const version = ++solutionVersion;
  $('solution-task').value = state.task; $('solution-setting').value = state.setting; $('solution-seed').value = state.seed;
  $('left-policy').value = state.left; $('right-policy').value = state.right;
  await Promise.all(['left', 'right'].map(async side => {
    const t = trial(state[side]), panel = $(`${side}-solution`);
    panel.replaceChildren(element('p', {class: 'small'}, 'Loading the final program…'));
    try {
      const detail = await json(`data/solutions/${t.id}.json`);
      if (version === solutionVersion) panel.replaceChildren(solutionPanel(detail));
    } catch (e) {
      if (version === solutionVersion) panel.replaceChildren(element('p', {class: 'error-banner', role: 'alert'}, 'This saved program could not be loaded. ', element('button', {type: 'button', class: 'button small-button', onclick: () => void renderSolutions().catch(handleError)}, 'Retry')));
      throw e;
    }
  }));
}

async function setQuantile(value) {
  if (!validQuantile(value)) throw new Error('Choose a confidence quantile from 1 to 5.');
  state.quantile = value; await renderConfidence();
  announce(`Q${value}, ${currentQuantile().label.toLowerCase()} confidence. ${pct(currentQuantile().metrics[state.measure].mean)} observed ${measureNames[state.measure]}. Two selected long-output examples.`);
}
function handleError(error) { console.warn(error.message); }
function wireControls() {
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { drawConfidence(); }, 100); });
  $('confidence-slider').addEventListener('input', e => { void setQuantile(Number(e.target.value)).catch(handleError); });
  all('[data-quantile]').forEach(b => b.addEventListener('click', () => void setQuantile(Number(b.dataset.quantile)).catch(handleError)));
  all('[data-metric]').forEach(b => b.addEventListener('click', () => { state.measure = b.dataset.metric; renderConfidenceTrend(); void renderConfidence().catch(handleError); }));
  for (const [id, offset] of [['previous-case', -1], ['next-case', 1]]) $(id).addEventListener('click', () => {
    const index = selectedExamples.findIndex(c => c.id === state.caseId); state.caseId = selectedExamples[index + offset]?.id || state.caseId; void renderCase().catch(handleError);
  });
  $('expand-logs').addEventListener('click', () => {
    const expanded = $('terminal-comparison').classList.toggle('expanded');
    $('expand-logs').setAttribute('aria-expanded', String(expanded)); $('expand-logs').textContent = expanded ? 'Compact logs' : 'Expand logs';
  });
  for (const [id, end] of [['logs-start', false], ['logs-end', true]]) $(id).addEventListener('click', () => {
    if ($('terminal-comparison').classList.contains('expanded')) $('expand-logs').click();
    for (const log of [$('predicted-output'), $('actual-output')]) log.scrollTop = end ? log.scrollHeight : 0;
  });
  $('download-case').addEventListener('click', () => { if (currentCase) downloadCode(currentCase.code, `${currentCase.id}.py`); });
  $('solution-archive').addEventListener('toggle', () => {
    if ($('solution-archive').open && !$('left-solution').childElementCount) void renderSolutions().catch(handleError);
  });
  for (const [id, key] of [['solution-task', 'task'], ['solution-setting', 'setting'], ['solution-seed', 'seed'], ['left-policy', 'left'], ['right-policy', 'right']]) $(id).addEventListener('change', e => {
    state[key] = key === 'seed' ? Number(e.target.value) : e.target.value; void renderSolutions().catch(handleError);
  });
}

function readState() {
  const stats = currentQuantile().metrics[state.measure];
  return {...state, solutionExample: storyView?.selectedTask, groupPrograms: currentQuantile().count, shownExamples: selectedExamples.length, denominator: stats.n, agreement: stats.mean, leftTrial: trial(state.left)?.id, rightTrial: trial(state.right)?.id};
}
function validatedInput(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k))) throw new Error('Invalid tool input.');
}
async function registerTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const definitions = [
    {name: 'set_confidence_quantile', title: 'Choose a confidence quantile', description: 'Choose one of five confidence quantiles and an optional agreement measure. Shows two curated long-output examples and accuracy from all 340 programs in the group. Does not run inference.', inputSchema: {type: 'object', properties: {quantile: {type: 'integer', enum: [1, 2, 3, 4, 5]}, measure: {type: 'string', enum: ['terminal', 'exception', 'metric']}}, required: ['quantile'], additionalProperties: false}, annotations: {readOnlyHint: false, untrustedContentHint: false}, async execute(input) {
      validatedInput(input, ['quantile', 'measure']);
      if (!validQuantile(input.quantile) || (input.measure !== undefined && !Object.hasOwn(measureNames, input.measure))) throw new Error('Invalid confidence quantile.');
      if (input.measure !== undefined && input.measure !== state.measure) {
        state.measure = input.measure;
        renderConfidenceTrend();
      }
      $('prediction-browser').open = true;
      await setQuantile(input.quantile); $('prediction-browser').scrollIntoView({behavior: 'smooth'}); return readState();
    }},
    {name: 'compare_final_solutions', title: 'Compare saved final solutions', description: 'Select a task, seed, experiment setting, and two policies. Opens their saved final programs and verified grades in the visible comparison.', inputSchema: {type: 'object', properties: {task: {type: 'string', enum: tasks.map(t => t.id)}, seed: {type: 'integer', enum: [34, 35, 36]}, setting: {type: 'string', enum: ['confidence', 'ungated']}, left: {type: 'string', enum: policyData.policies.map(p => p.id)}, right: {type: 'string', enum: policyData.policies.map(p => p.id)}}, required: ['task', 'seed', 'setting', 'left', 'right'], additionalProperties: false}, annotations: {readOnlyHint: false, untrustedContentHint: false}, async execute(input) {
      validatedInput(input, ['task', 'seed', 'setting', 'left', 'right']);
      if (!tasks.some(t => t.id === input.task) || ![34, 35, 36].includes(input.seed) || !['confidence', 'ungated'].includes(input.setting) || !policy(input.left) || !policy(input.right)) throw new Error('Invalid solution selection.');
      Object.assign(state, input); $('solution-archive').open = true; await renderSolutions(); $('solution-archive').scrollIntoView({behavior: 'smooth'}); return readState();
    }},
    {name: 'show_solution_example', title: 'Show a solution example', description: 'Show a selected task with final programs and leaderboard percentiles for Base AIDE and all five TTS policies. TTS runs are ungated, run seed 34; Base AIDE uses the historical reference.', inputSchema: {type: 'object', properties: {task: {type: 'string', enum: stories.studies.map(study => study.task)}}, required: ['task'], additionalProperties: false}, annotations: {readOnlyHint: false, untrustedContentHint: false}, async execute(input) {
      validatedInput(input, ['task']);
      const result = await storyView.selectTask(input.task); $('solutions').scrollIntoView({behavior: 'smooth'}); return result;
    }}
  ];
  for (const definition of definitions) {
    try { await context.registerTool(definition, {signal: lifecycle.signal}); }
    catch (error) { console.warn(`Optional WebMCP registration failed: ${error.message}`); }
  }
  window.addEventListener('pagehide', e => { if (!e.persisted) lifecycle.abort(); }, {once: true});
}

async function init() {
  try {
    [confidence, policyData, tasks, stories] = await Promise.all([json('data/confidence-demo.json'), json('data/policies.json'), json('data/tasks.json'), json('data/solution-stories.json')]);
    state.quantile = confidence.defaultQuantile; state.task = tasks[0].id;
    options($('solution-task'), tasks);
    options($('left-policy'), policyData.policies); options($('right-policy'), policyData.policies);
    $('solution-task').value = state.task; $('left-policy').value = state.left; $('right-policy').value = state.right;
    wireControls();
    await Promise.all([renderConfidence(), renderComparison(), initSolutionStories({studies: stories.studies, policies: policyData.policies, json, downloadCode, announce}).then(view => { storyView = view; })]);
    $('loading').hidden = true; $('explorer').hidden = false;
    renderConfidenceTrend();
    document.body.dataset.ready = 'true';
    await registerTools();
  } catch (error) {
    $('loading').hidden = true; $('load-error').hidden = false;
    $('load-error').replaceChildren('The recorded evaluation could not be loaded. ', element('button', {type: 'button', class: 'button small-button', onclick: () => location.reload()}, 'Reload page'));
    console.error(error);
  }
}
init();
