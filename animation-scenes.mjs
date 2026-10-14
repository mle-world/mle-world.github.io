// Figure 1(b): a candidate pool maps to one predicted report per candidate,
// then selection/combination precedes the execution gate.
const NS = 'http://www.w3.org/2000/svg';
const scenes = new WeakMap();
const labels = ['1', '2', 'N'];
// Schematic values explain the gate; they are not recorded evaluation results.
export const illustrativeConfidence = {high: .95, low: .55, threshold: .80};
const codeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/></svg>';

function makeScene(root) {
  if (scenes.has(root)) return scenes.get(root);
  root.innerHTML = `<div class="paper-loop-scene" data-scene="figure-1b">
    <div class="paper-loop-status"><span>One prediction for every candidate</span><span data-part="play-status">Paused</span></div>
    <svg class="paper-loop-wires" aria-hidden="true"><defs>
      <marker id="paper-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#315eaa"/></marker>
      <marker id="paper-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#bb493d"/></marker>
    </defs><g data-wires></g></svg>
    <div class="paper-loop-grid">
      <div class="paper-candidates" data-node="candidates"><div class="paper-column-heading"><strong>MLE agent</strong><span>Sample N codes</span></div><div class="paper-document-stack">${labels.map((n,i)=>`<div class="paper-code paper-node" data-node="code-${n}" data-candidate="${n}" style="--candidate-index:${i}">${codeIcon}<strong>Code ${n}</strong></div>`).join('')}</div></div>
      <div class="paper-model-column"><div class="paper-model paper-node" data-node="model"><strong>MLE-<wbr>World</strong><b>Predict output</b><span>One 4B inference<br/>per candidate</span></div></div>
      <div class="paper-reports"><div class="paper-column-heading"><strong>Predicted<br/>terminal output</strong></div><div class="paper-document-stack">${labels.map((n,i)=>`<div class="paper-output paper-node" data-node="output-${n}" data-report="${n}" style="--candidate-index:${i}"><strong>Output ${n}</strong><span aria-hidden="true"><i></i><i></i><i></i></span></div>`).join('')}</div></div>
      <div class="paper-handoff">
      <div class="paper-selection"><div class="paper-column-heading"><strong>Select /<br/>combine</strong></div><div class="paper-selected paper-node" data-node="selected"><div class="paper-selected-program">${codeIcon}<strong>One program</strong></div><div class="paper-confidence" data-node="confidence"><strong>MLE-World confidence</strong><div class="paper-confidence-value"><span>p<sub>max</sub></span><output data-part="confidence-score">—</output></div><span class="paper-confidence-comparison" data-part="confidence-comparison">After selection</span></div></div></div>
      <div class="paper-branches"><div class="paper-branch paper-skip paper-node" data-node="skip"><span>High confidence</span><strong>Skip execution</strong><small>Use prediction</small></div><div class="paper-branch paper-run paper-node" data-node="run"><span>Low confidence</span><strong>Run real code</strong><small>Train / evaluate</small></div></div>
      </div>
    </div>
    <p class="paper-report-fields">Logs · errors · score + confidence</p>
    <p class="paper-gate-example">Illustrative confidence scores · gate threshold ${illustrativeConfidence.threshold.toFixed(2)}</p>
    <div class="paper-feedback paper-node" data-node="feedback"><strong>Feedback to agent</strong><span data-part="feedback-kind">Predicted or observed execution report</span></div>
  </div>`;
  const scene = {root, el: root.firstElementChild, step: 0, scenario: 'high', paths: new Map()};
  scene.observer = new ResizeObserver(() => draw(scene));
  scene.observer.observe(scene.el);
  scenes.set(root, scene);
  return scene;
}

function port(scene, id, side = 'right', fraction = .5) {
  const box = scene.el.querySelector(`[data-node="${id}"]`).getBoundingClientRect();
  const parent = scene.el.getBoundingClientRect();
  return {x: box.left - parent.left + (side === 'left' ? 0 : side === 'right' ? box.width : box.width * fraction),
    y: box.top - parent.top + (side === 'top' ? 0 : side === 'bottom' ? box.height : box.height * fraction)};
}

