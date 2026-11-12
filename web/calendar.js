export const zone = 'Asia/Ho_Chi_Minh';
const dayMs = 86400000;
const offset = 7 * 3600000;
const pad = value => String(value).padStart(2,'0');
export const local = ms => new Date(ms + offset).toISOString().slice(0,16);
export const epoch = value => Date.parse(value.length === 10 ? value+'T00:00+07:00' : value+'+07:00');
export const addDay = (date, days) => local(epoch(date) + days*dayMs).slice(0,10);
export const today = () => local(Date.now()).slice(0,10);
export const monday = date => addDay(date, -((new Date(date+'T12:00Z').getUTCDay()+6)%7));
export const time = value => value?.slice(11,16) || '';
export const minutes = value => Number(value.slice(0,2))*60+Number(value.slice(3,5));
export const shortDate = value => value.slice(8,10)+'/'+value.slice(5,7);

function calendarDate(field, defaultZone = zone) {
  const match = field?.value.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/);
  if (!match) return null;
  const [,y,m,d,h,min,sec,zulu] = match;
  const date = y+'-'+m+'-'+d;
  if (!h) return {value:date, wall:date, timezone:zone, allDay:true};
  const wall = date+'T'+h+':'+min;
  const raw = Date.parse(wall+':'+(sec||'00')+'Z');
  if (!Number.isFinite(raw)) return null;
  const timezone = zulu ? 'UTC' : (field.tzid || defaultZone).replace(/^\//,'');
  if (timezone === 'UTC') return {value:local(raw),wall,timezone,allDay:false};
  if ([zone,'Asia/Saigon','SE Asia Standard Time'].includes(timezone)) return {value:wall,wall,timezone:zone,allDay:false};
  const aliases = {'Eastern Standard Time':'America/New_York','Pacific Standard Time':'America/Los_Angeles','GMT Standard Time':'Europe/London','AUS Eastern Standard Time':'Australia/Sydney','Singapore Standard Time':'Asia/Singapore'};
  try {
    const fmt = new Intl.DateTimeFormat('en-CA',{timeZone:aliases[timezone]||timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    let guess = raw;
    for (let i=0;i<3;i++) {
      const p = Object.fromEntries(fmt.formatToParts(guess).map(x=>[x.type,x.value]));
      const shown = Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');
      if (shown === raw) break;
      guess += raw-shown;
    }
    return {value:local(guess),wall,timezone,allDay:false};
  } catch {
    return {value:wall,wall,timezone:zone,allDay:false,warning:'Múi giờ nguồn chưa nhận diện được. Kiểm tra giờ trước khi lưu.'};
  }
}

const decode = value => (value||'').replace(/\\([nN,;\\])/g,(_,c)=>/[nN]/.test(c)?'\n':c);
const text = (entry,key) => decode(entry[key]?.[0]?.value);
function prop(line) {
  const split = line.match(/^((?:[^":]|"[^"]*")*):(.*)$/);
  if (!split) return null;
  const [name,...params] = split[1].split(';');
  return {name:name.toUpperCase(), value:split[2], tzid:params.find(p=>/^TZID=/i.test(p))?.slice(5).replace(/^"|"$/g,'')};
}
const toField = (wall,tzid) => ({value:wall.replace(/[-:]/g,'')+(wall.length>10?'00':''),tzid});

function occurrences(entry, start, defaultZone) {
  const rules = text(entry,'RRULE').split(';').filter(Boolean).map(rule=>rule.split('='));
  const r = Object.fromEntries(rules);
  const results = new Map([[start.value,start]]);
  const warnings = [];
  const day = start.wall.slice(0,10);
  const limit = r.UNTIL ? calendarDate({value:r.UNTIL},start.timezone)?.value : '';
  const count = Number(r.COUNT) || Infinity;
  const interval = Math.max(1, Number(r.INTERVAL)||1);
  const names = ['SU','MO','TU','WE','TH','FR','SA'];
  const weekday = date => names[new Date(date+'T12:00Z').getUTCDay()];
  const byDay = r.BYDAY?.split(',');
  const byMonth = r.BYMONTH?.split(',').map(Number);
  const byMonthDay = r.BYMONTHDAY?.split(',').map(Number);
  if (r.FREQ) {
    const supported = ['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(r.FREQ);
    if (!supported || rules.some(([key])=>!['FREQ','COUNT','UNTIL','INTERVAL','BYDAY','BYMONTH','BYMONTHDAY','WKST'].includes(key))) {
      warnings.push('Quy tắc lặp phức tạp. Kiểm tra các buổi đã nhận diện.');
    }
    const origin = new Date(day+'T12:00Z');
    const wkst = names.includes(r.WKST) ? names.indexOf(r.WKST) : 1;
    const weekShift = (origin.getUTCDay()-wkst+7)%7;
    const cap = Math.min(366*8, Math.max(366, Math.ceil((epoch(today())-epoch(day))/dayMs)+366));
    for (let n=1;supported && n<=cap && results.size<Math.min(count,1200);n++) {
      const date = addDay(day,n);
      if (limit && date > limit.slice(0,10)) break;
      const current = new Date(date+'T12:00Z');
      const month = current.getUTCMonth()+1;
      const monthDiff = (current.getUTCFullYear()-origin.getUTCFullYear())*12+current.getUTCMonth()-origin.getUTCMonth();
      const monthDay = current.getUTCDate();
      const daysInMonth = new Date(Date.UTC(current.getUTCFullYear(),month,0)).getUTCDate();
      if (byMonth && !byMonth.includes(month)) continue;
      if (byMonthDay && !byMonthDay.includes(monthDay) && !byMonthDay.includes(monthDay-daysInMonth-1)) continue;
      if (byDay && !byDay.some(code=>{
        const ordinal = Number(code.slice(0,-2));
        return code.slice(-2)===weekday(date) && (!ordinal || (ordinal>0 ? Math.ceil(monthDay/7) : -Math.ceil((daysInMonth-monthDay+1)/7))===ordinal);
      })) continue;
      if (r.FREQ==='DAILY' && n%interval) continue;
      if (r.FREQ==='WEEKLY' && (Math.floor((n+weekShift)/7)%interval || (!byDay && weekday(date)!==weekday(day)))) continue;
      if (r.FREQ==='MONTHLY' && (monthDiff%interval || (!byDay && !byMonthDay && monthDay!==origin.getUTCDate()))) continue;
      if (r.FREQ==='YEARLY' && ((current.getUTCFullYear()-origin.getUTCFullYear())%interval || (!byMonth && month!==origin.getUTCMonth()+1) || (!byDay && !byMonthDay && monthDay!==origin.getUTCDate()))) continue;
      const value = calendarDate(toField(date+start.wall.slice(10),start.timezone));
      if (value && (!limit || value.value <= limit || (limit.length===10 && value.value.slice(0,10)===limit))) results.set(value.value,value);
    }
  }
  for (const extra of entry.RDATE||[]) for (const value of extra.value.split(',')) {
    const d = calendarDate({...extra,value:value.split('/')[0]},defaultZone);
    if (d) results.set(d.value,d);
  }
  for (const exception of entry.EXDATE||[]) for (const value of exception.value.split(',')) {
    const d = calendarDate({...exception,value},defaultZone);
    if (d) results.delete(d.value);
  }
  return {dates:[...results.values()],warning:warnings[0]};
}
function durationMs(value) {
  const match = value.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return 0;
  const [w,d,h,m,s] = match.slice(1).map(v=>Number(v)||0);
  return (((w*7+d)*24+h)*60+m)*60000+s*1000;
}

export function parseCalendar(source, {canvas = false} = {}) {
  if (!/^\s*BEGIN:VCALENDAR\b/i.test(source)) throw new Error('File hoặc link này chưa chứa dữ liệu iCalendar hợp lệ.');
  const entries = [];
  let entry, component, nested = 0, defaultZone = zone;
  for (const line of source.replace(/\r\n|\r/g,'\n').replace(/\n[ \t]/g,'').split('\n')) {
    const begin = line.match(/^BEGIN:(VEVENT|VTODO)$/i);
    if (begin && !entry) { entry={}; component=begin[1].toUpperCase(); continue; }
    if (entry && /^BEGIN:/i.test(line)) { nested++; continue; }
    if (entry && /^END:/i.test(line)) {
      if (nested) nested--;
      else if (line.toUpperCase()==='END:'+component) { entries.push(entry); entry=null; }
      continue;
    }
    if (nested) continue;
    const field = prop(line);
    if (!field) continue;
    if (!entry && field.name==='X-WR-TIMEZONE') defaultZone=field.value;
    if (entry) (entry[field.name]??=[]).push(field);
  }
  const byOccurrence = new Map();
  const sorted = entries.sort((a,b)=>Number(Boolean(a['RECURRENCE-ID']))-Number(Boolean(b['RECURRENCE-ID'])));
  for (const event of sorted) {
    const due = !!event.DUE?.length;
    const start = calendarDate((due?event.DUE:event.DTSTART)?.[0],defaultZone);
    const exception = calendarDate(event['RECURRENCE-ID']?.[0],defaultZone);
    const summary = text(event,'SUMMARY') || 'Sự kiện từ lịch';
    const courseName = canvas ? summary.match(/\s+\[([^\[\]]+)\]\s*$/)?.[1] : '';
    const title = courseName ? summary.replace(/\s+\[[^\[\]]+\]\s*$/,'') : summary;
    const uid = text(event,'UID') || title+'@'+(start?.value||'');
    if (text(event,'STATUS').toUpperCase()==='CANCELLED') {
      if (exception) byOccurrence.delete(uid+'|'+exception.value);
      continue;
    }
    if (!start) continue;
    const end = calendarDate(event.DTEND?.[0],defaultZone);
    const length = end ? epoch(end.value)-epoch(start.value) : durationMs(text(event,'DURATION'));
    const repeats = exception ? {dates:[start]} : occurrences(event,start,defaultZone);
    const notes = [text(event,'LOCATION'),text(event,'DESCRIPTION')].filter(Boolean).join('\n');
    const course = (summary+' '+notes).match(/\b([A-Z]{3,4}\d{4})(?=[^0-9]|$)/i)?.[1]?.toUpperCase();
    const canvasAssignment = canvas && /(?:^|[-_:])(?:assignment|quiz|discussion)(?:[-_:]|$)/i.test(uid);
    const canvasEvent = canvas && /(?:^|[-_:])(?:calendar[-_:]?event|event[-_:]calendar)(?:[-_:]|$)/i.test(uid);
    const kind = due || canvasAssignment || /^(?:due\b|deadline\b)/i.test(title)
      || (canvas && !canvasEvent && !end && !length) ? 'deadline' : 'event';
    for (const date of repeats.dates) {
      const key = uid+'|'+(exception?.value || ((event.RRULE||event.RDATE)?date.value:'single'));
      const sourceId = uid+'|'+(exception?.value || date.value);
      const ending = length>0 ? local(epoch(date.value)+length) : '';
      if (exception) byOccurrence.delete(sourceId);
      byOccurrence.set(key,{title, start:date.value, end:start.allDay?ending.slice(0,10):ending, kind, notes, course, courseName, sourceId:key, warning:start.warning||repeats.warning, included:true});
    }
  }
  return [...byOccurrence.values()].sort((a,b)=>a.start.localeCompare(b.start));
}

export function parseTimeline(text,year) {
  const rows = [];
  const datePattern = /(?<!\d)(?:(\d{4})-(\d\d)-(\d\d)|(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?)(?!\d)/g;
  const lines = text.split(/\n/).map(line=>line.trim()).filter(Boolean);
  for (const [index,line] of lines.entries()) {
    const dates = [...line.matchAll(datePattern)].filter(m=>Number(m[3]||m[4])<=31 && Number(m[2]||m[5])<=12);
    if (!dates.length && !/(?:đầu|giữa|cuối)\s+tháng|\bTBD\b/i.test(line)) continue;
    const toDate = m => {
      const explicit = m[1]||m[6];
      const y = explicit?.length===2 ? '20'+explicit : (explicit||year);
      if (!y) return '';
      const value = y+'-'+pad(m[2]||m[5])+'-'+pad(m[3]||m[4]);
      const ms = epoch(value);
      return Number.isFinite(ms)&&local(ms).slice(0,10)===value ? value : '';
    };
    const name = line.replace(datePattern,' ').replace(/^[\s–—:|.\-]+|[\s–—:|.\-]+$/g,'');
    const title = (name.length>2 ? name : lines[index-1]?.replace(datePattern,'').trim()) || 'Mốc cuộc thi';
    const start = dates.length ? toDate(dates[0]) : '';
    const endDate = dates.length>1 ? toDate(dates.at(-1)) : '';
    const hour = line.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/);
    const kind = /nộp|submission|deadline|hạn chót/i.test(title) ? 'deadline' : 'milestone';
    rows.push({title,start:start&&hour?start+'T'+pad(hour[1])+':'+hour[2]:start,end:endDate&&endDate>=start?addDay(endDate,1):'',kind,notes:line,included:true,warning:!start?'Cần xác nhận ngày.':(!dates[0][1]&&!dates[0][6]?'Kiểm tra năm đã chọn.':'')});
  }
  return rows;
}
