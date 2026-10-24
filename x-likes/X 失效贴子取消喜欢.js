// ==UserScript==
// @name         X 失效贴子取消喜欢
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  if (window.top !== window) return;
  // 防止脚本被重复注入
  if (window.__unlikeSuspendedLoaded) return;
  window.__unlikeSuspendedLoaded = true;

  const DONE_KEY = 'unlike_done';
  const LOCK_KEY = 'unlike_lock';      // 跨标签页 / 刷新后的运行锁
  const LOCK_TTL = 15000;              // 心跳超过 15 秒视为已停止
  const TAB_ID = Math.random().toString(36).slice(2);

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('[unlike]', ...a);

  // ---------- UI ----------
  const btn = document.createElement('button');
  btn.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:99999;padding:8px 12px;' +
    'border:0;border-radius:8px;background:#1d9bf0;color:#fff;font-size:14px;cursor:pointer';
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.js,.json' });
  document.body.appendChild(btn);

  const toast = msg => {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;right:12px;bottom:60px;z-index:99999;padding:8px 12px;' +
      'border-radius:8px;background:#000c;color:#fff;font-size:13px;max-width:280px';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  };
  const setBtn = (text, disabled) => {
    btn.textContent = text;
    btn.disabled = !!disabled;
    btn.style.opacity = disabled ? '.7' : '1';
    btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
  };

  // ---------- 运行锁 ----------
  const readLock = () => {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); } catch { return null; }
  };
  const lockedByOther = () => {
    const l = readLock();
    return l && l.id !== TAB_ID && Date.now() - l.t < LOCK_TTL;
  };
  const beat = () => localStorage.setItem(LOCK_KEY, JSON.stringify({ id: TAB_ID, t: Date.now() }));
  const unlock = () => {
    const l = readLock();
    if (l && l.id === TAB_ID) localStorage.removeItem(LOCK_KEY);
  };
  window.addEventListener('beforeunload', unlock);

  // ---------- 取鉴权信息 ----------
  async function getAuth() {
    const srcs = [...document.scripts].map(s => s.src).filter(s => /abs\.twimg\.com.*\.js/.test(s));
    let bearer, qid;
    for (const src of srcs) {
      const t = await (await fetch(src)).text();
      bearer ||= (t.match(/AAAAAAAAAAAAAAAAAAAAA[A-Za-z0-9%]+/) || [])[0];
      qid ||= (t.match(/queryId:"([^"]+)",operationName:"UnfavoriteTweet"/) || [])[1];
      if (bearer && qid) break;
    }
    if (!bearer || !qid) throw new Error('没取到 bearer/queryId，刷新页面后重试');
    return { bearer, qid };
  }

  async function unlike(id, { bearer, qid }) {
    const ct0 = document.cookie.match(/ct0=([^;]+)/)?.[1];
    return fetch(`/i/api/graphql/${qid}/UnfavoriteTweet`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        authorization: 'Bearer ' + bearer,
        'content-type': 'application/json',
        'x-csrf-token': ct0,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
      },
      body: JSON.stringify({ variables: { tweet_id: id }, queryId: qid }),
    });
  }

  // ---------- 主流程 ----------
  let running = false;

  async function run(file) {
    const txt = await file.text();
    const arr = JSON.parse(txt.slice(txt.indexOf('[')));
    const ids = arr.map(x => x.like)
      .filter(l => /suspended account/i.test(l.fullText || ''))
      .map(l => l.tweetId);

    const done = new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]'));
    const todo = ids.filter(i => !done.has(i));
    log(`共 ${ids.length} 条，待处理 ${todo.length}`);
    if (!todo.length) {
      toast('没有需要处理的条目');
      return;
    }

    const auth = await getAuth();
    toast(`开始运行：待处理 ${todo.length} 条（共 ${ids.length}）`);

    let n = 0, okDone = 0, fail = 0;
    for (let i = 0; i < todo.length; ) {
      const id = todo[i];
      beat();
      setBtn(`处理中 ${n}/${todo.length}`, true);

      const res = await unlike(id, auth);
      if (res.status === 429) {
        log('被限流，暂停 5 分钟');
        setBtn('被限流，暂停 5 分钟…', true);
        for (let s = 0; s < 300; s++) { beat(); await sleep(1000); }
        continue; // 同一条重试
      }

      const body = await res.text();
      if (n < 3) log('响应样本', id, res.status, body.slice(0, 200)); // 前 3 条打印响应
      if (res.ok && !/"errors"/.test(body)) {
        done.add(id);
        localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
        if (/"Done"/.test(body)) okDone++;
      } else {
        fail++;
        log('失败', id, res.status, body.slice(0, 120));
      }
      n++; i++;
      log(`${n}/${todo.length}（失败 ${fail}）`);
      await sleep(1500 + Math.random() * 1500);
    }
    log(`完成：成功 ${todo.length - fail}（其中返回 Done ${okDone}），失败 ${fail}`);
    toast(`完成：成功 ${todo.length - fail}，失败 ${fail}`);
  }

  btn.onclick = () => {
    if (running) return toast('已经在运行了');
    if (lockedByOther()) return toast('另一个标签页正在运行，请等它结束');
    inp.value = '';
    inp.click();
  };

  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    if (running) return toast('已经在运行了');
    if (lockedByOther()) return toast('另一个标签页正在运行，请等它结束');
    running = true;
    beat();
    try {
      await run(file);
    } catch (e) {
      alert(e.message);
    } finally {
      running = false;
      unlock();
      setBtn('清理冻结账号的赞', false);
    }
  };

  setBtn('清理冻结账号的赞', false);
  toast('脚本已加载，点右下角按钮选择 like.js');
  log('脚本已加载');
})();
