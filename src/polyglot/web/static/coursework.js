"use strict";
// A view over real compiler responses and explicitly whitelisted implementation evidence.
const PolyglotCoursework = (() => {
  function mount(context) {
    const {element: el, renderTable, sourceLink} = context;
    const panel = document.getElementById('coursework-panel'), body = document.getElementById('coursework-body');
    const navigation = document.getElementById('coursework-navigation'), opener = document.getElementById('coursework-open');
    let catalog, selected = 'lexical', traceIndex = 0, selectedFunction = 0, selectedBlock = 0, returnFocus = opener;
    const backgroundStates = new Map();
    function setBackgroundInert(inert) {
      if(inert) for(const node of document.body.children) {
        if(node===panel || node.tagName==='SCRIPT') continue;
        if(!backgroundStates.has(node)) backgroundStates.set(node,node.inert);
        node.inert=true;
      }
      else { for(const [node,value] of backgroundStates) node.inert=value; backgroundStates.clear(); }
    }
    const stateNames = {implemented:'Implemented',partial:'Partial',missing:'Not implemented'};
    function close() { panel.hidden = true; setBackgroundInert(false); returnFocus?.focus({preventScroll:true}); }
    async function open(module = selected) {
      selected = module; returnFocus = document.activeElement; panel.hidden = false; setBackgroundInert(true);
      document.getElementById('coursework-close').focus();
      if (!catalog) {
        body.replaceChildren(el('p','Loading implementation evidence…'));
        try {
          const response = await fetch('/api/syllabus');
          if (!response.ok) throw new Error('Source evidence could not be loaded.');
          catalog = await response.json();
        } catch (error) {
          const retry = el('button','Retry'); retry.addEventListener('click',()=>open());
          body.replaceChildren(el('p',error.message),retry); return;
        }
      }
      render();
    }
    opener.addEventListener('click',()=>open());
    document.getElementById('coursework-close').addEventListener('click',close);
    panel.addEventListener('click',event=>{ if (event.target.closest('.source-link')) close(); }, {capture:true});
    document.addEventListener('keydown',event=>{
      if(panel.hidden) return;
      if(event.key==='Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if(event.key==='Tab') {
        const controls=[...panel.querySelectorAll('button,select,input,summary,[tabindex="0"]')].filter(n=>!n.disabled && !n.hidden && n.getClientRects().length);
        const first=controls[0], last=controls.at(-1);
        if(event.shiftKey && document.activeElement===first) { event.preventDefault(); last?.focus(); }
        else if(!event.shiftKey && document.activeElement===last) { event.preventDefault(); first?.focus(); }
      }
    },{capture:true});
    function button(text, handler, className='') { const b=el('button',text,className); b.addEventListener('click',handler); return b; }
    function disclosure(parent,title,content,open=false) {
      const d=el('details',undefined,'course-disclosure'); d.open=open; d.append(el('summary',title));
      if(typeof content==='function') {
        let populated=false;
        const populate=()=>{if(d.open&&!populated){populated=true;content(d);}};
        d.addEventListener('toggle',populate); if(open) populate();
      } else d.append(content);
      parent.append(d); return d;
    }
    function sourceEvidence(parent,module) {
      disclosure(parent,'See the actual implementation',host=>{
        for(const key of module.evidence) {
          const item=catalog.sources[key];
          disclosure(host,`${item.name} · ${item.file}:${item.line}`,el('pre',item.code,'implementation-code'));
        }
      });
    }
    function renderTrace(parent, report) {
      const events=report?.trace?.events;
      if(!events?.length) { parent.append(el('p','Record a run to inspect real activation records before each captured instruction.')); return; }
      traceIndex=Math.max(0,Math.min(traceIndex,events.length-1));
      const event=events[traceIndex], controls=el('div',undefined,'trace-controls');
      const previous=button('Previous instruction',()=>{traceIndex--;render();}), next=button('Next instruction',()=>{traceIndex++;render();});
      previous.disabled=traceIndex===0; next.disabled=traceIndex===events.length-1;
      const scrubber=el('input'); scrubber.type='range'; scrubber.min=0; scrubber.max=events.length-1; scrubber.value=traceIndex;
      scrubber.setAttribute('aria-label','Recorded VM instruction');
      scrubber.addEventListener('input',()=>{traceIndex=Number(scrubber.value);render();body.querySelector('input[type=range]')?.focus({preventScroll:true});});
      const calls=el('select'); calls.setAttribute('aria-label','Jump to recorded call or return'); calls.append(new Option('Jump to a call / return…',''));
      events.forEach((e,i)=>{if(['CALL','RETURN_VALUE','RETURN_VOID'].includes(e.op)) calls.append(new Option(`#${e.step} ${e.function} · ${e.op}`,String(i)));});
      calls.addEventListener('change',()=>{if(calls.value!==''){traceIndex=Number(calls.value);render();}});
      controls.append(previous,el('strong',`${traceIndex+1} / ${events.length} recorded`),next,scrubber,calls); parent.append(controls);
      const current=el('div',undefined,'trace-current');
      current.append(el('strong',`Step ${event.step} · ${event.function} · #${event.ip} ${event.op}`),el('code',JSON.stringify(event.args)),sourceLink(event.source,true)); parent.append(current);
      parent.append(el('p',`State before this instruction · ${event.depth} active frame(s). ${report.trace.truncated?'Only the recorded prefix is shown; later execution is not captured.':'Complete recorded run.'} Values are bounded previews.`, 'course-note'));
      if(event.frames_omitted) parent.append(el('p',`${event.frames_omitted} older frames omitted from the preview.`));
      const frames=el('div',undefined,'activation-frames');
      event.frames.forEach((frame,i)=>{
        const card=el('section',undefined,'activation-frame');
        card.append(el('h4',`${i===event.frames.length-1?'Current':'Caller'} · ${frame.function}`),el('p',`Instruction pointer: ${frame.ip} · locals omitted: ${frame.locals_omitted} · stack values omitted: ${frame.stack_omitted}`,'course-note'));
        const state=context.getState(), fn=state.stages.ir?.find(f=>f.name===frame.function);
        const binding=slot=>{
          const symbol=state.stages.symbols?.find(s=>s.storage==='local'&&s.owner===fn?.id&&s.slot===slot);
          return symbol?`${symbol.name} : ${symbol.type}`:fn&&slot>=fn.local_count?`temporary t${slot-fn.local_count}`:'local slot';
        };
        renderTable(card,['Local slot','Binding','Value preview'],frame.locals.map((v,n)=>[n,binding(n),JSON.stringify(v)]));
        card.append(el('p','Operand stack · bottom → top','course-note'),el('pre',JSON.stringify(frame.stack,null,2),'stack-preview')); frames.append(card);
      }); parent.append(frames);
      disclosure(parent,'Shared global slots',host=>renderTable(host,['Slot','Value preview'],event.globals.map((v,i)=>[i,JSON.stringify(v)])));
    }
    function cfgDiagram(parent, fn) {
      const visible=fn.blocks.slice(0,24), positions=new Map();
      visible.forEach((b,i)=>positions.set(b.id,{x:30+(i%2)*290,y:28+Math.floor(i/2)*116}));
      const wrapper=el('div',undefined,'cfg-scroll'), scene=el('div',undefined,'cfg-scene');
      const height=54+Math.ceil(visible.length/2)*116; scene.style.width='590px'; scene.style.height=height+'px';
      const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg'); svg.setAttribute('width','590');svg.setAttribute('height',height);svg.setAttribute('aria-hidden','true');svg.classList.add('cfg-edges');
      const defs=document.createElementNS(ns,'defs'), marker=document.createElementNS(ns,'marker'), tip=document.createElementNS(ns,'path');
      marker.setAttribute('id','course-cfg-arrow');marker.setAttribute('viewBox','0 0 8 8');marker.setAttribute('refX','8');marker.setAttribute('refY','4');marker.setAttribute('markerWidth','7');marker.setAttribute('markerHeight','7');marker.setAttribute('orient','auto');
      tip.setAttribute('d','M 0 0 L 8 4 L 0 8 Z');marker.append(tip);defs.append(marker);svg.append(defs);
      for(const edge of fn.edges) {
        const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b) continue;
        const path=document.createElementNS(ns,'path');
        const same=a.y===b.y, back=fn.back_edges.some(e=>e.from===edge.from&&e.to===edge.to);
        path.setAttribute('d',same?`M ${a.x+220} ${a.y+32} C ${a.x+255} ${a.y-20}, ${b.x-25} ${b.y-20}, ${b.x} ${b.y+32}`:
          `M ${a.x+110} ${a.y+72} C ${a.x+110+(back?95:0)} ${a.y+100}, ${b.x+110+(back?95:0)} ${b.y-36}, ${b.x+110} ${b.y}`);
        path.setAttribute('marker-end','url(#course-cfg-arrow)');
        if(back) path.classList.add('cfg-back-edge'); svg.append(path);
      }
      scene.append(svg);
      for(const block of visible) {
        const p=positions.get(block.id), card=button('',()=>{selectedBlock=block.id;render();},'cfg-block');
        card.style.left=p.x+'px';card.style.top=p.y+'px';card.setAttribute('aria-label',`Inspect basic block B${block.id}`);card.setAttribute('aria-pressed',String(block.id===selectedBlock));
        card.append(el('strong',`B${block.id} · #${block.start}–${block.end-1}`),el('small',block.successors.length?`→ ${block.successors.map(n=>'B'+n).join(', ')}`:'Exit'),el('small',block.reachable?'Reachable':'Unreachable'));scene.append(card);
      }
      wrapper.append(scene); parent.append(wrapper);
      parent.append(el('p',`${visible.length} of ${fn.blocks.length} blocks drawn. Direction is listed on each block and in the edge table; rose edges are natural-loop back edges.`,'course-note'));
    }
    function renderAnalysis(parent, stages, report) {
      if(!report?.analysis) {parent.append(el('p','Analyze the current program to calculate blocks and data flow from its real IR.'));return;}
      const functions=report.analysis.functions, selector=el('select');selector.setAttribute('aria-label','Analysis function');
      functions.forEach((f,i)=>selector.append(new Option(f.name,String(i))));selectedFunction=Math.min(selectedFunction,functions.length-1);selector.value=String(selectedFunction);
      selector.addEventListener('change',()=>{selectedFunction=Number(selector.value);selectedBlock=0;render();});parent.append(selector);
      const fn=functions[selectedFunction];if(fn.omitted){parent.append(el('p',fn.omitted));return;}
      selectedBlock=Math.min(selectedBlock,fn.blocks.length-1);
      parent.append(el('p',`${fn.blocks.length} basic blocks · ${fn.edges.length} edges · ${fn.back_edges.length} natural-loop back edges · ${fn.worklist_visits} worklist visits`,'course-note'));
      const grid=el('div',undefined,'analysis-grid'), diagram=el('div'), facts=el('div',undefined,'analysis-facts');
      grid.append(diagram,facts);parent.append(grid);cfgDiagram(diagram,fn);
      const block=fn.blocks[selectedBlock], ir=stages.ir.find(f=>f.id===fn.id);
      facts.append(el('h4',`B${block.id}: data-flow facts`));
      renderTable(facts,['Set','IR temporaries'],[['USE',block.use],['DEF',block.def],['IN',block.live_in],['OUT',block.live_out]].map(([name,set])=>[name,set.map(n=>'t'+n).join(', ')||'∅']));
      parent.append(el('p',report.analysis.equations.join(' · '),'course-equation'),el('p',report.analysis.domain+' '+report.analysis.note,'course-note'));
      disclosure(facts,`B${block.id}: instructions and next use after each instruction`,host=>{
        renderTable(host,['#','Instruction','Next use after instruction','Source'],block.rows.map(row=>[row.index,context.irText(ir.instructions[row.index],stages.ir),row.next.map(n=>`t${n.temp} → ${n.at!==null?'#'+n.at:n.live_out?'live-out':'dead'}`).join('; '),'']),block.rows.map(row=>ir.instructions[row.index].source));
      },true);
      disclosure(parent,'Control-flow edges',host=>renderTable(host,['From','To','Kind'],fn.edges.map(edge=>['B'+edge.from,'B'+edge.to,edge.kind])));
    }
    function renderEvidence(parent,module,state) {
      const {stages,report}=state;
      if(module.id==='optimization') {renderAnalysis(parent,stages,report);return;}
      if(module.id==='generation') {renderTrace(parent,report);return;}
      if(module.id==='lexical' && stages.tokens) {
        renderTable(parent,['Kind','Lexeme','Decoded attribute','Position'],stages.tokens.map(t=>[t.kind,JSON.stringify(t.text),JSON.stringify(t.value),'' ]),stages.tokens.map(t=>t.span));return;
      }
      if(module.id==='syntax') {
        parent.append(el('p','Actual Pratt binding powers. Larger values bind more tightly; recursive parsing uses power + 1 for the right operand, making these binary operators left-associative.'));
        renderTable(parent,['Operator','Binding power'],Object.entries(catalog.precedence));
        if(stages.ast) parent.append(button('Open connected AST',()=>{close();context.selectStage('ast');})); return;
      }
      if(module.id==='semantics' && stages.ast && stages.symbols) {
        const nodes=context.astIndex(stages.ast).filter(n=>n.node.meta?.type!==undefined);
        parent.append(el('p','Attributes are read from checked AST metadata; these are not invented evaluation steps.'));
        renderTable(parent,['Node','Name / operator','Type','Binding / storage','Source'],nodes.map(({node})=>[node.kind,node.data.name??node.data.op??'',node.meta.type,node.meta.symbol===undefined?'—':`symbol ${node.meta.symbol} · ${node.meta.storage}[${node.meta.slot}]`,'']),nodes.map(({node})=>node.span));return;
      }
      if(module.id==='intermediate' && stages.ir) {
        for(const fn of stages.ir) disclosure(parent,`${fn.name}: typed three-address code`,host=>renderTable(host,['#','Three-address code','Source'],fn.instructions.map((i,n)=>[n,context.irText(i,stages.ir),'']),fn.instructions.map(i=>i.source)),fn===stages.ir[0]);
        parent.append(button('Compare generated bytecode',()=>{close();context.selectStage('bytecode');}));return;
      }
      parent.append(el('p','Compile source to see live evidence for this module. Failed or unavailable stages stay unavailable; the original diagnostic remains in Output.'));
    }
    function render() {
      if(panel.hidden||!catalog)return;
      const oldScroll=body.scrollTop, state=context.getState(), module=catalog.modules.find(m=>m.id===selected)||catalog.modules[0];selected=module.id;
      navigation.replaceChildren();
      catalog.modules.forEach((m,i)=>{
        const b=button('',()=>{selected=m.id;body.scrollTop=0;render();navigation.querySelector('[aria-current="true"]')?.focus({preventScroll:true});},'course-module');b.setAttribute('aria-current',String(m.id===selected));
        b.append(el('small',`MODULE ${i+1}`),el('strong',m.title));navigation.append(b);
      });
      body.replaceChildren(el('h3',module.title),el('p',module.summary,'course-lead'));
      const counts=el('div',undefined,'coverage-counts');
      for(const [status,label] of Object.entries(stateNames)) counts.append(el('span',`${module.topics.filter(t=>t.status===status).length} ${label.toLowerCase()}`,'coverage-status '+status));
      body.append(counts);
      const actions=el('div',undefined,'course-actions');
      const analyze=button('Analyze current program',()=>context.analyze()); analyze.disabled=state.busy;
      const record=button('Record current VM run',()=>context.record());record.disabled=state.busy;
      const demo=button(`Load ${module.example}`,()=>context.loadExample(module));demo.disabled=state.busy;
      actions.append(analyze,record,demo);body.append(actions,el('p',`Current source: ${state.filename}${state.busy?' · working…':''}. Demonstrations replace source only through the existing edited-work guard.`,'course-note'));
      if(state.report && !state.report.ok) for(const diagnostic of state.report.diagnostics||[]) {
        const error=el('div',`${diagnostic.code}: ${diagnostic.message}`,'diagnostic');
        if(diagnostic.location) error.append(sourceLink(diagnostic.location,true));body.append(error);
      }
      const evidence=el('section',undefined,'course-live-evidence');evidence.append(el('h4','Live implementation evidence'));renderEvidence(evidence,module,state);body.append(evidence);
      const topics=el('section',undefined,'course-topics');topics.append(el('h4','Syllabus coverage'));
      module.topics.forEach(topic=>{
        const detail=el('details',undefined,'course-topic'),summary=el('summary');summary.append(el('span',topic.title),el('span',stateNames[topic.status],'coverage-status '+topic.status));detail.append(summary,el('p',topic.detail));topics.append(detail);
      });body.append(topics);sourceEvidence(body,module);body.scrollTop=oldScroll;
      navigation.querySelector('[aria-current="true"]')?.scrollIntoView?.({block:"nearest",inline:"nearest"});
    }
    return {refresh:render,close,open};
  }
  return Object.freeze({mount});
})();