function draw(scene) {
  const {step, scenario} = scene;
  const mobile = window.matchMedia('(max-width:800px)').matches;
  const svg = scene.el.querySelector('.paper-loop-wires');
  svg.setAttribute('viewBox', `0 0 ${scene.el.clientWidth} ${scene.el.clientHeight}`);
  const route = scenario === 'low' ? 'run' : 'skip';
  const edges = [];
  for (const [i, n] of labels.entries()) {
    const fraction = .16 + i * .34;
    edges.push({id:`code-${n}-prediction`,from:`code-${n}`,to:'model',toFraction:fraction,active:step===1});
    edges.push({id:`prediction-output-${n}`,from:'model',fromFraction:fraction,to:`output-${n}`,active:step===2});
    edges.push({id:`output-${n}-selection`,from:`output-${n}`,to:'selected',active:step===3,kind:'selection'});
  }
  for (const branch of ['skip','run']) {
    edges.push({id:`confidence-${branch}`,from:'confidence',to:branch,active:step===4&&route===branch,warm:branch==='run'});
    edges.push({id:`${branch}-feedback`,from:branch,to:'feedback',active:step===5&&route===branch,warm:branch==='run',kind:'feedback'});
  }
  edges.push({id:'feedback-candidates',from:'feedback',to:'candidates',active:step===5,kind:'return'});
  for (const edge of edges) {
    let from = port(scene, edge.from, 'right', edge.fromFraction ?? .5);
    let to = port(scene, edge.to, 'left', edge.toFraction ?? .5);
    let path;
    if (edge.kind === 'selection' && mobile) {
      from = port(scene, edge.from, 'right');
      to = port(scene, edge.to, 'left');
      // The outside rail collects all predicted reports before one program is returned.
      const rail = scene.el.clientWidth - 5;
      const lane = scene.el.querySelector('.paper-selection').getBoundingClientRect().top - scene.el.getBoundingClientRect().top - 14;
      path = `M ${from.x} ${from.y} H ${rail} V ${lane} H ${to.x-10} V ${to.y} H ${to.x}`;
    } else if (edge.kind === 'feedback') {
      to = port(scene, 'feedback', 'right');
      const rail = scene.el.clientWidth - (mobile ? 5 : 9);
      path = `M ${from.x} ${from.y} H ${rail} V ${to.y} H ${to.x}`;
    } else if (edge.kind === 'return') {
      from = port(scene, 'feedback', 'left');
      to = port(scene, 'candidates', mobile ? 'left' : 'bottom');
      const rail = mobile ? 5 : to.x;
      path = `M ${from.x} ${from.y} H ${rail} V ${to.y} H ${to.x}`;
    } else {
      const middle = (from.x + to.x) / 2;
      path = `M ${from.x} ${from.y} C ${middle} ${from.y} ${middle} ${to.y} ${to.x} ${to.y}`;
    }
    let element = scene.paths.get(edge.id);
    if (!element) {
      element = document.createElementNS(NS, 'path');
      element.dataset.connection = edge.id;
      svg.querySelector('[data-wires]').append(element);
      scene.paths.set(edge.id, element);
    }
    element.setAttribute('d', path);
    element.setAttribute('class', `paper-wire${edge.active?' active':''}${edge.warm?' warm':''}`);
    element.setAttribute('marker-end', `url(#paper-arrow${edge.warm?'-red':''})`);
  }
}

export function renderLoopScene(root, {step, scenario, playing}) {
  const scene = makeScene(root);
  scene.step = step; scene.scenario = scenario;
  const route = scenario === 'low' ? 'run' : 'skip';
  scene.el.dataset.step = step;
  scene.el.dataset.route = route;
  scene.el.dataset.playing = String(playing);
  scene.el.querySelector('[data-part="play-status"]').textContent = playing ? 'Playing' : 'Paused';
  const confidence = illustrativeConfidence[scenario].toFixed(2);
  const threshold = illustrativeConfidence.threshold.toFixed(2);
  scene.el.querySelector('[data-part="confidence-score"]').textContent = step >= 3 ? confidence : '—';
  scene.el.querySelector('[data-part="confidence-comparison"]').textContent = step >= 3 ? `${confidence} ${route === 'skip' ? '≥' : '<'} ${threshold}` : 'After selection';
  const confidenceNode = scene.el.querySelector('[data-node="confidence"]');
  confidenceNode.dataset.revealed = String(step >= 3);
  confidenceNode.classList.toggle('is-active', step === 3 || step === 4);
  scene.el.querySelector('[data-part="feedback-kind"]').textContent = step >= 5 ? (route === 'skip' ? 'Predicted execution report' : 'Observed execution report') : 'Predicted or observed execution report';
  for (const node of scene.el.querySelectorAll('.paper-node')) {
    const id = node.dataset.node;
    const active = (id.startsWith('code-') && step === 0) || (id === 'model' && step === 1) ||
      (id.startsWith('output-') && step === 2) || (id === 'selected' && step === 3) ||
      (id === route && step === 4) || (id === 'feedback' && step === 5);
    node.classList.toggle('is-active', active);
    node.classList.toggle('route-selected', ['skip','run'].includes(id) && id === route && step >= 4);
    node.classList.toggle('route-muted', ['skip','run'].includes(id) && id !== route && step >= 4);
  }
  draw(scene);
}
