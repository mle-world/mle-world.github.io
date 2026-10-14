const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const tabGroups = [...document.querySelectorAll('[data-research-tabs]')];

function selectTab(group, selected, focus = false) {
  for (const tab of group.querySelectorAll('[role="tab"]')) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
  }
  if (focus) selected.focus();
}

for (const group of tabGroups) {
  const tabs = [...group.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(group, tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(group, tabs[next], true);
    });
  });
}

function revealTarget(hash) {
  if (!hash || hash === '#') return;
  let target;
  try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
  if (!target) return;
  for (let parent = target; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
    if (parent.getAttribute('role') === 'tabpanel') {
      const tab = document.querySelector(`[role="tab"][aria-controls="${parent.id}"]`);
      if (tab) selectTab(tab.closest('[data-research-tabs]'), tab);
    }
  }
  requestAnimationFrame(() => target.scrollIntoView({behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start'}));
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  document.querySelector('.mobile-toc').open = false;
  revealTarget(link.getAttribute('href'));
});
window.addEventListener('hashchange', () => revealTarget(location.hash));
if (location.hash) revealTarget(location.hash);

const links = [...document.querySelectorAll('.floating-toc a:not(.toc-brand), .mobile-toc nav a')];
const sections = [...new Set(links.map(link => document.getElementById(link.hash.slice(1))))].filter(Boolean);
let scheduled = false;
function updateNavigation() {
  scheduled = false;
  let current = null;
  for (const section of sections) if (section.getBoundingClientRect().top <= 180) current = section.id;
  for (const link of links) {
    const active = link.hash === `#${current}`;
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('scroll', () => {
  if (!scheduled) { scheduled = true; requestAnimationFrame(updateNavigation); }
}, {passive: true});
window.addEventListener('resize', updateNavigation);
updateNavigation();
