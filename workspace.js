import {projects} from './projects.js';
const select=document.getElementById('projects'),search=document.getElementById('search');
const frame=document.getElementById('workspace'),status=document.getElementById('workspace-status');
let active='';
function options(){
  const query=search.value.toLowerCase().trim();select.replaceChildren();
  const groups=new Map();
  for(const project of projects){
    if(!`${project.group} ${project.name}`.toLowerCase().includes(query))continue;
    if(!groups.has(project.group)){const group=document.createElement('optgroup');group.label=project.group;groups.set(project.group,group);select.append(group);}
    groups.get(project.group).append(new Option(project.name,project.id));
  }
  select.value=active;
}
function show(){
  let id='';try{id=decodeURIComponent(location.hash.slice(1));}catch{}
  const project=projects.find(p=>p.id===id)??projects[0];
  if(project.id===active)return;
  active=project.id;options();status.hidden=false;status.textContent=`Loading ${project.name}…`;
  document.title=`${project.name} · Edena`;
  const url=new URL(project.page,location.href);url.searchParams.set('embed','1');url.searchParams.set('project',project.canvas);
  const quality=new URLSearchParams(location.search).get('quality');if(quality)url.searchParams.set('quality',quality);
  if(frame.hasAttribute('src'))frame.contentWindow.location.replace(url.href);else frame.src=url.href;
  frame.title=project.name;
  document.getElementById('open-project').href=url.href;
  document.getElementById('project-description').textContent=project.group+' · '+project.name;
}
frame.addEventListener('load',()=>{status.hidden=true;});
select.addEventListener('change',()=>{location.hash=encodeURIComponent(select.value);});
search.addEventListener('input',options);addEventListener('hashchange',show);
const toggle=document.getElementById('toggle-projects');
function collapse(value){document.body.classList.toggle('collapsed',value);toggle.textContent=value?'›':'‹';toggle.setAttribute('aria-expanded',String(!value));toggle.setAttribute('aria-label',value?'Expand project column':'Collapse project column');}
toggle.addEventListener('click',()=>collapse(!document.body.classList.contains('collapsed')));
collapse(matchMedia('(max-width:700px)').matches);show();
