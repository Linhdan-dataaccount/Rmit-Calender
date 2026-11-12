import {today, monday, addDay, epoch, local, time, minutes, shortDate, parseCalendar, parseTimeline} from './calendar.js';

const icons = {
  layers:'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-12 5h2m3 0h2"/>',
  grid:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12m6-12v12"/>',
  flag:'<path d="M5 21V4m0 1c5-5 9 4 15-1v10c-6 5-10-4-15 1"/>',
  link:'<path d="M10 13a4 4 0 0 0 6 .5l4-4a4 4 0 0 0-6-6l-2 2m2 5a4 4 0 0 0-6-.5l-4 4a4 4 0 0 0 6 6l2-2"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M6 6l1 1m10 10 1 1M6 18l1-1M17 7l1-1"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevR:'<path d="m9 18 6-6-6-6"/>',chevL:'<path d="m15 18-6-6 6-6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>', arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  filter:'<path d="M4 7h16M7 12h10m-7 5h4"/>', refresh:'<path d="M20 11a8 8 0 1 0-2 6m2-12v6h-6"/>',
  check:'<path d="m5 12 4 4L19 6"/>'
};
const svg = name => '<svg viewBox="0 0 24 24" aria-hidden="true">'+(icons[name]||'')+'</svg>';
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=svg(el.dataset.icon));
const $ = s => document.querySelector(s);
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id = () => crypto.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2);
const colors = ['#3978dc','#139787','#75a622','#8758d4','#e4932e','#dc537a','#5269d9','#1481a5','#ae553b','#7d687f'];
const kinds = {deadline:'Deadline',milestone:'Mốc',work:'Giờ làm',event:'Sự kiện',task:'Việc cần làm'};
const kindShort = {deadline:'◆',milestone:'◇',work:'◷',event:'',task:'□'};
const groupTypes = {course:'Môn RMIT',competition:'Cuộc thi',club:'Dự án CLB',personal:'Cá nhân'};
const days = ['Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy','Chủ nhật'];
const sectionNames = {week:'Lịch tuần',semester:'Tổng quan kỳ',tasks:'Deadline & việc làm',groups:'Môn & dự án',sources:'Nguồn lịch'};
const storeKey = 'weekplan-v1';
const canvasId = 'rmit-canvas';
const canvasVersion = 2;
const current = today();
const firstWeek = monday(current);
const rmitSemester = {id:'rmit-2026-3',name:'RMIT · Semester 3, 2026',start:'2026-10-26',end:'2027-01-23',weeks:13};
const termEnd = term => term.end || addDay(monday(term.start),term.weeks*7-1);
const fullDate = date => shortDate(date)+'/'+date.slice(0,4);
const termRange = term => fullDate(term.start)+' – '+fullDate(termEnd(term));
const seedGroups = [
  {id:'bigdata',name:'Big Data',code:'ECON1612',color:colors[0],type:'course'},
  {id:'legal',name:'Legal & Technology',code:'LAW2619',color:colors[1],type:'course'},
  {id:'cf',name:'Corporate Finance',code:'BAFI3184',color:colors[2],type:'course'},
  {id:'comp',name:'Case Competition',color:colors[3],type:'competition'},
  {id:'club',name:'Workshop CLB',color:colors[4],type:'club'},
  {id:'cfa',name:'CFA',color:colors[5],type:'personal'}
];
function initial() {
  return {semester:rmitSemester,groups:seedGroups,sources:[],items:[]};
}
let state;
try { state=JSON.parse(localStorage.getItem(storeKey)) || initial(); } catch { state=initial(); }
if (!state.semesters) {
  const previous=state.semester;
  state.semesters=[rmitSemester];
  if (previous && previous.name!==rmitSemester.name && previous.name!=='RMIT · Semester 3') {
    state.semesters.push({...previous,id:id()});
  }
  state.semester=rmitSemester;
}
state.semester=state.semesters.find(term=>term.id===state.semester?.id) || state.semesters[0];
const termHidden=new Set(state.termHidden||[]);
const isSample = item => item.demo || item.id.startsWith('demo-');
const hadSamples = state.items.some(isSample);
if (hadSamples) {
  const sampleIds = new Set(state.items.filter(isSample).map(item=>item.id));
  state.items = state.items.filter(item=>!sampleIds.has(item.id))
    .map(item=>sampleIds.has(item.parent)?{...item,parent:''}:item);
}
const defaultTermWeek = () => current>=state.semester.start && current<=termEnd(state.semester) ? firstWeek : monday(state.semester.start);
let screen='week', week=defaultTermWeek(), hidden=new Set(), scope='', dragged=null, timer, syncingCanvas=false;
const groupFor = key => state.groups.find(g=>g.id===key) || {name:'Chưa phân nhóm',color:'#64748b'};
const colorFor = item => /^#[a-f0-9]{6}$/i.test(item.color||'') ? item.color : groupFor(item.group).color;
const sorted = rows => [...rows].sort((a,b)=>(a.start||'9999').localeCompare(b.start||'9999')||a.title.localeCompare(b.title));
const visible = () => state.items.filter(e=>!hidden.has(e.group) && (!scope||e.group===scope));
const dateOf = item => item.start?.slice(0,10)||'';
const cssColor = color => ' style="--c:'+color+'"';
const button = (label, attrs='', icon='', style='') => '<button type="button" class="btn '+style+'" '+attrs+'>'+(icon?svg(icon):'')+label+'</button>';
const slotTime = n => String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const spanEnd = item => item.end || (dateOf(item)?local(epoch(item.start)+(time(item.start)?3600000:86400000)):'');
const isBanner = item => !time(item.start) || !['work','event'].includes(item.kind);
const occursOn = (item,date) => !!item.start && (dateOf(item)===date || (date>dateOf(item)&&(!isBanner(item)||item.end)&&epoch(date)<epoch(spanEnd(item))));
const inWeek = item => !!item.start && dateOf(item)<=addDay(week,6) && (dateOf(item)>=week||((!isBanner(item)||item.end)&&epoch(spanEnd(item))>epoch(week)));
const weekday = date => Math.round((epoch(date)-epoch(monday(date)))/86400000);
function calendarRows(items,first,last) {
  return items.flatMap(item=>{
    const schedule=item.schedule;
    if (!schedule) return [item];
    const anchor=dateOf(item);
    const anchorWeek=monday(anchor);
    const finish=schedule.until && schedule.until<last ? schedule.until : last;
    const occurrences=[];
    for (let day=first<anchor?anchor:first;day<=finish;day=addDay(day,1)) {
      const weekOffset=Math.floor((epoch(day)-epoch(anchorWeek))/604800000);
      if (schedule.interval ? weekOffset%schedule.interval!==0 : weekOffset!==0) continue;
      const slot=schedule.days.find(slot=>slot.day===weekday(day));
      if (!slot) continue;
      const start=day+(slot.start?'T'+slot.start:'');
      const endDay=slot.end && slot.end<slot.start ? addDay(day,1) : day;
      const end=slot.end ? endDay+'T'+slot.end : '';
      occurrences.push({...item,start,end});
    }
    return occurrences;
  });
}
function overlaps(a,b) {
  return a.id!==b.id && !a.done && !b.done && !isBanner(a) && !isBanner(b) &&
    epoch(a.start)<epoch(spanEnd(b)) && epoch(b.start)<epoch(spanEnd(a));
}
function itemWarnings(item) {
  const issues = dateOf(item) && !isBanner(item)
    ? calendarRows(state.items,addDay(dateOf(item),-1),spanEnd(item).slice(0,10)).filter(other=>overlaps(item,other)).map(other=>'Trùng giờ với '+other.title)
    : [];
  const parent = state.items.find(e=>e.id===item.parent);
  if (parent?.start && item.start && (item.end||item.start) > (time(parent.start)?parent.start:parent.start+'T23:59')) issues.push('Nằm sau '+parent.title);
  return issues;
}
function save(message) {
  try { localStorage.setItem(storeKey,JSON.stringify(state)); } catch { toast('Trình duyệt không lưu được thay đổi.'); render(); return; }
  render();
  if (message) toast(message);
}
function toast(message) {
  $('#toast').textContent=message;
  clearTimeout(timer);
  timer=setTimeout(()=>$('#toast').textContent='',4300);
}
function intro(eyebrow,title,description,actions='') {
  return '<div class="intro"><div><p class="eyebrow">'+escape(eyebrow)+'</p><h1>'+escape(title)+'</h1><p>'+escape(description)+'</p></div><div class="actions">'+actions+'</div></div>';
}
const addButtons = () => button('Nhập lịch','data-act="import"','upload')+button('Thêm mục','data-act="new"','plus','primary');
function panel(title,body,actions='',subtitle='') {
  return '<section class="panel"><header class="panel-head"><div><h2>'+title+'</h2>'+(subtitle?'<p>'+subtitle+'</p>':'')+'</div><div class="actions">'+actions+'</div></header>'+body+'</section>';
}
function chip(item) {
  return '<span class="chip"'+cssColor(colorFor(item))+'><span class="dot"></span>'+escape(groupFor(item.group).name)+'</span>';
}
function event(item,layout='') {
  const problems = itemWarnings(item);
  return '<button type="button" class="event '+(layout?'timed ':'')+(item.done?'done ':'')+(problems.length?'conflict':'')+'" data-edit="'+escape(item.id)+'" '+(item.kind==='work'&&!item.schedule?'draggable="true" ':'')+
    'style="--c:'+colorFor(item)+';'+layout+'" title="'+escape(item.title+(problems.length?' · '+problems.join(' · '):''))+'"><b>'+
    (item.schedule?.interval?'↻ ':kindShort[item.kind]?kindShort[item.kind]+' ':'')+escape(item.title)+'</b>'+
    (time(item.start)?'<small>'+time(item.start)+(time(item.end)?'–'+time(item.end):'')+'</small>':'')+'</button>';
}
function stat(value,label,icon,accent,tint) {
  return '<div class="stat"><span class="stat-icon" style="--accent:'+accent+';--tint:'+tint+'">'+svg(icon)+'</span><div><strong>'+escape(value)+'</strong><small>'+label+'</small></div></div>';
}
function timedEvents(rows,date,startHour,endHour) {
  const top = startHour*60;
  const bottom = endHour*60;
  const range = bottom-top;
  const blocks = rows.filter(e=>!isBanner(e)&&occursOn(e,date)).map(item=>{
    const begin = dateOf(item)<date ? 0 : minutes(time(item.start));
    const end = spanEnd(item).slice(0,10)>date ? 1440 : minutes(time(spanEnd(item)));
    return {item,begin:Math.max(top,begin),end:Math.min(bottom,end)};
  }).filter(x=>x.end>x.begin).sort((a,b)=>a.begin-b.begin||a.end-b.end);
  const sections=[];
  for (const block of blocks) {
    let section=sections.at(-1);
    if (!section||section.end<=block.begin) { section={end:0,lanes:[],blocks:[]}; sections.push(section); }
    let lane=section.lanes.findIndex(end=>end<=block.begin);
    if (lane<0) lane=section.lanes.length;
    section.lanes[lane]=block.end;
    section.end=Math.max(section.end,block.end);
    section.blocks.push({...block,lane});
  }
  return sections.map(section=>section.blocks.map(({item,begin,end,lane})=>{
    const w=100/section.lanes.length;
    return event(item,'top:'+((begin-top)/range*100)+'%;height:'+((end-begin)/range*100)+'%;left:calc('+lane*w+'% + 2px);width:calc('+w+'% - 4px)');
  }).join('')).join('');
}
function weekPage() {
  const rows=calendarRows(visible(),addDay(week,-1),addDay(week,6)).filter(inWeek);
  const timed=rows.filter(e=>!isBanner(e));
  const hours=timed.map(e=>minutes(time(e.start))/60);
  const startHour=Math.min(6,Math.floor(Math.min(...hours)));
  const endHour=24;
  const dates=days.map((_,i)=>addDay(week,i));
  const weekNo=Math.floor((epoch(week)-epoch(monday(state.semester.start)))/604800000)+1;
  const calendar='<div class="calendar-scroll"><div class="calendar" style="--hours:'+(endHour-startHour)+'">'+
    '<div class="day-head"><span class="label">GMT+7</span>'+dates.map((d,i)=>'<div class="day '+(d===current?'today':'')+'"><span>'+days[i]+'</span><b>'+Number(d.slice(8,10))+'</b></div>').join('')+'</div>'+
    '<div class="all-day"><span class="label">Mốc / cả ngày</span>'+dates.map(d=>'<div class="all-cell" data-slot="'+d+'">'+sorted(rows.filter(e=>isBanner(e)&&occursOn(e,d))).map(e=>event(e)).join('')+'</div>').join('')+'</div>'+
    '<div class="time-grid"><div class="time-rail">'+Array.from({length:endHour-startHour},(_,i)=>'<div>'+slotTime((i+startHour)*60)+'</div>').join('')+'</div>'+
    dates.map(d=>'<div class="time-cell '+(d===current?'today':'')+'" data-slot="'+d+'" data-hour="'+startHour+'">'+timedEvents(rows,d,startHour,endHour)+'</div>').join('')+'</div><div class="time-grid calendar-end"><span>24:00</span></div></div></div>';
  const active=rows.filter(e=>!e.done);
  const workHours=active.filter(e=>e.kind==='work'&&time(e.start)).reduce((sum,e)=>sum+Math.max(0,Math.min(epoch(spanEnd(e)),epoch(addDay(week,7)))-Math.max(epoch(e.start),epoch(week))),0)/3600000;
  const stats='<div class="stats">'+stat(active.filter(e=>e.kind==='deadline').length,'Deadline tuần này','flag','#c52241','#fce9ee')+
    stat(active.filter(e=>e.kind==='event').length,'Lịch học & sự kiện','calendar','#4a55a6','#eeefff')+stat(Number(workHours.toFixed(1)).toLocaleString('vi-VN')+' giờ','Đã dành để làm bài','clock','#178378','#e1f5ef')+'</div>';
  const dateTitle=shortDate(week)+' – '+shortDate(dates[6])+'/'+dates[6].slice(0,4);
  const nav=button('','data-act="prev" aria-label="Tuần trước"','chevL','icon')+button('Hôm nay','data-act="today"')+button('','data-act="next" aria-label="Tuần sau"','chevR','icon');
  const termLabel=weekNo>0&&weekNo<=state.semester.weeks?'Tuần '+weekNo+' · ':'';
  return intro(state.semester.name,'Kế hoạch tuần','Kéo trên lịch để chọn khung giờ hoặc nhiều ngày.',button('Đổi kỳ','data-act="switch-term"','calendar')+addButtons())+stats+
    '<div class="layout">'+panel('<span class="week-title">'+escape(termLabel+dateTitle)+'</span>',calendar,nav)+
    '<aside class="rail">'+upcoming()+legend()+'</aside></div>';
}
function upcoming() {
  const rows=sorted(calendarRows(visible(),current,addDay(current,84)).filter(e=>e.start&&dateOf(e)>=current&&!e.done&&['deadline','milestone','event'].includes(e.kind))).slice(0,7);
  return panel('Sắp tới',rows.length?'<div class="upcoming">'+rows.map(e=>'<button class="up-row" data-edit="'+escape(e.id)+'"><span class="up-date"><b>'+Number(dateOf(e).slice(8,10))+'</b>Th '+Number(dateOf(e).slice(5,7))+'</span><span class="up-detail"'+cssColor(colorFor(e))+'><b>'+escape(e.title)+'</b><small>'+escape(kinds[e.kind]+(time(e.start)?' · '+time(e.start):''))+'</small></span></button>').join('')+'</div>':'<p class="empty">Chưa có sự kiện hay deadline sắp tới.</p>',button('','data-nav="tasks" aria-label="Xem việc làm"','arrow','icon quiet'));
}
function legend() {
  return panel('Màu theo môn & dự án','<div class="legend">'+state.groups.map(g=>'<label'+cssColor(g.color)+'><span class="dot"></span>'+escape(g.name)+'<input type="checkbox" data-filter="'+escape(g.id)+'" '+(hidden.has(g.id)?'':'checked')+'></label>').join('')+'</div>',button('','data-nav="groups" aria-label="Chỉnh môn và màu"','settings','icon quiet'));
}
function termWeek(rows,date,number,term) {
  const end=termEnd(term);
  const inTerm=day=>day>=term.start && day<=end;
  const dates=days.map((_,i)=>addDay(date,i));
  const singleDay=dates.map(()=>[]);
  const laneEnds=[];
  const bands=[];
  for (const item of rows) {
    const first=dates.findIndex(day=>inTerm(day) && occursOn(item,day));
    if (first<0) continue;
    const last=dates.findLastIndex(day=>inTerm(day) && occursOn(item,day));
    if (first===last && !occursOn(item,addDay(dates[first],-1)) && !occursOn(item,addDay(dates[first],1))) {
      singleDay[first].push(event(item));
      continue;
    }
    let lane=laneEnds.findIndex(end=>end<first);
    if (lane<0) lane=laneEnds.length;
    laneEnds[lane]=last;
    bands.push('<div class="term-band" style="grid-column:'+(first+2)+' / '+(last+3)+';grid-row:'+(lane+2)+'">'+event(item)+'</div>');
  }
  const week='<div class="term-week" style="grid-column:1;grid-row:1 / '+(laneEnds.length+3)+'"><button data-week="'+date+'">Tuần '+number+'</button>'+shortDate(date)+'</div>';
  const cells=dates.map((day,i)=>{
    if (!inTerm(day)) return '<div class="term-cell term-outside" style="grid-column:'+(i+2)+';grid-row:1 / '+(laneEnds.length+3)+'"></div>';
    const label=fullDate(day);
    return '<div class="term-cell" data-term-day="'+day+'" style="grid-column:'+(i+2)+';grid-row:1 / '+(laneEnds.length+3)+'"></div>'+
      '<button type="button" class="term-date" data-term-day="'+day+'" style="grid-column:'+(i+2)+'" aria-label="Thêm sự kiện ngày '+label+'">'+shortDate(day)+'</button>'+
      (singleDay[i].length?'<div class="term-items" style="grid-column:'+(i+2)+';grid-row:'+(laneEnds.length+2)+'">'+singleDay[i].join('')+'</div>':'');
  }).join('');
  return '<div class="term-row" style="--term-rows:29px '+(laneEnds.length?'repeat('+laneEnds.length+',auto) ':'')+'minmax(26px,1fr)">'+week+cells+bands.join('')+'</div>';
}
function semesterPage() {
  const term=state.semester;
  const begin=monday(term.start), end=termEnd(term);
  const rows=sorted(calendarRows(state.items.filter(item=>!termHidden.has(item.group||'')),addDay(begin,-1),end));
  const groups=[...state.groups];
  if (state.items.some(item=>!item.group)) groups.push({id:'',name:'Chưa phân nhóm',color:'#64748b'});
  const filters='<fieldset class="term-filters"><legend>Hiện môn & dự án</legend>'+groups.map(group=>
    '<label'+cssColor(group.color)+'><input type="checkbox" data-term-filter value="'+escape(group.id)+'" '+(termHidden.has(group.id)?'':'checked')+'><span class="dot"></span>'+escape(group.name)+'</label>').join('')+
    (termHidden.size?button('Hiện tất cả','data-act="reset-term-filter"'):'')+'</fieldset>';
  const grid='<div class="term-scroll"><div class="term-grid"><div class="term-row term-heading"><div class="term-head">Tuần</div>'+days.map(d=>'<div class="term-head">'+d+'</div>').join('')+'</div>'+
    Array.from({length:term.weeks},(_,w)=>termWeek(rows,addDay(begin,w*7),w+1,term)).join('')+'</div></div>';
  return intro('Học kỳ','Tổng quan kỳ','Bấm một ngày hoặc kéo qua nhiều ô để thêm sự kiện.',
    button('Đổi kỳ','data-act="switch-term"','calendar')+button('Thêm mục','data-act="new"','plus','primary'))+
    panel(escape(term.name),filters+grid,'',termRange(term));
}
function tasksPage() {
  const rows=sorted(visible().filter(e=>e.kind!=='event'));
  const table=rows.length?'<div class="table-scroll"><table><thead><tr><th>Việc / mốc</th><th>Môn / dự án</th><th>Thời gian</th><th>Phụ trách</th><th>Xong</th></tr></thead><tbody>'+
    rows.map(e=>'<tr><td><button class="text-button" data-edit="'+escape(e.id)+'">'+escape(e.title)+'</button><br><small>'+escape(kinds[e.kind])+'</small></td><td>'+chip(e)+'</td><td>'+(e.start?shortDate(e.start)+(time(e.start)?' · '+time(e.start):''):'Chưa lên lịch')+'</td><td>'+escape(e.owner||'—')+'</td><td><input type="checkbox" aria-label="Hoàn tất '+escape(e.title)+'" data-done="'+escape(e.id)+'" '+(e.done?'checked':'')+'></td></tr>').join('')+'</tbody></table></div>':'<p class="empty">Chưa có việc hay mốc trong bộ lọc này.</p>';
  const options='<select id="task-scope" aria-label="Lọc theo môn hoặc dự án">'+groupOptions(scope,true)+'</select>';
  return intro('Kế hoạch','Deadline & việc làm','Xem các hạn nộp, mốc nội bộ và việc chưa được xếp giờ.',addButtons())+panel('Danh sách việc',table,options);
}
function groupsPage() {
  return intro('Workspace','Môn & dự án','Đổi màu từng môn, cuộc thi hoặc dự án CLB. Màu áp dụng trên toàn bộ lịch.',button('Thêm môn / dự án','data-act="group"','plus','primary'))+
    '<div class="group-grid">'+state.groups.map(g=>'<section class="panel group-card"'+cssColor(g.color)+'><h2><span class="dot"></span> '+escape(g.name)+'</h2><p>'+escape(groupTypes[g.type]+(g.code?' · '+g.code:''))+'</p><div class="actions">'+
    button('Chỉnh','data-group="'+escape(g.id)+'"','settings')+button('Xem việc','data-scope="'+escape(g.id)+'"','arrow')+'</div></section>').join('')+'</div>';
}
function sourcesPage() {
  const rows=state.sources.map(s=>'<div class="source-row"><div><b>'+escape(s.name)+'</b><small>'+escape(s.id===canvasId?'Canvas RMIT':new URL(s.url).hostname)+' · '+state.items.filter(e=>e.feed===s.id).length+' mục</small></div><div class="actions">'+button('Cập nhật','data-sync="'+escape(s.id)+'"','refresh')+button('Bỏ liên kết','data-unlink="'+escape(s.id)+'"','','danger')+'</div></div>').join('');
  return intro('Workspace','Nguồn lịch','Dán link đăng ký iCal hoặc tải file .ics để đưa lịch học lên Weekplan.',button('Nhập lịch','data-act="import"','upload','primary'))+
    panel('Link đã lưu',rows||'<p class="empty">Chưa có nguồn lịch.</p>',
      state.sources.some(s=>s.id===canvasId)?'':button('Tải deadline Canvas','data-act="canvas"','refresh'));
}
function render() {
  $('#crumb').textContent=sectionNames[screen];
  document.querySelectorAll('nav [data-nav]').forEach(b=>{
    const active=b.dataset.nav===screen;
    b.classList.toggle('active',active);
    if (active) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  const pages={week:weekPage,semester:semesterPage,tasks:tasksPage,groups:groupsPage,sources:sourcesPage};
  $('#workspace').innerHTML=pages[screen]();
}

const modal=$('#modal');
const option = (value,label,selected) => '<option value="'+escape(value)+'" '+(value===selected?'selected':'')+'>'+escape(label)+'</option>';
function groupOptions(selected, all=false) {
  return option('',all?'Tất cả môn & dự án':'Chưa phân nhóm',selected)+state.groups.map(g=>option(g.id,g.name,selected)).join('');
}
function kindOptions(selected) { return Object.entries(kinds).map(([key,label])=>option(key,label,selected)).join(''); }
function field(label,input) { return '<label class="field">'+label+input+'</label>'; }
function input(name,value='',type='text',extra='') { return '<input name="'+name+'" type="'+type+'" value="'+escape(value)+'" '+extra+'>'; }
const submit = label => '<button class="btn primary" type="submit">'+label+'</button>';
function show(title,body,actions='',wide=false) {
  modal.classList.toggle('wide',wide);
  modal.innerHTML='<form><header class="panel-head"><h2 class="dialog-title" id="dialog-title">'+title+'</h2>'+
    button('','data-act="close" aria-label="Đóng"','close','icon quiet')+'</header><div class="dialog-body">'+body+
    '</div>'+(actions?'<div class="dialog-actions">'+actions+'</div>':'')+'</form>';
  if (!modal.open) modal.showModal();
  return modal.querySelector('form');
}
function close() { modal.close(); }
function fail(form,message) { form.querySelector('.notice').textContent=message; }
function dateControl(name,value,label) {
  const display=value ? shortDate(value)+'/'+value.slice(0,4) : '';
  return '<div class="field"><label for="entry-'+name+'">'+label+'</label><div class="date-control">'+
    input(name,display,'text','id="entry-'+name+'" placeholder="DD/MM/YYYY" autocomplete="off"')+
    '<div class="date-picker">'+svg('calendar')+input(name+'Picker',value,'date','data-date-picker="'+name+'" aria-label="Mở lịch · '+label+'"')+'</div></div></div>';
}
function dateFields(item) {
  const start=item.start||'', end=item.end||'';
  const endDate=end ? (time(end)?end.slice(0,10):addDay(end.slice(0,10),-1)) : '';
  return '<div class="two">'+dateControl('date',start.slice(0,10),'Ngày bắt đầu / hạn nộp')+
    '<div data-single-date>'+dateControl('endDate',endDate,'Ngày kết thúc (nếu có)')+'</div></div>'+
    '<details data-single-time class="entry-details" '+(time(start)||time(end)||item.kind==='work'?'open':'')+'><summary>Giờ (không bắt buộc với sự kiện)</summary>'+
    '<div class="two">'+field('Giờ bắt đầu / hạn nộp',input('startTime',time(start),'time'))+
    field('Giờ kết thúc',input('endTime',time(end),'time'))+'</div></details>';
}
function parseEntryDate(value) {
  const trimmed=value.trim();
  if (!trimmed) return '';
  const match=trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso=match ? match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0') : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(epoch(iso)) || addDay(iso,0)!==iso) {
    throw new Error('Nhập ngày hợp lệ theo dạng DD/MM/YYYY.');
  }
  return iso;
}
function validatedDates(fd,kind) {
  const date=parseEntryDate(fd.get('date')), endDate=parseEntryDate(fd.get('endDate'));
  const begin=fd.get('startTime'), finish=fd.get('endTime');
  if (!date&&(kind!=='task'||begin||endDate||finish)) throw new Error('Chọn ngày trước khi lưu.');
  if (kind==='work'&&(!begin||!finish)) throw new Error('Giờ làm cần giờ bắt đầu và giờ kết thúc.');
  if (finish&&!begin) throw new Error('Chọn giờ bắt đầu.');
  if (endDate && endDate<date) throw new Error('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
  const start=date+(begin?'T'+begin:'');
  const end=finish ? (endDate||date)+'T'+finish : endDate ? addDay(endDate,1) : '';
  if (end && epoch(end)<=epoch(start)) throw new Error('Thời điểm kết thúc phải sau thời điểm bắt đầu.');
  return {start,end};
}
function scheduleFields(item) {
  const schedule=item.schedule;
  const mode=schedule ? (schedule.interval?'repeat':'week') : 'single';
  const anchor=dateOf(item)||current;
  const selected=schedule?.days || [{day:weekday(anchor),start:time(item.start),end:time(item.end)}];
  return field('Lịch biểu','<select name="scheduleMode">'+option('single','Một lần',mode)+
    option('week','Nhiều ngày trong một tuần',mode)+option('repeat','Lặp theo tuần',mode)+'</select>')+
    '<div class="schedule-fields" data-schedule-fields><div class="two" data-repeat-fields>'+
    field('Lặp mỗi (tuần)',input('repeatInterval',schedule?.interval||1,'number','min="1" max="12" step="1"'))+
    dateControl('repeatUntil',schedule?.until||'','Lặp đến ngày (nếu có)')+'</div>'+
    '<p class="hint">Chọn các ngày cần lên lịch. Có thể đặt giờ riêng hoặc để trống cả hai ô giờ cho từng ngày.</p>'+
    days.map((label,day)=>{
      const slot=selected.find(entry=>entry.day===day);
      return '<div class="schedule-day"><label><input type="checkbox" name="scheduleDay" value="'+day+'" '+(slot?'checked':'')+'>'+label+'</label>'+
        input('scheduleStart'+day,slot?.start||'','time','aria-label="Giờ bắt đầu '+label+'"')+
        input('scheduleEnd'+day,slot?.end||'','time','aria-label="Giờ kết thúc '+label+'"')+'</div>';
    }).join('')+'</div>';
}
function updateScheduleFields(form) {
  const mode=form.elements.scheduleMode.value;
  const single=mode==='single';
  const repeat=mode==='repeat';
  form.querySelector('[data-single-date]').hidden=!single;
  form.querySelector('[data-single-time]').hidden=!single;
  form.querySelector('[data-schedule-fields]').hidden=single;
  form.querySelector('[data-repeat-fields]').hidden=!repeat;
  form.elements.repeatInterval.disabled=!repeat;
  for (const [day,box] of [...form.querySelectorAll('[name=scheduleDay]')].entries()) {
    form.elements['scheduleStart'+day].disabled=!box.checked;
    form.elements['scheduleEnd'+day].disabled=!box.checked;
  }
}
function itemDates(fd,kind) {
  const mode=fd.get('scheduleMode');
  if (mode==='single') return {...validatedDates(fd,kind),schedule:undefined};
  const start=parseEntryDate(fd.get('date'));
  if (!start) throw new Error('Chọn ngày bắt đầu.');
  const interval=mode==='repeat' ? Number(fd.get('repeatInterval')) : 0;
  const until=interval ? parseEntryDate(fd.get('repeatUntil')) : addDay(monday(start),6);
  if (mode==='repeat' && (!Number.isInteger(interval)||interval<1||interval>12)) throw new Error('Nhập khoảng lặp từ 1 đến 12 tuần.');
  if (until && until<start) throw new Error('Ngày kết thúc lịch lặp phải từ ngày bắt đầu trở đi.');
  const slots=fd.getAll('scheduleDay').map(value=>{
    const day=Number(value);
    const begin=fd.get('scheduleStart'+day)||'';
    const end=fd.get('scheduleEnd'+day)||'';
    if (end&&!begin) throw new Error('Chọn giờ bắt đầu cho '+days[day].toLowerCase()+'.');
    if (begin&&begin===end) throw new Error('Giờ bắt đầu và kết thúc phải khác nhau vào '+days[day].toLowerCase()+'.');
    if (kind==='work'&&(!begin||!end)) throw new Error('Giờ làm cần đủ hai mốc giờ vào '+days[day].toLowerCase()+'.');
    return {day,start:begin,end};
  });
  if (!slots.length) throw new Error('Chọn ít nhất một ngày trong tuần.');
  const schedule={interval,until,days:slots};
  if (!calendarRows([{start,schedule}],start,until && until<addDay(start,84)?until:addDay(start,84)).length) {
    throw new Error('Các ngày đã chọn nằm ngoài khoảng lịch. Hãy chỉnh ngày bắt đầu hoặc kết thúc.');
  }
  return {start,end:'',schedule};
}
function editItem(existing={}, defaults={}) {
  const item={kind:'deadline',group:scope,...defaults,...existing};
  const linked=state.items.filter(e=>e.parent===item.id);
  const parents=state.items.filter(e=>e.id!==item.id&&['deadline','milestone','task'].includes(e.kind)&&!e.parent);
  const form=show(existing.schedule?'Chỉnh lịch nhiều ngày':existing.id?'Chỉnh mục':'Thêm mục vào lịch',
    field('Tên mục',input('title',item.title,'text','required maxlength="180" placeholder="Ví dụ: Nộp Corporate Finance ASM 1"'))+
    '<div class="two">'+field('Loại','<select name="kind">'+kindOptions(item.kind)+'</select>')+field('Môn / dự án','<select name="group">'+groupOptions(item.group)+'</select>')+'</div>'+
    dateFields(item)+scheduleFields(item)+
    '<details class="entry-details"><summary>Chi tiết và màu</summary><div class="two">'+field('Phụ trách',input('owner',item.owner,'text','maxlength="80" placeholder="Tên thành viên"'))+
    field('Liên kết với bài / mốc','<select name="parent">'+option('','Không liên kết',item.parent)+parents.map(e=>option(e.id,e.title,item.parent)).join('')+'</select>')+'</div>'+
    field('Ghi chú / link đề bài','<textarea name="notes" rows="2" maxlength="5000">'+escape(item.notes)+'</textarea>')+
    '<div class="two">'+field('<span><input type="checkbox" name="custom" '+(item.color?'checked':'')+'> Dùng màu riêng cho mục này</span>',input('color',colorFor(item),'color'))+
    field('<span><input type="checkbox" name="done" '+(item.done?'checked':'')+'> Đã hoàn tất</span>','')+'</div></details>'+
    '<div class="notice" role="alert">'+escape(itemWarnings(item).join(' · '))+'</div>'+
    (linked.length?'<div class="mini-list">'+sorted(linked).map(e=>event(e)).join('')+'</div>':'')+
    (item.id&&['deadline','milestone','task'].includes(item.kind)?'<div class="actions">'+
      button('Thêm mốc','data-child="milestone" data-parent="'+escape(item.id)+'"','plus')+
      button('Thêm giờ làm','data-child="work" data-parent="'+escape(item.id)+'"','plus')+
      button('Thêm việc','data-child="task" data-parent="'+escape(item.id)+'"','plus')+'</div>':''),
    (existing.id?button('Xóa mục','data-delete="'+escape(item.id)+'"','','danger'):'')+button('Hủy','data-act="close"')+submit('Lưu mục'));
  updateScheduleFields(form);
  form.addEventListener('change',e=>{
    if (['scheduleMode','scheduleDay'].includes(e.target.name)) updateScheduleFields(form);
  });
  form.onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(form);
    const kind=fd.get('kind');
    try {
      const title=fd.get('title').trim();
      if (!title) throw new Error('Nhập tên mục.');
      const update={...item,...itemDates(fd,kind),id:item.id||id(),title,kind,group:fd.get('group'),parent:fd.get('parent'),owner:fd.get('owner').trim(),
        notes:fd.get('notes').trim(),color:fd.has('custom')?fd.get('color'):'',done:fd.has('done'),demo:false};
      if (item.feed) {
        const fields=['title','start','end','kind','group','notes'];
        const overrides=fields.filter(key=>(item[key]??'')!==(update[key]??''));
        update.overrides=[...new Set([...(item.overrides||[]),...overrides])];
      }
      const problems=itemWarnings(update);
      if (existing.id) state.items=state.items.map(row=>row.id===existing.id?update:row);
      else state.items.push(update);
      if (update.start && screen==='week' && !existing.schedule) week=monday(dateOf(update));
      close();
      save(problems.length?'Đã lưu · '+problems.join(' · '):'Đã lưu '+update.title);
    } catch(error) { fail(form,error.message); }
  };
}
function editGroup(group={}) {
  const form=show(group.id?'Chỉnh môn / dự án':'Thêm môn / dự án',
    field('Tên',input('name',group.name,'text','required maxlength="85"'))+
    '<div class="two">'+field('Nhóm','<select name="type">'+Object.entries(groupTypes).map(([key,label])=>option(key,label,group.type)).join('')+'</select>')+
    field('Màu',input('color',group.color||colors[state.groups.length%colors.length],'color'))+'</div>'+
    field('Mã môn (nếu có)',input('code',group.code,'text','maxlength="20" placeholder="Ví dụ: BAFI3184"'))+'<div class="notice" role="alert"></div>',
    button('Hủy','data-act="close"')+submit('Lưu màu & tên'));
  form.onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(form);
    const name=fd.get('name').trim(), code=fd.get('code').trim().toUpperCase();
    if (!name) return fail(form,'Nhập tên môn hoặc dự án.');
    if (code&&state.groups.some(g=>g.id!==group.id&&g.code===code)) return fail(form,'Mã môn này đã có.');
    const update={id:group.id||id(),name,code,type:fd.get('type'),color:fd.get('color')};
    state.groups=group.id?state.groups.map(g=>g.id===group.id?update:g):[...state.groups,update];
    close(); save('Đã lưu '+name);
  };
}
function selectTerm(term) {
  state.semester=term;
  week=defaultTermWeek();
  close();
  save();
}
function chooseTerm() {
  show('Đổi học kỳ','<div class="term-choices">'+state.semesters.map(term=>
    button(escape(term.name)+'<small>'+termRange(term)+'</small>',
      'data-select-term="'+escape(term.id)+'" aria-pressed="'+(state.semester.id===term.id)+'"','','term-choice')).join('')+'</div>',
    (state.semester.id!==rmitSemester.id ? button('Chỉnh kỳ đang xem','data-act="term"','settings') : '')+
    button('Thêm học kỳ','data-act="new-term"','plus','primary'));
}
function editTerm(term={}) {
  const form=show(term.id?'Chỉnh kỳ học':'Thêm học kỳ',
    field('Tên kỳ',input('name',term.name,'text','required maxlength="70" placeholder="Ví dụ: Semester 1, 2027"'))+
    '<div class="two">'+dateControl('date',term.start||'','Ngày bắt đầu Tuần 1')+
    dateControl('endDate',term.id?termEnd(term):'','Ngày kết thúc')+'</div>'+
    '<div class="notice" role="alert"></div>',
    button('Quay lại','data-act="switch-term"')+submit('Lưu kỳ học'));
  form.onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(form);
    try {
      const start=parseEntryDate(fd.get('date')), end=parseEntryDate(fd.get('endDate'));
      if (!start || !end || end<start) throw new Error('Chọn ngày bắt đầu và ngày kết thúc hợp lệ.');
      const weeks=Math.floor((epoch(end)-epoch(monday(start)))/604800000)+1;
      if (weeks>30) throw new Error('Một học kỳ có thể dài tối đa 30 tuần.');
      const update={id:term.id||id(),name:fd.get('name').trim()||'RMIT',start,end,weeks};
      state.semesters=term.id ? state.semesters.map(t=>t.id===term.id?update:t) : [...state.semesters,update];
      selectTerm(update);
    } catch(error) { fail(form,error.message); }
  };
}
function chooseImport() {
  show('Nhập lịch', '<div class="import-options">'+
    button('Dán link calendar<small>Link iCal từ myTimetable hoặc lịch khác</small>','data-import="url"','link','import-option')+
    button('Tải file .ics<small>File lịch đã xuất</small>','data-import="file"','upload','import-option')+
    button('Ảnh timeline<small>Đọc mốc cuộc thi từ ảnh hoặc văn bản</small>','data-import="image"','image','import-option')+
    button('Nhập tay<small>Tự thêm deadline, mốc hoặc giờ làm</small>','data-act="new"','plus','import-option')+'</div>');
}
function normalizedUrl(value) {
  const parsed=new URL(value.trim().replace(/^webcal:\/\//i,'https://'));
  if (parsed.protocol!=='https:'||parsed.username||parsed.password) throw new Error('Dùng link đăng ký iCal HTTPS hợp lệ.');
  return parsed.href;
}
async function loadFeed(url) {
  let response;
  try {
    response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(3500)});
  } catch { /* Some feeds require the same-origin calendar endpoint. */ }
  if (response?.ok) {
    const text=await response.text();
    if (/^\s*BEGIN:VCALENDAR\b/i.test(text)) return text;
  }
  response=await fetch('/api/calendar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})});
  const text=await response.text();
  if (!response.ok) throw new Error(response.headers.get('content-type')?.startsWith('text/plain') ? text : 'Không đọc được link. M thử tải file .ics từ lịch gốc.');
  return text;
}
function importForm(type) {
  const isURL=type==='url', image=type==='image';
  const form=show(isURL?'Dán link calendar':image?'Nhập timeline cuộc thi':'Tải file .ics',
    (isURL?field('Link đăng ký iCal',input('url','','text','inputmode="url" required placeholder="webcal://… hoặc https://…"'))+
      '<p class="hint">Trong RMIT myTimetable, vào Settings → Preferences → Copy iCal subscription link.</p>':
    image?field('Tên cuộc thi',input('name','','text','maxlength="85" placeholder="Ví dụ: Case Competition"'))+
      '<div class="two">'+field('Chọn ảnh',input('file','','file','accept="image/*"'))+
      field('Năm cho mốc ghi thiếu năm',input('year','','number','min="2000" max="2100" placeholder="Ví dụ: 2026"'))+'</div>'+
      '<p class="hint">M có thể dán timeline dạng chữ. Mốc thiếu ngày sẽ cần xác nhận trước khi lưu.</p>'+
      field('Hoặc dán nội dung timeline','<textarea name="timeline" rows="4" placeholder="Nộp Round 1 · 20/11/2026"></textarea>'):
    field('Chọn file lịch',input('file','','file','accept=".ics,text/calendar" required'))) +'<div class="notice" role="alert"></div>',
    button('Quay lại','data-act="import"')+submit('Xem trước'));
  form.onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(form);
    const submitter=form.querySelector('[type=submit]');
    submitter.disabled=true;
    submitter.textContent='Đang đọc…';
    fail(form,'');
    try {
      const file=fd.get('file');
      if (file?.size>12_000_000) throw new Error('File quá lớn. Chọn file dưới 12 MB.');
      const url=isURL?normalizedUrl(fd.get('url')):'';
      let rows;
      if (image) {
        const raw=fd.get('timeline').trim() || (file?.size ? await readImage(file) : '');
        rows=parseTimeline(raw,fd.get('year'));
        if (!rows.length) throw new Error('Chưa tìm thấy mốc có ngày. M thử ảnh rõ hơn hoặc dán nội dung timeline.');
      } else {
        rows=parseCalendar(isURL?await loadFeed(url):await file.text(), {canvas:isURL&&new URL(url).hostname==='rmit.instructure.com'});
        if (!rows.length) throw new Error('Lịch này chưa có sự kiện hoặc deadline đọc được.');
      }
      if (form.isConnected&&modal.open) importPreview(rows,{url,type,name:image?(fd.get('name').trim()||'Timeline cuộc thi'):(isURL?new URL(url).hostname:file.name)});
    } catch(error) {
      if (form.isConnected) fail(form,error instanceof TypeError?'Link chưa hợp lệ. M copy link đăng ký iCal hoặc dùng file .ics.':error.message);
    } finally {
      submitter.disabled=false; submitter.textContent='Xem trước';
    }
  };
}
let ocr;
async function readImage(file) {
  if ('TextDetector' in window) {
    try {
      const bitmap=await createImageBitmap(file);
      try {
        const lines=await new TextDetector().detect(bitmap);
        if (lines.length) return lines.map(x=>x.rawValue).join('\n');
      } finally { bitmap.close(); }
    } catch { /* Use the OCR worker where the native detector is unavailable. */ }
  }
  try {
    if (!ocr) ocr=import('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js');
    const library=await ocr;
    const worker=await library.createWorker('eng+vie',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0'});
    try { return (await worker.recognize(file)).data.text; }
    finally { await worker.terminate(); }
  } catch {
    ocr=null;
    throw new Error('Chưa tải được bộ đọc ảnh. M dán phần chữ timeline để tiếp tục.');
  }
}

function suggestedGroup(row,meta) {
  if (row.group) return row.group;
  if (row.course) return state.groups.find(g=>g.code===row.course)?.id || 'course:'+row.course;
  const title=row.title.toLowerCase();
  const byName=state.groups.find(g=>g.name.length>2&&title.includes(g.name.toLowerCase()));
  return meta.type==='image' ? (state.groups.find(g=>g.name===meta.name&&g.type==='competition')?.id||'project') : (byName?.id||'project');
}
function matchingRow(row,feed) {
  return state.items.find(e=>row.sourceId&&(e.sourceId===row.sourceId&&(feed ? !e.feed||e.feed===feed.id : true)));
}
function importPreview(rows,meta) {
  const existingFeed=state.sources.find(s=>s.url===meta.url);
  const suggested = new Map([['project',meta.type==='image'?'Tạo dự án '+meta.name:'Tạo nhóm theo nguồn lịch']]);
  for (const row of rows) {
    row.existing=matchingRow(row,existingFeed);
    row.group=suggestedGroup(row.existing||row,meta);
    row.included=meta.type==='sync' ? Boolean(!row.existing||row.existing.start!==row.start||row.existing.end!==row.end||row.existing.title!==row.title) : !row.existing;
    if (row.group.startsWith('course:')) suggested.set(row.group,'Tạo môn '+row.course);
  }
  const options=key=>groupOptions(key)+[...suggested].map(([value,label])=>option(value,label,key)).join('');
  const form=show('Duyệt lịch trước khi lưu','<p class="hint">Chọn các mục muốn lưu. M có thể sửa tên, ngày giờ, loại và nhóm ở đây, hoặc mở từng mục để sửa chi tiết sau.</p>'+
    '<div class="actions">'+button('Chọn tất cả mục mới','data-preview-select="new"')+button('Bỏ chọn hết','data-preview-select="none"')+
    '<span class="hint" id="selected-count"></span></div><div class="preview-list">'+
    rows.map((r,index)=>'<div class="preview-row" data-row="'+index+'"><input type="checkbox" name="included" aria-label="Chọn '+escape(r.title)+'" '+(r.included?'checked':'')+'>'+
      input('title',r.title,'text','aria-label="Tên mục" maxlength="180"')+
      '<div class="two">'+input('date',r.start.slice(0,10),'date','aria-label="Ngày"')+input('time',time(r.start),'time','aria-label="Giờ"')+'</div>'+
      '<select name="kind" aria-label="Loại">'+kindOptions(r.kind)+'</select><select name="group" aria-label="Môn hoặc dự án">'+options(r.group)+'</select>'+
      (r.warning||r.existing?'<small>'+escape([r.existing?'Đã có trong lịch':null,r.warning].filter(Boolean).join(' · '))+'</small>':'')+'</div>').join('')+
    '</div><div class="notice" role="alert"></div>',button('Quay lại','data-act="import"')+submit('Lưu mục đã chọn'),true);
  const count=()=>form.querySelector('#selected-count').textContent=form.querySelectorAll('[name=included]:checked').length+' / '+rows.length+' mục được chọn';
  count();
  form.addEventListener('change',count);
  form.addEventListener('click',e=>{
    const mode=e.target.closest('[data-preview-select]')?.dataset.previewSelect;
    if (!mode) return;
    [...form.querySelectorAll('[name=included]')].forEach((box,i)=>box.checked=mode==='new'&&!rows[i].existing);
    count();
  });
  form.onsubmit=e=>{
    e.preventDefault();
    try {
      const selected=[...form.querySelectorAll('.preview-row')].filter(el=>el.querySelector('[name=included]').checked);
      if (!selected.length) throw new Error('Chọn ít nhất một mục để lưu.');
      const updates=selected.map(el=>{
        const data=rows[Number(el.dataset.row)];
        const value=name=>el.querySelector('[name='+name+']').value;
        const title=value('title').trim(), date=value('date'), clock=value('time'), kind=value('kind'), group=value('group');
        if (!title || !date) throw new Error('Mỗi mục đã chọn cần có tên và ngày. Kiểm tra '+(title||'mục chưa có tên')+'.');
        if (kind==='work'&&!clock) throw new Error('Giờ làm cần có giờ bắt đầu.');
        const start=date+(clock?'T'+clock:'');
        const duration=data.end&&data.start?epoch(data.end)-epoch(data.start):0;
        const actualEnd=duration>0&&Boolean(clock)===Boolean(time(data.start)) ? local(epoch(start)+duration) : '';
        return {data,title,start,kind,group,end:clock?actualEnd:actualEnd.slice(0,10)};
      });
      const feed=meta.url ? existingFeed||{id:id(),url:meta.url,name:meta.name} : null;
      const groupIds=new Map();
      const resolveGroup=group=>{
        if (!group.startsWith('course:')&&group!=='project') return group;
        if (!groupIds.has(group)) {
          const code=group.startsWith('course:')?group.slice(7):'';
          const name=code||meta.name;
          const type=code?'course':meta.type==='image'?'competition':'personal';
          let match=state.groups.find(g=>code?g.code===code:g.name===name&&g.type===type);
          if (!match) { match={id:id(),name,code,type,color:colors[state.groups.length%colors.length]}; state.groups.push(match); }
          groupIds.set(group,match.id);
        }
        return groupIds.get(group);
      };
      for (const {data,...raw} of updates) {
        const previous=data.existing;
        const row={...previous,...raw,id:previous?.id||id(),group:resolveGroup(raw.group),notes:data.notes,sourceId:data.sourceId,
          feed:feed?.id||previous?.feed||'',demo:false};
        if (meta.type==='sync') for (const field of previous?.overrides||[]) row[field]=previous[field];
        const index=state.items.findIndex(e=>e.id===row.id);
        if (index<0) state.items.push(row); else state.items[index]=row;
      }
      if (feed&&!existingFeed) state.sources.push(feed);
      if (screen==='week') {
        const dates=updates.map(r=>r.start.slice(0,10)).sort();
        week=monday(dates.find(date=>date>=current)||dates.at(-1));
      }
      close(); save('Đã lưu '+updates.length+' mục vào Weekplan.');
    } catch(error) { fail(form,error.message); }
  };
}
function canvasGroup(row,existing) {
  if (existing?.group) return existing.group;
  const name = (row.courseName || '').trim();
  const label = name || row.course || 'Deadline Canvas';
  const match = state.groups.find(g=>g.type==='course' && (
    g.name.toLowerCase()===label.toLowerCase() ||
    (row.course && g.code===row.course) ||
    (name && name.toLowerCase().includes(g.name.toLowerCase())) ||
    (g.id==='legal' && /legal cons|law and technology|law & technology/i.test(name)) ||
    (g.id==='bigdata' && /big\s*data/i.test(name))
  ));
  if (match) return match.id;
  const group = {id:id(),name:label,code:row.course||'',type:'course',color:colors[state.groups.length%colors.length]};
  state.groups.push(group);
  return group.id;
}

async function syncCanvas(notify=false) {
  if (syncingCanvas) return;
  syncingCanvas=true;
  if (notify) toast('Đang cập nhật deadline Canvas…');
  try {
    const response=await fetch('/api/rmit-canvas',{cache:'no-store'});
    if (!response.ok) throw new Error('Chưa tải được deadline Canvas. M có thể thử lại trong Nguồn lịch.');
    const snapshot=response.headers.get('content-type')?.startsWith('application/json');
    if (snapshot && state.canvasLive) {
      toast('Chưa lấy được dữ liệu mới từ Canvas. Lịch đang hiển thị bản đồng bộ gần nhất.');
      return;
    }
    const feed=snapshot ? await response.json() : parseCalendar(await response.text(),{canvas:true});
    const rows=feed.filter(row=>row.kind==='deadline');
    if (!rows.length) throw new Error('Canvas chưa trả về hạn nộp nào.');
    const previous=new Map(state.items.filter(e=>e.sourceId && (!e.feed || e.feed===canvasId)).map(e=>[e.sourceId,e]));
    const incoming=new Map(rows.map(row=>{
      const existing=previous.get(row.sourceId);
      const {included,course,courseName,warning,...fields}=row;
      const item={...existing,...fields,id:existing?.id||id(),group:canvasGroup(row,existing),feed:canvasId,demo:false};
      for (const key of existing?.overrides||[]) if (key==='notes') item.notes=existing.notes;
      return [row.sourceId,item];
    }));
    const addedIds=new Set([...incoming.values()].map(e=>e.id));
    const retained=state.items.filter(e=>e.feed!==canvasId&&!addedIds.has(e.id));
    const validIds=new Set([...retained.map(e=>e.id),...addedIds]);
    state.items=[...retained,...incoming.values()]
      .map(e=>e.parent&&!validIds.has(e.parent)?{...e,parent:''}:e);
    if (!notify && state.canvasVersion!==canvasVersion && screen==='week' && week===firstWeek) {
      const next=rows.find(e=>dateOf(e)>=current);
      if (next) week=monday(dateOf(next));
    }
    if (!state.sources.some(s=>s.id===canvasId)) state.sources.push({id:canvasId,name:'Deadline RMIT · Canvas'});
    state.canvasDisabled=false;
    state.canvasVersion=canvasVersion;
    state.canvasLive=!snapshot;
    save(snapshot ? 'Đang hiển thị '+rows.length+' hạn nộp Canvas đã xác nhận.' : 'Đã cập nhật '+rows.length+' hạn nộp từ Canvas.');
  } catch (error) { toast(error.message); }
  finally { syncingCanvas=false; }
}
async function refreshSource(source) {
  if (source.id===canvasId) return syncCanvas(true);
  const form=show('Cập nhật nguồn lịch','<p class="hint">Đang kiểm tra lịch gốc…</p><div class="notice" role="alert"></div>',button('Đóng','data-act="close"'));
  try {
    const rows=parseCalendar(await loadFeed(source.url),{canvas:new URL(source.url).hostname==='rmit.instructure.com'});
    if (!rows.length) throw new Error('Nguồn lịch chưa trả về mục nào.');
    if (form.isConnected&&modal.open) importPreview(rows,{url:source.url,type:'sync',name:source.name});
  } catch(error) { if (form.isConnected) fail(form,error.message); }
}
function confirmAction(title,message,label,callback) {
  const form=show(title,'<p class="hint">'+message+'</p>',button('Hủy','data-act="close"')+submit(label));
  form.onsubmit=e=>{e.preventDefault();close();callback();};
}
function navigate(next,group='') {
  screen=next; scope=group; render();
  window.scrollTo({top:0});
}
function newItemDate() {
  if (screen==='week' && week!==firstWeek) return week<state.semester.start && addDay(week,6)>=state.semester.start ? state.semester.start : week;
  if (screen==='semester' && (current<state.semester.start || current>termEnd(state.semester))) return state.semester.start;
  return current;
}
function slotStart(el,y) {
  if (!el.dataset.hour) return el.dataset.slot;
  const rect=el.getBoundingClientRect();
  const hourHeight=45;
  const min=Math.floor((y-rect.top)/hourHeight*4)*15+Number(el.dataset.hour)*60;
  return el.dataset.slot+'T'+slotTime(Math.min(1425,Math.max(0,min)));
}
let termSelection;
let weekSelection;
let ignoreGridClick=false;
function termDayAt(x,y) {
  const row=document.elementFromPoint(x,y)?.closest('.term-row');
  return [...(row?.querySelectorAll('.term-cell')||[])].find(cell=>{
    const bounds=cell.getBoundingClientRect();
    return x>=bounds.left && x<bounds.right;
  })?.dataset.termDay;
}
function newTermEvent(first,last=first) {
  const [start,finish]=[first,last].sort();
  editItem({}, {kind:'event',start,end:finish===start?'':addDay(finish,1)});
}
document.addEventListener('pointerdown',e=>{
  if (e.pointerType!=='mouse' || e.button!==0) return;
  const day=e.target.closest('[data-term-day]')?.dataset.termDay;
  if (day) termSelection={pointer:e.pointerId,start:day,end:day};
  const cell=e.target.closest('[data-slot]');
  if (cell && !e.target.closest('[data-edit]')) {
    const start=slotStart(cell,e.clientY);
    weekSelection={pointer:e.pointerId,start,end:start,timed:Boolean(cell.dataset.hour)};
  }
});
document.addEventListener('pointermove',e=>{
  if (weekSelection?.pointer===e.pointerId) {
    const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-slot]');
    if (cell && Boolean(cell.dataset.hour)===weekSelection.timed) {
      weekSelection.end=slotStart(cell,e.clientY);
      paintWeekSelection(weekSelection);
    }
    return;
  }
  if (termSelection?.pointer!==e.pointerId) return;
  const end=termDayAt(e.clientX,e.clientY);
  if (!end || end===termSelection.end) return;
  termSelection.end=end;
  const [first,last]=[termSelection.start,end].sort();
  document.querySelectorAll('.term-cell').forEach(cell=>{
    const day=cell.dataset.termDay;
    cell.classList.toggle('selected',day>=first&&day<=last);
  });
});
function weekSelectionBounds({start,end}) {
  const [first,last]=[start.slice(0,10),end.slice(0,10)].sort();
  const times=[time(start),time(end)].sort();
  return {first,last,begin:times[0],finish:times[1]?minutes(times[1])+15:0};
}
function paintWeekSelection(selection) {
  const {first,last,begin,finish}=weekSelectionBounds(selection);
  document.querySelectorAll(selection.timed?'.time-cell':'.all-cell').forEach(cell=>{
    const selected=selection.start!==selection.end && cell.dataset.slot>=first && cell.dataset.slot<=last;
    cell.classList.toggle('week-selected',selected);
    if (selected && selection.timed) {
      const origin=Number(cell.dataset.hour)*60;
      const height=cell.getBoundingClientRect().height/45*60;
      cell.style.setProperty('--selection-top',((minutes(begin)-origin)/height*100)+'%');
      cell.style.setProperty('--selection-height',((finish-minutes(begin))/height*100)+'%');
    }
  });
}
function endWeekSelection(e) {
  if (weekSelection?.pointer!==e.pointerId) return;
  const selection=weekSelection;
  weekSelection=undefined;
  document.querySelectorAll('.week-selected').forEach(cell=>cell.classList.remove('week-selected'));
  if (e.type!=='pointerup' || selection.start===selection.end) return;
  suppressGridClick();
  const {first,last,begin,finish}=weekSelectionBounds(selection);
  if (!selection.timed) {
    newTermEvent(first,last);
  } else if (first===last) {
    editItem({}, {kind:'event',start:first+'T'+begin,end:local(epoch(first)+finish*60000)});
  } else {
    const slots=[];
    for (let date=first;date<=last;date=addDay(date,1)) {
      slots.push({day:weekday(date),start:begin,end:slotTime(finish%1440)});
    }
    editItem({}, {kind:'event',start:first,schedule:{interval:0,until:last,days:slots}});
  }
}
function suppressGridClick() {
  ignoreGridClick=true;
  setTimeout(()=>{ignoreGridClick=false;},0);
}
function endTermSelection(e) {
  if (termSelection?.pointer!==e.pointerId) return;
  const {start,end}=termSelection;
  termSelection=undefined;
  document.querySelectorAll('.term-cell.selected').forEach(cell=>cell.classList.remove('selected'));
  if (e.type!=='pointerup' || start===end) return;
  suppressGridClick();
  newTermEvent(start,end);
}
document.addEventListener('pointerup',endWeekSelection);
document.addEventListener('pointercancel',endWeekSelection);
document.addEventListener('pointerup',endTermSelection);
document.addEventListener('pointercancel',endTermSelection);
document.addEventListener('click',e=>{
  if (ignoreGridClick) return;
  const el=e.target.closest('[data-select-term],[data-term-day],[data-act],[data-nav],[data-edit],[data-week],[data-group],[data-scope],[data-import],[data-delete],[data-child],[data-sync],[data-unlink],[data-slot]');
  if (!el) return;
  const d=el.dataset;
  if (d.nav) { e.preventDefault(); navigate(d.nav); }
  else if (d.selectTerm) selectTerm(state.semesters.find(term=>term.id===d.selectTerm));
  else if (d.termDay) newTermEvent(d.termDay);
  else if (d.edit) editItem(state.items.find(item=>item.id===d.edit));
  else if (d.week) { week=d.week; navigate('week'); }
  else if (d.group) editGroup(groupFor(d.group));
  else if (d.scope) { hidden.delete(d.scope); navigate('tasks',d.scope); }
  else if (d.import) importForm(d.import);
  else if (d.sync) refreshSource(state.sources.find(s=>s.id===d.sync));
  else if (d.unlink) confirmAction('Bỏ liên kết nguồn lịch','Các mục đã nhập vẫn có trên lịch. Weekplan sẽ bỏ link đã lưu.','Bỏ liên kết',()=>{
    if (d.unlink===canvasId) state.canvasDisabled=true;
    state.sources=state.sources.filter(s=>s.id!==d.unlink);
    state.items=state.items.map(item=>item.feed===d.unlink?{...item,feed:''}:item);
    save('Đã bỏ liên kết nguồn lịch.');
  });
  else if (d.delete) confirmAction('Xóa mục này?','Các việc hoặc giờ làm đã liên kết vẫn có trên lịch.','Xóa mục',()=>{
    state.items=state.items.filter(item=>item.id!==d.delete).map(item=>item.parent===d.delete?{...item,parent:''}:item);
    save('Đã xóa mục.');
  });
  else if (d.child) {
    const parent=state.items.find(item=>item.id===d.parent);
    editItem({},{kind:d.child,parent:parent.id,group:parent.group,start:d.child==='task'?'':dateOf(parent)});
  } else if (d.slot) {
    const start=slotStart(el,e.clientY);
    editItem({}, {kind:time(start)?'work':'deadline',start,end:time(start)?local(epoch(start)+3600000):''});
  } else {
    const actions={
      prev:()=>{week=addDay(week,-7);render();},next:()=>{week=addDay(week,7);render();},today:()=>{week=firstWeek;render();},
      import:chooseImport,canvas:()=>syncCanvas(true),new:()=>editItem({}, {start:newItemDate(),kind:screen==='semester'?'event':'deadline'}),close,group:()=>editGroup(),term:()=>editTerm(state.semester),'new-term':()=>editTerm(),'switch-term':chooseTerm,
      'reset-term-filter':()=>{termHidden.clear();state.termHidden=[];save();}
    };
    actions[d.act]?.();
  }
});
document.addEventListener('change',e=>{
  const el=e.target, d=el.dataset;
  if (d.datePicker) {
    el.form.elements[d.datePicker].value=el.value ? shortDate(el.value)+'/'+el.value.slice(0,4) : '';
  } else if (['date','endDate','repeatUntil'].includes(el.name) && el.form) {
    const picker=el.form.elements[el.name+'Picker'];
    if (picker) {
      try { picker.value=parseEntryDate(el.value); } catch { picker.value=''; }
    }
  }
  if (el.hasAttribute('data-term-filter')) {
    if (el.checked) termHidden.delete(el.value); else termHidden.add(el.value);
    state.termHidden=[...termHidden];
    const scroll=$('.term-scroll').scrollLeft;
    save();
    $('.term-scroll').scrollLeft=scroll;
    [...document.querySelectorAll('[data-term-filter]')].find(input=>input.value===el.value)?.focus({preventScroll:true});
  }
  if (d.filter) {
    if (el.checked) hidden.delete(d.filter); else hidden.add(d.filter);
    render();
  }
  if (d.done) {
    const row=state.items.find(item=>item.id===d.done);
    row.done=el.checked;
    row.demo=false;
    save(el.checked?'Đã đánh dấu hoàn tất.':'Đã mở lại mục.');
  }
  if (el.id==='task-scope') { scope=el.value; render(); }
  if (el.name==='kind'&&el.closest('#modal')&&!el.closest('.preview-row')&&el.value==='work') {
    const form=el.form;
    if (form.elements.startTime) form.elements.startTime.closest('details').open=true;
    if (form.elements.startTime&&!form.elements.startTime.value) form.elements.startTime.value='19:00';
    if (form.elements.endTime&&!form.elements.endTime.value) form.elements.endTime.value='20:00';
  }
});
document.addEventListener('dragstart',e=>{
  const el=e.target.closest('[draggable][data-edit]');
  if (!el||screen!=='week'||modal.open) return;
  dragged=state.items.find(item=>item.id===el.dataset.edit);
  e.dataTransfer.setData('text/plain',dragged.id);
  e.dataTransfer.effectAllowed='move';
});
document.addEventListener('dragover',e=>{
  const slot=e.target.closest('.time-cell');
  if (!slot||!dragged) return;
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  document.querySelectorAll('.dragover').forEach(el=>el.classList.toggle('dragover',el===slot));
  slot.classList.add('dragover');
});
document.addEventListener('drop',e=>{
  const slot=e.target.closest('.time-cell');
  if (!slot||!dragged) return;
  e.preventDefault();
  const start=slotStart(slot,e.clientY);
  const duration=epoch(spanEnd(dragged))-epoch(dragged.start);
  dragged.start=start; dragged.end=local(epoch(start)+duration); dragged.demo=false;
  if (dragged.feed) dragged.overrides=[...new Set([...(dragged.overrides||[]),'start','end'])];
  const problems=itemWarnings(dragged);
  dragged=null;
  save(problems.length?'Đã dời giờ · '+problems.join(' · '):'Đã dời giờ làm.');
});
document.addEventListener('dragend',()=>{
  dragged=null;
  document.querySelectorAll('.dragover').forEach(el=>el.classList.remove('dragover'));
});
if (hadSamples) save();
else render();
if (state.canvasVersion!==canvasVersion) syncCanvas();
