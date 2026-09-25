// Authored MathML stays accessible and needs no network request or TeX server.
const mi=(s:string)=>`<mi>${s}</mi>`;
const frac=(a:string,b:string)=>`<mfrac><mrow>${a}</mrow><mrow>${b}</mrow></mfrac>`;
const power=(a:string,b:string)=>`<msup><mrow>${a}</mrow><mrow>${b}</mrow></msup>`;
const sub=(a:string,b:string)=>`<msub><mi>${a}</mi><mrow>${b}</mrow></msub>`;
const int=(a:string,b:string)=>`<msubsup><mo>∫</mo><mrow>${a}</mrow><mrow>${b}</mrow></msubsup>`;
const math=(s:string)=>{
  // MathML requires numbers/text to live in token elements, including bounds.
  const stack:string[]=[];
  const normalized=s.split(/(<[^>]+>)/g).map(part=>{
    if(part.startsWith('</')){stack.pop();return part;}
    if(part.startsWith('<')){if(!part.endsWith('/>'))stack.push(part.match(/^<(\w+)/)?.[1]??'');return part;}
    if(!part.trim()||['mi','mo','mn','mtext'].includes(stack[stack.length-1]))return part;
    return /^[-−\d/. ]+$/.test(part)?`<mn>${part}</mn>`:`<mtext>${part}</mtext>`;
  }).join('');
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${normalized}</math>`;
};
const r=mi('r'),s=mi('s'),R=mi('R'),E=mi('E'),Q=mi('Q'),rho=mi('ρ'),pi=mi('π'),th=mi('θ'),eps=sub('ε','0');
const r2=power(r,'2'),s2=power(s,'2'),R3=power(R,'3'),u=mi('u'),root=`<msqrt>${u}</msqrt>`;
const D=`${r2}<mo>+</mo>${s2}<mo>−</mo>2${r}${s}<mi>cos</mi>${th}`;
export type Line={at:number;html:string;kind?:'small'|'explain'|'result'};
export type Story={kicker:string;title:string;lines:Line[]};
export const story:Story[]=[
  {kicker:'01 / THE SETUP',title:'Charge everywhere.<br>What field, anywhere?',lines:[
    {at:6,html:math(`${rho}<mo>=</mo>${frac(Q,`${frac('4','3')}${pi}${R3}`)}`)},
    {at:9,html:'A uniform <span class="blue">volume</span> charge density.',kind:'explain'},
    {at:12,html:math(`${E}<mo>(</mo>${r}<mo>)</mo><mo>=</mo><mo>?</mo>`),kind:'result'},
  ]},
  {kicker:'02 / COULOMB’S LAW',title:'Start with one<br><span class="blue">tiny piece.</span>',lines:[
    {at:0,html:math(`<mi>d</mi><mi>q</mi><mo>=</mo>${rho}<mi>d</mi><mi>V</mi>`)},
    {at:4,html:math(`<mi>d</mi><mi>V</mi><mo>=</mo>${s2}<mi>sin</mi>${th}<mi>d</mi>${s}<mi>d</mi>${th}<mi>d</mi><mi>φ</mi>`),kind:'small'},
    {at:8,html:math(`<mi>d</mi><mover>${E}<mo>→</mo></mover><mo>=</mo>${frac(`<mi>d</mi><mi>q</mi>`,`4${pi}${eps}`)}${frac(`<mover><mi>ℓ</mi><mo>→</mo></mover>`,power(mi('ℓ'),'3'))}`)},
    {at:12,html:'Source radius <span class="pink">s</span>. Observation radius <span class="yellow">r</span>.<br>Separation ℓ between source and observation.',kind:'explain'},
  ]},
  {kicker:'03 / SYMMETRY',title:'Sideways contributions<br><span class="blue">cancel in pairs.</span>',lines:[
    {at:1,html:math(`<mover>${E}<mo>→</mo></mover><mo>=</mo>${E}<mo>(</mo>${r}<mo>)</mo><mover>${r}<mo>^</mo></mover>`)},
    {at:5,html:math(`${power(mi('ℓ'),'2')}<mo>=</mo>${D}`),kind:'small'},
    {at:9,html:math(`<mi>d</mi>${sub('E',r)}<mo>=</mo>${frac(`<mi>d</mi><mi>q</mi>`,`4${pi}${eps}`)}${frac(`${r}<mo>−</mo>${s}<mi>cos</mi>${th}`,power(mi('ℓ'),'3'))}`),kind:'small'},
    {at:12,html:'Only the component along the center–observer axis survives.',kind:'explain'},
  ]},
  {kicker:'04 / SUM EVERY VOLUME ELEMENT',title:'Now add up<br><span class="blue">the whole ball.</span>',lines:[
    {at:1,html:math(`${E}<mo>(</mo>${r}<mo>)</mo><mo>=</mo>${frac(rho,`4${pi}${eps}`)}${int('0',R)}${int('0',pi)}${int('0',`2${pi}`)}${frac(`<mo>(</mo>${r}<mo>−</mo>${s}<mi>cos</mi>${th}<mo>)</mo>${s2}<mi>sin</mi>${th}`,power(`<mo>(</mo>${D}<mo>)</mo>`,frac('3','2')))}<mi>d</mi><mi>φ</mi><mi>d</mi>${th}<mi>d</mi>${s}`),kind:'small'},
    {at:7,html:math(`${int('0',`2${pi}`)}<mi>d</mi><mi>φ</mi><mo>=</mo>2${pi}`)},
    {at:12,html:math(`${E}<mo>(</mo>${r}<mo>)</mo><mo>=</mo>${frac(rho,`2${eps}`)}${int('0',R)}${s2}<mi>I</mi><mo>(</mo>${r}<mo>,</mo>${s}<mo>)</mo><mi>d</mi>${s}`)},
    {at:17,html:'The azimuthal angle is done.<br>All the geometry is now in the polar integral I.',kind:'explain'},
  ]},
  {kicker:'05 / THE ANGULAR INTEGRAL',title:'A substitution<br>untangles the geometry.',lines:[
    {at:0,html:math(`<mi>I</mi><mo>=</mo>${int('0',pi)}${frac(`<mo>(</mo>${r}<mo>−</mo>${s}<mi>cos</mi>${th}<mo>)</mo><mi>sin</mi>${th}`,power(`<mo>(</mo>${D}<mo>)</mo>`,frac('3','2')))}<mi>d</mi>${th}`),kind:'small'},
    {at:5,html:math(`${u}<mo>=</mo>${D}<mo>,</mo><mspace width=".5em"/><mi>d</mi>${u}<mo>=</mo>2${r}${s}<mi>sin</mi>${th}<mi>d</mi>${th}`),kind:'small'},
    {at:10,html:math(`<mi>I</mi><mo>=</mo>${frac('1',`4${r2}${s}`)}${int(power(`<mo>(</mo>${r}<mo>−</mo>${s}<mo>)</mo>`,'2'),power(`<mo>(</mo>${r}<mo>+</mo>${s}<mo>)</mo>`,'2'))}<mo>[</mo><mo>(</mo>${r2}<mo>−</mo>${s2}<mo>)</mo>${power(u,'−3/2')}<mo>+</mo>${power(u,'−1/2')}<mo>]</mo><mi>d</mi>${u}`),kind:'small'},
    {at:16,html:math(`<mi>I</mi><mo>=</mo>${frac('1',`2${r2}${s}`)}<msubsup><mrow><mo>[</mo>${root}<mo>−</mo>${frac(`${r2}<mo>−</mo>${s2}`,root)}<mo>]</mo></mrow><mrow>${power(`<mo>(</mo>${r}<mo>−</mo>${s}<mo>)</mo>`,'2')}</mrow><mrow>${power(`<mo>(</mo>${r}<mo>+</mo>${s}<mo>)</mo>`,'2')}</mrow></msubsup>`),kind:'small'},
    {at:21,html:'At the lower bound, √((r − s)²) = |r − s|.<br>That absolute value creates the two cases.',kind:'explain'},
  ]},
  {kicker:'06 / THE SHELL RESULT',title:'Outer shells cancel.<br>Inner shells contribute.',lines:[
    {at:0,html:math(`<mi>I</mi><mo>=</mo>${frac(`2${s}<mo>−</mo><mo>(</mo><mo>|</mo>${r}<mo>−</mo>${s}<mo>|</mo><mo>−</mo>${frac(`${r2}<mo>−</mo>${s2}`,`<mo>|</mo>${r}<mo>−</mo>${s}<mo>|</mo>`)}<mo>)</mo>`,`2${r2}${s}`)}`),kind:'small'},
    {at:4,html:math(`<mi>I</mi><mo>=</mo><mo>{</mo><mtable columnalign="left" rowspacing=".4em"><mtr><mtd>${frac('2',r2)}</mtd><mtd><mtext>if </mtext>${s}<mo>&lt;</mo>${r}</mtd></mtr><mtr><mtd>0</mtd><mtd><mtext>if </mtext>${s}<mo>&gt;</mo>${r}</mtd></mtr></mtable>`),kind:'result'},
    {at:9,html:'Move the observer inside a shell.<br>Its net electric field becomes exactly zero.',kind:'explain'},
    {at:14,html:'At s = r, I = 1/r²; this single shell has zero measure in ds. At r = 0, symmetry gives E = 0.',kind:'explain'},
  ]},
  {kicker:'07 / THE RADIAL INTEGRAL',title:'Only charge closer<br>than the observer counts.',lines:[
    {at:1,html:math(`${E}<mo>(</mo>${r}<mo>)</mo><mo>=</mo>${frac(rho,`${eps}${r2}`)}${int('0',`<mi>min</mi><mo>(</mo>${r}<mo>,</mo>${R}<mo>)</mo>`)}${s2}<mi>d</mi>${s}`)},
    {at:6,html:math(`<mo>=</mo>${frac(rho,`${eps}${r2}`)}<msubsup><mrow><mo>[</mo>${frac(power(s,'3'),'3')}<mo>]</mo></mrow><mn>0</mn><mrow><mi>min</mi><mo>(</mo>${r}<mo>,</mo>${R}<mo>)</mo></mrow></msubsup>`)},
    {at:11,html:math(`<mo>=</mo>${frac(`${rho}${power(`<mi>min</mi><mo>(</mo>${r}<mo>,</mo>${R}<mo>)</mo>`,'3')}`,`3${eps}${r2}`)}`),kind:'result'},
    {at:15,html:'The angular cancellation came from Coulomb’s law.<br>No Gaussian surface was needed.',kind:'explain'},
  ]},
  {kicker:'08 / TWO REGIONS, ONE FIELD',title:'Growing inside.<br>Falling outside.',lines:[
    {at:0,html:math(`${E}<mo>(</mo>${r}<mo>)</mo><mo>=</mo><mo>{</mo><mtable columnalign="left" rowspacing=".5em"><mtr><mtd>${frac(`${Q}${r}`,`4${pi}${eps}${R3}`)}</mtd><mtd><mtext>r ≤ R</mtext></mtd></mtr><mtr><mtd>${frac(Q,`4${pi}${eps}${r2}`)}</mtd><mtd><mtext>r ≥ R</mtext></mtd></mtr></mtable>`),kind:'result'},
    {at:5,html:'Inside: E ∝ r.<br>Outside: E ∝ 1/r².',kind:'explain'},
    {at:10,html:math(`<mi>E</mi><mo>(</mo>${R}<mo>)</mo><mo>=</mo>${frac(Q,`4${pi}${eps}${power(R,'2')}`)}`)},
    {at:13,html:'Both expressions meet at the surface.<br>The field points radially outward for Q > 0.',kind:'explain'},
  ]},
  {kicker:'09 / THE WHOLE PICTURE',title:'',lines:[]},
  {kicker:'10 / AN INDEPENDENT CHECK',title:'Gauss’s law<br>says the same thing.',lines:[
    {at:0,html:math(`<mo>∮</mo><mover>${E}<mo>→</mo></mover><mo>·</mo><mi>d</mi><mover><mi>A</mi><mo>→</mo></mover><mo>=</mo>${frac(sub('Q','enc'),eps)}`)},
    {at:3,html:math(`${E}<mo>(</mo>${r}<mo>)</mo><mo>·</mo>4${pi}${r2}<mo>=</mo>${frac(sub('Q','enc'),eps)}`)},
    {at:6,html:math(`${sub('Q','enc')}<mo>=</mo>${rho}${frac('4','3')}${pi}${power(`<mi>min</mi><mo>(</mo>${r}<mo>,</mo>${R}<mo>)</mo>`,'3')}`),kind:'small'},
    {at:9,html:'Same field. A much shorter route.<br>Now you know what the symmetry is hiding.',kind:'explain'},
  ]},
];
export const narration:[number,string][]=[
  [0,'How do infinitely many little charges add up to one electric field?'],
  [6,'Imagine a solid ball, with positive charge spread uniformly throughout its volume.'],
  [12,'We want the field at any distance r from its center—inside and outside.'],
  [16,'Pick a tiny source element dq. Its location has spherical coordinates s, θ, and φ.'],
  [21,'The volume element is s² sin θ ds dθ dφ. Multiply by ρ to get its charge.'],
  [27,'Coulomb’s law gives this element’s contribution along the separation vector ℓ.'],
  [34,'For every sideways contribution, symmetry provides an equal and opposite one.'],
  [40,'Only the component along the radial axis remains.'],
  [45,'Project the separation onto that axis: r − s cos θ.'],
  [50,'Sum that radial contribution over every source element in the ball.'],
  [57,'Nothing depends on φ. Its integral simply gives 2π.'],
  [64,'Call the remaining angular integral I(r, s). Let’s actually evaluate it.'],
  [72,'The denominator contains the squared separation. Use it as our new variable u.'],
  [78,'Then du = 2rs sin θ dθ, and the numerator becomes (r² − s² + u) / (2r).'],
  [83,'The angular limits become (r − s)² and (r + s)². Only powers of u remain.'],
  [89,'Integrate u to the powers −3/2 and −1/2.'],
  [94,'Be careful: the square root of (r − s)² is the absolute value |r − s|.'],
  [98,'When s < r, evaluating the bounds gives I = 2/r².'],
  [105,'When s > r, the bounds cancel exactly. A shell produces no field anywhere inside it.'],
  [111,'This cancellation is the result of the integral—not an assumption from Gauss’s law.'],
  [116,'Only shells with s < r contribute. Stop at whichever is smaller: r or R.'],
  [122,'Now integrate s². Its antiderivative is s³/3.'],
  [128,'This compact expression already contains both regions.'],
  [136,'Inside the ball, the upper limit is r. The field grows linearly from zero.'],
  [144,'Outside, the upper limit is R. The whole ball acts like a point charge at its center.'],
  [153,'Let’s draw the result instead of just reading the formula.'],
  [157,'Start at the center. More enclosed charge means a steadily increasing field.'],
  [164,'At the surface, the two expressions meet. This is the maximum field.'],
  [168,'Move farther away: the field falls as one over r squared.'],
  [175,'One continuous field, built from all those tiny contributions.'],
  [178,'Now—and only now—use Gauss’s law as a check.'],
  [183,'The field is constant and normal on a concentric sphere, so the flux is E times 4πr².'],
  [188,'It gives exactly the same answer. Symmetry made a triple integral look simple.'],
];
