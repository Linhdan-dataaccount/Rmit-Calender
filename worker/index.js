const trusted = [
  'mytimetable.rmit.edu.vn', 'mytimetable.rmit.edu.au', 'calendar.google.com',
  'rmit.instructure.com',
  'outlook.office365.com', 'outlook.office.com', 'outlook.live.com'
];

function calendarUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.port || url.username || url.password) throw new Error('Link phải dùng HTTPS.');
  const host = url.hostname;
  if (!trusted.includes(host) && !host.endsWith('.canvaslms.com') && !host.endsWith('.icloud.com')) {
    throw new Error('Nguồn này chưa hỗ trợ tải qua Weekplan. M tải file .ics từ lịch gốc rồi nhập nhé.');
  }
  if (host === 'rmit.instructure.com' && !/^\/feeds\/calendars\/[\w-]+\.ics$/.test(url.pathname)) {
    throw new Error('Dùng link Calendar Feed từ Canvas RMIT.');
  }
  return url;
}

const privateText = {'content-type':'text/plain; charset=utf-8','cache-control':'no-store'};

export async function calendarResponse(url, timeout=12000) {
  try {
    let next = calendarUrl(url);
    let response;
    for (let count = 0; count < 4; count++) {
      response = await fetch(next, { redirect: 'manual', signal: AbortSignal.timeout(timeout) });
      const redirect = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !redirect) break;
      next = calendarUrl(new URL(redirect, next));
    }
    if (!response.ok || !response.body) throw new Error('Nguồn lịch không phản hồi. Kiểm tra lại link iCal hoặc dùng file .ics.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '', size = 0;
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_500_000) { await reader.cancel(); throw new Error('Lịch quá lớn. Hãy xuất một khoảng ngày ngắn hơn.'); }
      result += decoder.decode(value, {stream: true});
    }
    result += decoder.decode();
    if (!/^\s*BEGIN:VCALENDAR\b/i.test(result)) throw new Error('Link này chưa trả về lịch iCal. Hãy dùng link đăng ký lịch, hoặc tải file .ics.');
    return new Response(result, {headers:{'content-type':'text/calendar; charset=utf-8','cache-control':'no-store'}});
  } catch (error) {
    const message = error instanceof TypeError || error.name === 'TimeoutError'
      ? 'Không tải được nguồn lịch. Kiểm tra link hoặc thử nhập file .ics.' : error.message;
    return new Response(message, {status:400,headers:privateText});
  }
}

export default {
  async fetch(request, env = {}) {
    const path = new URL(request.url).pathname;
    if (path === '/api/rmit-canvas' && request.method === 'GET') {
      if (!request.headers.get('oai-authenticated-user-id')) return new Response(null, {status:401,headers:privateText});
      const live = env.RMIT_CANVAS_FEED ? await calendarResponse(env.RMIT_CANVAS_FEED, 6000) : null;
      if (live?.ok) return live;
      if (env.RMIT_CANVAS_SNAPSHOT) return new Response(env.RMIT_CANVAS_SNAPSHOT, {
        headers:{...privateText,'content-type':'application/json; charset=utf-8'}
      });
      return live || new Response(null, {status:404,headers:privateText});
    }
    if (path === '/api/calendar' && request.method === 'POST') {
      try { return calendarResponse((await request.json()).url); }
      catch { return new Response('Link iCal chưa hợp lệ.', {status:400,headers:privateText}); }
    }
    const asset = ASSETS[path === '/' ? '/index.html' : path];
    if (!asset) return new Response('Not found', {status:404});
    return new Response(asset.body, {headers:{'content-type':asset.type,'x-content-type-options':'nosniff'}});
  }
};
