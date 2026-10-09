// Canvas-first presentation shared by the examples. Keep native controls, labels and focus order.
function tools(stage, content, title = 'Controls') {
  if (!content || content.closest('.canvas-tools')) return;
  const panel = document.createElement('details'); panel.className = 'canvas-tools canvas-ui';
  panel.open = !matchMedia('(max-width: 700px)').matches;
  const summary = document.createElement('summary'); summary.textContent = title;
  panel.append(summary, content); stage.append(panel);
  content.classList.add('canvas-control-content');
  const prose = [...content.children].filter(node => node.matches('p:not([id]):not(.readout), .prose'));
  if (prose.length) {
    const help = document.createElement('details'); help.className = 'canvas-help';
    const heading = document.createElement('summary'); heading.textContent = 'About this scene';
    help.append(heading, ...prose); content.append(help);
  }

}
for (const panel of document.querySelectorAll('.panel, .chapter')) {
  const stage = panel.querySelector(':scope > .stage, :scope > .landscape-layout > .stage, :scope > .lab > .stage');
  if (!stage || !stage.querySelector('canvas')) continue;
  stage.classList.add('canvas-stage'); panel.classList.add('canvas-panel');
  const header = panel.querySelector(':scope > .panel-head, :scope > .panel-heading, :scope > .chapter-head');
  if (header) { header.classList.add('canvas-title', 'canvas-ui'); stage.prepend(header); }
  tools(stage, panel.querySelector(':scope > .controls, :scope > .scene-controls'));
}
// Single-canvas pages, the particle HUD, and the film's transport use the same treatment.
for (const stage of document.querySelectorAll('.stage, .panel:has(> canvas)')) {
  if (!stage.querySelector('canvas')) continue;
  stage.classList.add('canvas-stage');
  const next = stage.nextElementSibling;
  if (next?.matches('.controls, .hud, .transport')) tools(stage, next, next.matches('.transport') ? 'Playback' : 'Controls');
  if (next?.matches('aside') && stage.querySelector('#scene')) tools(stage, next, 'Structure & symmetry');
}
// Attach shared controls and notes to their scene.
const globalControls = document.querySelector('.controls.global');
if (globalControls) {
  const stage = document.querySelector('.canvas-stage');
  if (stage) tools(stage, globalControls, 'Shared potential controls');
}
for (const guide of document.querySelectorAll('.scene-guide')) {
  const stage = guide.closest('.panel')?.querySelector('.canvas-stage');
  if (!stage) continue;
  const notes = document.createElement('details'); notes.className = 'canvas-help';
  const summary = document.createElement('summary'); summary.textContent = 'Scene notes'; notes.append(summary, guide);
  const content = stage.querySelector('.canvas-control-content');
  if (content) content.append(notes);
  else { const wrapper = document.createElement('div'); wrapper.append(notes); tools(stage, wrapper, 'Scene notes'); }
}

// Some multi-view chapters place their controls before a nested group of plots.
for (const content of document.querySelectorAll('.controls, .scene-controls, .hud, .transport')) {
  if (content.closest('.canvas-tools')) continue;
  let owner = content.parentElement;
  while (owner && !owner.matches('body, main, .grid') && !owner.querySelector('.canvas-stage')) owner = owner.parentElement;
  const stage = owner && !owner.matches('body, main, .grid') ? owner.querySelector('.canvas-stage') : null;
  if (stage) tools(stage, content);
}
// Reserve real layout columns: the drawing viewport never sits underneath controls or prose.
for (const stage of document.querySelectorAll('.canvas-stage')) {
  const shell = document.createElement('div'); shell.className = 'canvas-shell';
  stage.before(shell); shell.append(stage);
  const side = document.createElement('aside'); side.className = 'canvas-sidebar canvas-ui';
  for (const node of [...stage.children]) {
    if (node.matches('.canvas-title, .canvas-tools, .overlay, .hint, .stage-hint')) side.append(node);
  }
  if (side.children.length) shell.prepend(side);
}

// The project workspace displays one scene and its own controls, without the surrounding tour.
const projectId = new URLSearchParams(location.search).get('project');
if (new URLSearchParams(location.search).has('embed') && projectId) {
  const canvas = document.getElementById(projectId);
  const shell = canvas?.closest('.canvas-shell');
  if (shell) {
    document.body.classList.add('project-embed');
    shell.classList.add('project-active');
    document.body.append(shell);
    let side = shell.querySelector(':scope > .canvas-sidebar');
    if (!side) { side = document.createElement('aside'); side.className = 'canvas-sidebar canvas-ui'; shell.append(side); }
    for (const content of document.querySelectorAll('.transport:not(nav), .controls.global')) {
      if (shell.contains(content)) continue;
      tools(shell.querySelector('.canvas-stage'), content, 'Shared controls');
      const panel = content.closest('.canvas-tools');
      if (panel) side.append(panel);
    }
    for (const id of ['status', 'stats', 'render-info', 'error']) {
      const element = document.getElementById(id);
      if (element && !shell.contains(element)) side.append(element);
    }
    if (document.body.dataset.projectLazy === 'true') {
      for (const other of document.querySelectorAll('canvas')) if (other !== canvas) other.remove();
    }
    for (const panel of shell.querySelectorAll('.canvas-tools')) panel.open = true;
  }
}
