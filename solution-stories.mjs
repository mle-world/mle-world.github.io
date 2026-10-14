const element = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children.filter(child => child != null));
  return node;
};
const number = value => value == null ? 'Unavailable' : Number(value).toLocaleString('en-US', {maximumFractionDigits: 5});
const percentile = value => Number(value).toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1});

function sourceExcerpt(code, selectedLines) {
  const lines = code.split(/\r?\n/);
  const pre = element('pre', {class: 'story-excerpt', tabindex: '0', 'aria-label': 'Excerpts from the saved program, with original line numbers'});
  let previous = 0;
  for (const line of selectedLines) {
    if (previous && line > previous + 1) pre.append(element('span', {class: 'source-gap', 'aria-label': 'Intervening lines omitted'}, '⋮'));
    pre.append(element('span', {class: 'source-line', 'data-line': line}, element('span', {class: 'source-number', 'aria-hidden': 'true'}, String(line)), element('code', {}, lines[line - 1])));
    previous = line;
  }
  return pre;
}

function solutionCard(study, solution, detail, policy, downloadCode) {
  if (detail.id !== solution.trialId || detail.codeHash !== solution.codeHash || !detail.valid || !detail.codeAvailable) throw new Error('The saved program does not match this reviewed example.');
  const card = element('article', {class: 'story-card', style: `--policy-color:${policy.color}`, 'data-trial-id': detail.id, 'data-policy': policy.id});
  card.append(
    element('div', {class: 'story-policy-header'},
      element('div', {class: 'story-policy', title: policy.description}, element('span', {class: 'story-policy-dot', 'aria-hidden': 'true'}), policy.label),
      element('span', {class: 'story-role'}, policy.id === 'base' ? 'Baseline' : 'TTS')),
    element('dl', {class: 'story-performance'}, element('dt', {}, 'Leaderboard percentile ↑'),
      element('dd', {}, element('strong', {class: 'story-percentile', title: `Exact percentile: ${detail.percentile}`}, percentile(detail.percentile)), element('span', {}, ' / 100'))),
    element('div', {class: 'story-percentile-track', 'aria-hidden': 'true'}, element('span', {style: `width:${detail.percentile}%`})),
    element('h4', {}, solution.title)
  );
  const source = element('details', {class: 'story-source'});
  source.append(element('summary', {}, 'See code & test results'));
  source.append(element('p', {class: 'story-source-label'}, 'Excerpts from the submitted program'), sourceExcerpt(detail.code, solution.evidenceLines));
  if (solution.implementationNote) source.append(element('p', {class: 'story-implementation-note'}, solution.implementationNote));
  if (solution.note) source.append(element('p', {class: 'small'}, solution.note));
  const stats = element('dl', {class: 'story-scores'});
  for (const [label, value, key] of [
    [`${study.metric} · ${study.metricDirection} is better`, number(detail.testScore), 'test'],
    ['Leaderboard percentile', number(detail.percentile), 'percentile']
  ]) stats.append(element('div', {}, element('dt', {}, label), element('dd', {'data-story-score': key}, value)));
  source.append(stats, element('p', {class: 'small'}, 'Final program selected by real validation. Private-test grades are used only for evaluation.'));
  source.append(element('div', {class: 'story-actions'}, element('button', {class: 'button small-button', type: 'button', onclick: () => downloadCode(detail.code, `${detail.id}.py`)}, 'Download program'), element('span', {class: 'small'}, `${detail.lines} lines · verified submission`)));
  source.append(element('details', {class: 'story-full-code'}, element('summary', {}, 'Read the full program'), element('pre', {class: 'story-program', tabindex: '0', 'aria-label': `${policy.label} saved Python program`}, detail.code)));
  source.append(element('p', {class: 'story-identity'}, `${detail.id}\nCode SHA-256: ${detail.codeHash}`));
  card.append(source);
  return card;
}

export async function initSolutionStories({studies, policies, json, downloadCode, announce}) {
  const buttons = document.getElementById('solution-examples');
  const cards = document.getElementById('solution-story-cards');
  let version = 0, selected = studies[0].task;
  async function selectTask(task) {
    const study = studies.find(item => item.task === task);
    if (!study) throw new Error('Choose one of the selected solution examples.');
    selected = task;
    const current = ++version;
    document.querySelectorAll('[data-story-task]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.storyTask === task)));
    document.getElementById('story-question').textContent = study.question;
    document.getElementById('story-description').textContent = study.description;
    document.getElementById('story-takeaway').textContent = study.takeaway;
    document.getElementById('story-context').textContent = `${study.kind} · run seed ${study.seed} · TTS: ungated · 8-hour budget`;
    cards.removeAttribute('data-story-ready');
    cards.dataset.task = task;
    cards.setAttribute('aria-busy', 'true');
    const slots = study.solutions.map(solution => element('div', {class: 'story-card story-loading', role: 'status'}, `Loading ${policies.find(p => p.id === solution.policy).label} program…`));
    cards.replaceChildren(...slots);
    let failed = false;
    await Promise.all(study.solutions.map(async (solution, index) => {
      try {
        const detail = await json(`data/solutions/${solution.trialId}.json`);
        if (current !== version) return;
        slots[index].replaceWith(solutionCard(study, solution, detail, policies.find(p => p.id === solution.policy), downloadCode));
      } catch (error) {
        if (current !== version) return;
        failed = true;
        slots[index].replaceChildren(element('p', {}, 'This saved program could not be loaded.'), element('button', {type: 'button', class: 'button small-button', onclick: () => void selectTask(task)}, 'Retry program'));
        slots[index].removeAttribute('role');
      }
    }));
    if (current === version) {
      cards.setAttribute('aria-busy', 'false');
      if (!failed) cards.dataset.storyReady = 'true';
      announce(`${study.label}: ${failed ? 'a program could not be loaded. Use Retry program.' : 'Base AIDE and all five TTS policies, with leaderboard percentiles.'}`);
    }
    return {task: selected, trialIds: study.solutions.map(solution => solution.trialId)};
  }
  buttons.style.setProperty('--example-count', studies.length);
  buttons.replaceChildren(...studies.map((study, index) => element('button', {type: 'button', 'data-story-task': study.task, 'aria-pressed': String(study.task === selected), 'aria-controls': 'solution-story', onclick: () => void selectTask(study.task)},
    element('span', {class: 'story-tab-meta'}, `0${index + 1} / ${study.kind}`), element('strong', {}, study.label))));
  await selectTask(selected);
  return {selectTask, get selectedTask() { return selected; }};
}
