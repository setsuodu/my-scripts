// ==UserScript==
// @name         X 贴文保存为 JSON（含MP4）
// @namespace    local.x-save-json
// @version      1.2.0
// @description  在 X(Twitter) 贴文详情页，把贴文保存为本地 JSON（url、作者、时间、正文、图片/视频的真实地址），可选分类、保存后取消喜欢
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const LS_UNLIKE = 'xsj_unlike';
  const LS_QUOTE = 'xsj_quote';
  const LS_CAT = 'xsj_category';
  const CATEGORIES = ['默认', 'AI', '开发', '设计', '其它'];

  // document-start 时就调大，避免页面加载期间把默认的 250 条记录占满
  try { performance.setResourceTimingBufferSize(3000); } catch (e) {}

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lsGet = (k, d) => {
    try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; }
  };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} };

  // ---------- 被动读取页面自己的 GraphQL 响应 ----------
  // 页面打开贴文时自己会请求 TweetDetail，这里只是把响应副本读一下，不会额外发请求。
  // 里面有各清晰度的 mp4 地址、完整正文（含长文）、原文语言、引用贴文的 id。

  const captured = new Map(); // tweet id -> 解析后的信息

  function saveTweet(t) {
    const l = t.legacy;
    const u = t.core && t.core.user_results && t.core.user_results.result;
    const handle = (u && ((u.legacy && u.legacy.screen_name) || (u.core && u.core.screen_name))) || '';
    const nt = t.note_tweet && t.note_tweet.note_tweet_results && t.note_tweet.note_tweet_results.result;
    const raw = (l.extended_entities && l.extended_entities.media) || (l.entities && l.entities.media) || [];

    const media = raw.map((m) => {
      if (m.type === 'photo') return { type: 'photo', url: m.media_url_https + '?name=orig' };
      const vi = m.video_info || {};
      const variants = vi.variants || [];
      const mp4 = variants
        .filter((v) => v.content_type === 'video/mp4')
        .map((v) => ({ url: v.url, bitrate: v.bitrate || 0 }))
        .sort((a, b) => b.bitrate - a.bitrate);
      const m3u8 = variants.find((v) => v.content_type === 'application/x-mpegURL');
      return {
        type: m.type, // video / animated_gif
        poster: m.media_url_https,
        duration_ms: vi.duration_millis || null,
        best_mp4: mp4[0] ? mp4[0].url : '',
        mp4,
        m3u8: m3u8 ? m3u8.url : '',
      };
    });

    captured.set(t.rest_id, {
      handle,
      text: (nt && nt.text) || l.full_text || '',
      lang: l.lang || '',
      quoted_id: l.quoted_status_id_str || '',
      media,
    });
  }

  function ingest(json) {
    (function walk(o, depth) {
      if (!o || typeof o !== 'object' || depth > 60) return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
      if (typeof o.rest_id === 'string' && o.legacy && typeof o.legacy === 'object' && o.legacy.full_text !== undefined) {
        try { saveTweet(o); } catch (e) {}
      }
      for (const k in o) walk(o[k], depth + 1);
    })(json, 0);
  }

  const isGql = (url) => typeof url === 'string' && url.indexOf('/graphql/') !== -1;

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const a0 = args[0];
      const url = typeof a0 === 'string' ? a0 : (a0 && a0.url) || '';
      if (isGql(url)) {
        p.then((res) => res.clone().json()).then(ingest).catch(() => {});
      }
    } catch (e) {}
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      if (isGql(String(url))) {
        this.addEventListener('load', () => {
          try { ingest(JSON.parse(this.responseText)); } catch (e) {}
        });
      }
    } catch (e) {}
    return origOpen.call(this, method, url, ...rest);
  };

  // ---------- 页面解析 ----------

  function getStatusId() {
    const m = location.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    return m ? m[1] : null;
  }

  function pathHasId(a, id) {
    try {
      const p = new URL(a.href, location.origin).pathname;
      return new RegExp('^/[^/]+/status/' + id + '(/|$)').test(p);
    } catch (e) { return false; }
  }

  // 详情页里会有主贴、上文、回复等多个 article，靠“时间链接指向当前 id”找到主贴
  function findMainArticle(id) {
    for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
      for (const t of art.querySelectorAll('time')) {
        const a = t.closest('a');
        if (a && pathHasId(a, id)) return art;
      }
    }
    return null;
  }

  // 引用贴文是 article 里的一个 div[role=link]，里面有自己的 User-Name
  function getQuoteBox(art) {
    for (const box of art.querySelectorAll('div[role="link"]')) {
      if (box.querySelector('[data-testid="User-Name"]')) return box;
    }
    return null;
  }

  // 用 innerText 会丢表情（表情是 img.alt），这里手动遍历
  function readText(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1) return '';
    if (node.tagName === 'IMG') return node.alt || '';
    if (node.tagName === 'BR') return '\n';
    let s = '';
    node.childNodes.forEach((c) => { s += readText(c); });
    return s;
  }

  function toOrig(src) {
    try {
      const u = new URL(src);
      if (u.searchParams.has('name')) u.searchParams.set('name', 'orig');
      return u.toString();
    } catch (e) { return src; }
  }

  function extractAuthor(art, include) {
    const el = [...art.querySelectorAll('[data-testid="User-Name"]')].find(include);
    if (!el) return { name: '', id: '' };
    const lines = el.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
    return {
      name: lines[0] || '',
      id: lines.find((l) => /^@\S+$/.test(l)) || '',
    };
  }

  function extractText(art, include) {
    const el = [...art.querySelectorAll('[data-testid="tweetText"]')].find(include);
    return el ? readText(el).trim() : '';
  }

  function extractMedia(art, include) {
    const images = [];
    const videos = [];
    art.querySelectorAll('[data-testid="tweetPhoto"] img').forEach((img) => {
      if (!include(img) || !img.src) return;
      const u = toOrig(img.src);
      if (!images.includes(u)) images.push(u);
    });
    art.querySelectorAll('video').forEach((v) => {
      if (!include(v)) return;
      const src = v.currentSrc || v.src || '';
      if (!src || videos.some((x) => x.src === src)) return;
      videos.push({
        src,
        is_blob: src.startsWith('blob:'),
        poster: v.poster || '',
        duration: isFinite(v.duration) ? Math.round(v.duration * 100) / 100 : null,
      });
    });
    return { images, videos };
  }

  // 兜底：从已加载的网络请求里找视频地址（不一定能找到）
  function networkVideoUrls() {
    const set = new Set();
    performance.getEntriesByType('resource').forEach((e) => {
      const n = e.name;
      if (/^https:\/\/video\.twimg\.com\//.test(n) && /\.(m3u8|mp4)(\?|$)/.test(n)) set.add(n);
    });
    return [...set];
  }

  function hasResolvedVideo(media) {
    const vs = (media || []).filter((m) => m.type === 'video' || m.type === 'animated_gif');
    return vs.length > 0 && vs.every((m) => m.best_mp4 || m.m3u8);
  }

  function buildData(art, id, withQuote) {
    const quoteBox = getQuoteBox(art);
    const inMain = (el) => !quoteBox || !quoteBox.contains(el);

    const author = extractAuthor(art, inMain);
    let handle = author.id.replace(/^@/, '');
    if (!handle) {
      const seg = location.pathname.split('/')[1];
      handle = seg && seg !== 'i' ? seg : '';
    }

    let iso = '';
    for (const t of art.querySelectorAll('time')) {
      const a = t.closest('a');
      if (inMain(t) && a && pathHasId(a, id)) { iso = t.getAttribute('datetime') || ''; break; }
    }

    const dom = extractMedia(art, inMain);
    const cap = captured.get(id);

    const data = {
      url: handle ? `https://x.com/${handle}/status/${id}` : location.href.split('?')[0],
      id,
      author: { name: author.name, id: author.id || (handle ? '@' + handle : '') },
      time: iso,
      time_local: iso ? new Date(iso).toLocaleString() : '',
      // 页面上看到的文字，X 开了自动翻译时这里是译文
      text: extractText(art, inMain),
      // 来自接口的原文和原文语言
      text_original: cap ? cap.text : '',
      lang: cap ? cap.lang : '',
      images: dom.images,
      videos: dom.videos, // 页面上的 blob 地址，只在当前标签页有效
      // 来自接口：图片原图、视频各码率 mp4（best_mp4 是最高码率）和 m3u8
      media: cap ? cap.media : [],
      video_network_urls: networkVideoUrls(),
      saved_at: new Date().toISOString(),
    };

    if (withQuote && quoteBox) {
      const inQuote = (el) => quoteBox.contains(el);
      const qa = extractAuthor(art, inQuote);
      const qm = extractMedia(art, inQuote);
      const qt = quoteBox.querySelector('time');
      const quoted = {
        author: qa,
        time: qt ? qt.getAttribute('datetime') || '' : '',
        text: extractText(art, inQuote),
        images: qm.images,
        videos: qm.videos,
      };
      // 引用贴文在 DOM 里没有链接，id 要靠接口数据
      const qid = cap && cap.quoted_id;
      if (qid) {
        quoted.id = qid;
        const qc = captured.get(qid);
        if (qc) {
          if (qc.handle) quoted.url = `https://x.com/${qc.handle}/status/${qid}`;
          quoted.text_original = qc.text;
          quoted.lang = qc.lang;
          quoted.media = qc.media;
        }
      }
      data.quoted = quoted;
    }
    return data;
  }

  // ---------- 保存 / 取消喜欢 ----------

  function downloadJson(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function unlike(id) {
    let art = findMainArticle(id);
    const btn = art && art.querySelector('[data-testid="unlike"]');
    if (!btn) {
      return art && art.querySelector('[data-testid="like"]') ? '本来就没点赞' : '没找到喜欢按钮';
    }
    btn.click();
    await sleep(900);
    art = findMainArticle(id);
    return art && art.querySelector('[data-testid="like"]') ? '已取消喜欢' : '已点击取消喜欢（未能确认结果）';
  }

  // ---------- 面板 ----------

  function initPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:80px', 'z-index:2147483646',
      'background:#16181c', 'color:#e7e9ea', 'border:1px solid #2f3336',
      'border-radius:12px', 'padding:10px 12px', 'font:13px/1.5 system-ui,sans-serif',
      'box-shadow:0 2px 12px rgba(0,0,0,.5)', 'display:none', 'min-width:170px', 'max-width:260px',
    ].join(';');

    const btn = document.createElement('button');
    btn.textContent = '保存为 JSON';
    btn.style.cssText = 'width:100%;padding:6px 10px;border:0;border-radius:999px;background:#1d9bf0;color:#fff;font-weight:700;cursor:pointer';

    function makeCheck(label, key, def) {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer;user-select:none';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = lsGet(key, def);
      cb.addEventListener('change', () => lsSet(key, cb.checked));
      wrap.append(cb, document.createTextNode(label));
      return { wrap, cb };
    }

    const chkQuote = makeCheck('同时保存引用贴文', LS_QUOTE, true);
    const chkUnlike = makeCheck('保存后取消喜欢', LS_UNLIKE, false);

    // 分类下拉框，记住上次的选择
    const catWrap = document.createElement('label');
    catWrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:8px';
    const catSel = document.createElement('select');
    catSel.style.cssText = 'flex:1;background:#000;color:#e7e9ea;border:1px solid #2f3336;border-radius:6px;padding:3px 6px';
    CATEGORIES.forEach((c) => {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      catSel.appendChild(o);
    });
    try {
      const saved = localStorage.getItem(LS_CAT);
      if (saved && CATEGORIES.includes(saved)) catSel.value = saved;
    } catch (e) {}
    catSel.addEventListener('change', () => {
      try { localStorage.setItem(LS_CAT, catSel.value); } catch (e) {}
    });
    catWrap.append(document.createTextNode('分类'), catSel);

    const msg = document.createElement('div');
    msg.style.cssText = 'margin-top:8px;font-size:12px;color:#71767b;word-break:break-all';

    panel.append(btn, catWrap, chkQuote.wrap, chkUnlike.wrap, msg);
    document.body.appendChild(panel);

    function setMsg(text, isErr) {
      msg.textContent = text;
      msg.style.color = isErr ? '#f4212e' : '#00ba7c';
    }

    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      try {
        const id = getStatusId();
        const art = id && findMainArticle(id);
        if (!art) { setMsg('没找到主贴，等页面加载完再试', true); return; }

        const data = { category: catSel.value, ...buildData(art, id, chkQuote.cb.checked) };
        const handle = data.author.id.replace(/^@/, '') || 'unknown';
        const fileName = `x_${handle}_${id}.json`;
        downloadJson(fileName, data);

        let text = `已保存 ${fileName}（图 ${data.images.length} / 视频 ${data.videos.length}）`;
        let ok = true;

        // 页面上有视频，但接口数据里没拿到地址：多半是脚本装好后没刷新页面
        if (data.videos.length > 0 && !hasResolvedVideo(data.media)) {
          ok = false;
          text += '；⚠ 没捕获到视频的 mp4 地址，请刷新本页后重新保存';
        }

        if (chkUnlike.cb.checked) {
          text += ok ? '；' + (await unlike(id)) : '；已跳过取消喜欢（视频地址不全）';
        }
        setMsg(text, !ok);
      } catch (e) {
        console.error('[x-save-json]', e);
        setMsg('出错：' + e.message, true);
      } finally {
        busy = false;
      }
    });

    // X 是单页应用，换页不会重新加载脚本，所以轮询判断是否在贴文详情页
    setInterval(() => {
      panel.style.display = getStatusId() ? 'block' : 'none';
    }, 800);
  }

  if (document.body) initPanel();
  else document.addEventListener('DOMContentLoaded', initPanel);
})();