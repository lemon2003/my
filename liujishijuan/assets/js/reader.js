/* 试卷阅读器：PDF 渲染、缩放、页码跳转、批注（画笔 / 荧光笔 / 橡皮 / 撤销 / 清空） */
(function () {
  "use strict";

  var DEFAULT_ZOOM = 150;
  var MIN_ZOOM = 50;
  var MAX_ZOOM = 300;
  var STEP = 25;

  var scrollEl = document.getElementById("readerScroll");
  var pagesEl = document.getElementById("pages");
  var statusEl = document.getElementById("status");
  var statusText = document.getElementById("statusText");
  var pageNav = document.getElementById("pageNav");
  var pageCounter = document.getElementById("pageCounter");
  var zoomValue = document.getElementById("zoomValue");
  var audioBar = document.getElementById("audioBar");
  var audioEl = document.getElementById("audio");

  var state = {
    zoom: DEFAULT_ZOOM,
    pdf: null,
    numPages: 0,
    currentPage: 1,
    tool: "pointer",
    pages: [],
    history: [],
  };

  /* ------------------------------------------------------------ 基础工具 */

  function toast(message) {
    var layer = document.getElementById("toastLayer");
    var box = document.createElement("div");
    box.className = "toast";
    box.textContent = message;
    layer.appendChild(box);
    setTimeout(function () {
      box.classList.add("out");
      setTimeout(function () {
        box.remove();
      }, 200);
    }, 2400);
  }

  var tipEl = null;
  function hideTip() {
    if (tipEl) {
      tipEl.remove();
      tipEl = null;
    }
  }
  function bindTips() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-tip]"), function (n) {
      n.addEventListener("mouseenter", function () {
        hideTip();
        var r = n.getBoundingClientRect();
        tipEl = document.createElement("div");
        tipEl.className = "tooltip below";
        tipEl.textContent = n.getAttribute("data-tip");
        document.body.appendChild(tipEl);
        tipEl.style.left = r.left + r.width / 2 + "px";
        tipEl.style.top = r.bottom + 8 + "px";
        requestAnimationFrame(function () {
          tipEl.classList.add("show");
        });
      });
      n.addEventListener("mouseleave", hideTip);
    });
  }

  /* --------------------------------------------------------------- 数据 */

  var params = new URLSearchParams(location.search);
  var slug = params.get("slug") || "";
  var paper = null;
  (window.CET6_DATA.groups || []).forEach(function (g) {
    g.papers.forEach(function (p) {
      if (p.slug === slug) paper = p;
    });
  });

  if (!paper) {
    statusEl.classList.add("show");
    statusText.textContent = "未找到该试卷，请从列表页重新进入";
    return;
  }

  document.title = paper.title + " | 在线真题";
  document.getElementById("paperTitle").textContent = paper.slug
    .toUpperCase()
    .replace(/^(\d{4})-(\d{2})-/, "$1-$2-");
  document.getElementById("paperDate").textContent =
    paper.year + "年" + paper.month + "月";
  zoomValue.textContent = state.zoom + "%";

  /* ------------------------------------------------------------ 主题切换 */

  var SUN =
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>';
  var MOON = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
  var themeIcon = document.getElementById("themeIcon");

  function syncThemeIcon() {
    themeIcon.innerHTML = document.documentElement.classList.contains("dark") ? MOON : SUN;
  }

  document.getElementById("bTheme").addEventListener("click", function () {
    var dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch (e) {}
    syncThemeIcon();
  });
  syncThemeIcon();

  /* -------------------------------------------------------------- 批注层 */

  function inkCtx(page) {
    return page.ink.getContext("2d");
  }

  function redrawPage(page) {
    var ctx = inkCtx(page);
    if (!ctx) return;
    var dpr = Number(page.ink.dataset.dpr || 1);
    var w = page.ink.width / dpr;
    var h = page.ink.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    page.strokes.forEach(function (stroke) {
      drawStroke(ctx, stroke, w, h);
    });
  }

  function strokeWidth(stroke, w) {
    // 以页面宽度的比例定义线宽，缩放时保持视觉一致
    var base = stroke.tool === "highlighter" ? 0.022 : 0.0026;
    return Math.max(1, w * base);
  }

  function drawStroke(ctx, stroke, w, h) {
    if (stroke.points.length === 0) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle =
      stroke.tool === "highlighter" ? "rgba(255, 235, 59, 0.5)" : "#111111";
    ctx.lineWidth = strokeWidth(stroke, w);
    if (stroke.tool === "highlighter") {
      ctx.globalCompositeOperation = "multiply";
    }
    ctx.beginPath();
    stroke.points.forEach(function (p, i) {
      var x = p.x * w;
      var y = p.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (stroke.points.length === 1) {
      var p0 = stroke.points[0];
      ctx.lineTo(p0.x * w + 0.1, p0.y * h + 0.1);
    }
    ctx.stroke();
    ctx.restore();
  }

  function updateToolButtons() {
    var hasInk = state.pages.some(function (p) {
      return p.strokes.length > 0;
    });
    document.getElementById("tUndo").classList.toggle("is-disabled", state.history.length === 0);
    document.getElementById("tClear").classList.toggle("is-disabled", !hasInk);
    document.getElementById("tEraser").classList.toggle("is-disabled", !hasInk);

    ["tPointer", "tPencil", "tHighlight"].forEach(function (id) {
      var btn = document.getElementById(id);
      var map = { tPointer: "pointer", tPencil: "pencil", tHighlight: "highlighter" };
      btn.classList.toggle("is-active", state.tool === map[id]);
    });

    var eraserBtn = document.getElementById("tEraser");
    eraserBtn.classList.toggle("is-active", state.tool === "eraser");

    state.pages.forEach(function (p) {
      p.ink.classList.toggle("is-pointer", state.tool === "pointer");
      p.ink.style.cursor = state.tool === "eraser" ? "cell" : "crosshair";
    });
  }

  function setTool(tool) {
    state.tool = tool;
    updateToolButtons();
    hideHover();
  }

  ["tPointer", "tPencil", "tHighlight", "tEraser"].forEach(function (id) {
    document.getElementById(id).addEventListener("click", function () {
      var map = { tPointer: "pointer", tPencil: "pencil", tHighlight: "highlighter", tEraser: "eraser" };
      setTool(map[id]);
    });
  });

  document.getElementById("tUndo").addEventListener("click", function () {
    var last = state.history.pop();
    if (!last) return;
    var page = state.pages[last.pageIndex];
    if (!page) return;
    page.strokes.splice(last.strokeIndex, 1);
    redrawPage(page);
    updateToolButtons();
  });

  document.getElementById("tClear").addEventListener("click", function () {
    state.pages.forEach(function (p) {
      p.strokes = [];
      redrawPage(p);
    });
    state.history = [];
    updateToolButtons();
    toast("已清空全部批注");
  });

  function bindInk(page, pageIndex) {
    var drawing = null;
    var erasing = false;

    function pos(e) {
      var r = page.ink.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      };
    }

    page.ink.addEventListener("pointerdown", function (e) {
      if (state.tool === "pointer") return;
      e.preventDefault();
      try {
        page.ink.setPointerCapture(e.pointerId);
      } catch (err) {}

      if (state.tool === "eraser") {
        erasing = true;
        eraseAt(pos(e));
        return;
      }

      drawing = {
        tool: state.tool,
        points: [pos(e)],
      };
      page.strokes.push(drawing);
      state.history.push({ pageIndex: pageIndex, strokeIndex: page.strokes.length - 1 });
      redrawPage(page);
      updateToolButtons();
    });

    page.ink.addEventListener("pointermove", function (e) {
      if (!drawing && !erasing) return;
      e.preventDefault();
      if (erasing) {
        eraseAt(pos(e));
        return;
      }
      drawing.points.push(pos(e));
      redrawPage(page);
    });

    function endStroke(e) {
      if (e && page.ink.hasPointerCapture) {
        try {
          if (page.ink.hasPointerCapture(e.pointerId)) {
            page.ink.releasePointerCapture(e.pointerId);
          }
        } catch (err) {}
      }
      drawing = null;
      erasing = false;
    }

    page.ink.addEventListener("pointerup", endStroke);
    page.ink.addEventListener("pointercancel", endStroke);
    page.ink.addEventListener("pointerleave", endStroke);

    function eraseAt(p) {
      var radius = 0.018;
      var before = page.strokes.length;
      page.strokes = page.strokes.filter(function (stroke) {
        return !stroke.points.some(function (q) {
          return Math.abs(q.x - p.x) < radius && Math.abs(q.y - p.y) < radius;
        });
      });
      if (page.strokes.length !== before) {
        state.history = [];
        redrawPage(page);
        updateToolButtons();
      }
    }
  }

  /* ------------------------------------------------------------ PDF 渲染 */

  if (!window.pdfjsLib) {
    statusEl.classList.add("show");
    statusText.textContent = "PDF 引擎加载失败，请确认 assets/vendor/ 目录完整后刷新";
    return;
  }

  /* 浏览器禁止 file:// 页面用 fetch/XHR 读本地文件（同源策略把每个本地文件视作
     opaque origin），但 <script> 不受同源限制。因此 file:// 下改走 base64 资源：
     assets/pdf-b64/{slug}.js 把 PDF 以 base64 存进 window.CET6_PDFB64，
     解码成 Uint8Array 后交给 PDF.js —— 全程不经网络，也不需要本地服务器。 */
  var IS_FILE = location.protocol === "file:";

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var n = bin.length;
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function loadLocalPdf(slug) {
    return new Promise(function (resolve, reject) {
      var store = window.CET6_PDFB64 || (window.CET6_PDFB64 = {});

      function decode() {
        var b64 = store[slug];
        if (!b64) return reject(new Error("NO_DATA"));
        store[slug] = null; // 尽快释放这几十万字符
        var bytes;
        try {
          bytes = base64ToBytes(b64);
        } catch (e) {
          return reject(e);
        }
        b64 = null;
        // file:// 下创建 Worker 会抛 SecurityError，PDF.js 会自动退回主线程（fake worker）
        pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise.then(resolve, reject);
      }

      if (store[slug]) return decode();

      var s = document.createElement("script");
      s.src = "assets/pdf-b64/" + slug + ".js";
      s.onload = decode;
      s.onerror = function () {
        reject(new Error("NO_ASSET"));
      };
      document.head.appendChild(s);
    });
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = "assets/vendor/pdf.worker.min.js";

  statusEl.classList.add("show");
  if (IS_FILE) statusText.textContent = "正在读取本地试卷…";

  var docPromise = IS_FILE
    ? loadLocalPdf(paper.slug)
    : pdfjsLib.getDocument({ url: paper.pdf, isEvalSupported: false }).promise;

  docPromise
    .then(function (pdf) {
      state.pdf = pdf;
      state.numPages = pdf.numPages;
      buildPages();
      statusEl.classList.remove("show");
      pageCounter.textContent = "1 / " + state.numPages;
    })
    .catch(function (err) {
      console.error(err);
      statusEl.classList.add("show");
      statusText.textContent =
        err && err.message === "NO_ASSET"
          ? "缺少该套试卷的本地数据（assets/pdf-b64/），请确认目录完整后刷新"
          : "试卷文件加载失败，请确认 assets/pdf/ 内有该套试卷后刷新";
    });

  var renderObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var idx = Number(entry.target.getAttribute("data-index"));
          renderPage(idx);
        }
      });
    },
    { root: scrollEl, rootMargin: "600px 0px 600px 0px" }
  );

  function buildPages() {
    pagesEl.innerHTML = "";
    state.pages = [];
    state.history = [];

    for (var i = 0; i < state.numPages; i++) {
      var wrap = document.createElement("div");
      wrap.className = "pdf-page";
      wrap.setAttribute("data-index", i);

      var canvas = document.createElement("canvas");
      canvas.className = "page-canvas";
      var textLayer = document.createElement("div");
      textLayer.className = "text-layer";
      var ink = document.createElement("canvas");
      ink.className = "ink-layer is-pointer";

      wrap.appendChild(canvas);
      wrap.appendChild(textLayer);
      wrap.appendChild(ink);
      pagesEl.appendChild(wrap);

      var pageObj = {
        index: i,
        wrap: wrap,
        canvas: canvas,
        textLayer: textLayer,
        ink: ink,
        viewport: null,
        rendered: false,
        strokes: [],
      };
      state.pages.push(pageObj);
      bindInk(pageObj, i);

      // 先用 A4 比例占位，避免滚动抖动
      var scale = state.zoom / 100;
      var guessW = 595.28 * scale;
      var guessH = 841.89 * scale;
      wrap.style.width = guessW + "px";
      wrap.style.height = guessH + "px";
      ink.dataset.dpr = "1";
      ink.width = Math.floor(guessW);
      ink.height = Math.floor(guessH);
      ink.style.width = guessW + "px";
      ink.style.height = guessH + "px";

      renderObserver.observe(wrap);
    }

    updateToolButtons();
    updateCurrentPage();
  }

  function renderPage(index) {
    var p = state.pages[index];
    if (!p) return;
    var scale = state.zoom / 100;

    state.pdf.getPage(index + 1).then(function (pg) {
      var viewport = pg.getViewport({ scale: scale });
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      p.viewport = viewport;
      p.wrap.style.width = viewport.width + "px";
      p.wrap.style.height = viewport.height + "px";

      p.canvas.width = Math.floor(viewport.width * dpr);
      p.canvas.height = Math.floor(viewport.height * dpr);
      p.canvas.style.width = viewport.width + "px";
      p.canvas.style.height = viewport.height + "px";

      var ctx = p.canvas.getContext("2d");
      ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);

      pg.render({
        canvasContext: ctx,
        viewport: viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      }).promise.then(function () {
        p.rendered = true;
      });

      p.ink.width = Math.floor(viewport.width * dpr);
      p.ink.height = Math.floor(viewport.height * dpr);
      p.ink.style.width = viewport.width + "px";
      p.ink.style.height = viewport.height + "px";
      p.ink.dataset.dpr = String(dpr);
      redrawPage(p);

      renderTextLayer(p, pg, viewport);
    });
  }

  /* 文本层：不可见文字覆盖在画布上，用来取词、选中、复制。
     每次渲染换一个全新的 div —— PDF.js 的 renderTextLayer 是异步的，
     若复用同一个容器，上一轮未结束的任务会继续往里追加，导致节点成倍累积。 */
  function renderTextLayer(p, pg, viewport) {
    if (!pdfjsLib.renderTextLayer) return;
    var token = (p.textToken || 0) + 1;
    p.textToken = token;

    pg.getTextContent().then(function (textContent) {
      if (p.textToken !== token) return;

      var layer = document.createElement("div");
      layer.className = "text-layer";
      layer.style.width = viewport.width + "px";
      layer.style.height = viewport.height + "px";
      layer.style.setProperty("--scale-factor", String(viewport.scale));

      if (p.textLayer && p.textLayer.parentNode) {
        p.textLayer.parentNode.replaceChild(layer, p.textLayer);
      } else if (p.ink && p.ink.parentNode) {
        p.ink.parentNode.insertBefore(layer, p.ink);
      } else {
        p.wrap.appendChild(layer);
      }
      p.textLayer = layer;

      var task = pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: layer,
        viewport: viewport,
        textDivs: [],
      });
      if (task && task.promise) task.promise.catch(function () {});
    }).catch(function () {});
  }

  /* -------------------------------------------------------------- 缩放 */

  function setZoom(next) {
    next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (next === state.zoom) return;

    var firstPage = state.pages[state.currentPage - 1];
    var ratio = 0;
    if (firstPage && firstPage.wrap) {
      var r = firstPage.wrap.getBoundingClientRect();
      ratio = Math.min(1, Math.max(0, (scrollEl.getBoundingClientRect().top - r.top) / r.height));
    }

    state.zoom = next;
    zoomValue.textContent = next + "%";
    hideHover();

    state.pages.forEach(function (p) {
      p.rendered = false;
      renderPage(p.index);
    });

    requestAnimationFrame(function () {
      var page = state.pages[state.currentPage - 1];
      if (!page) return;
      var top =
        page.wrap.offsetTop + page.wrap.offsetHeight * ratio - 72;
      scrollEl.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    });
  }

  document.getElementById("zoomIn").addEventListener("click", function () {
    setZoom(state.zoom + STEP);
  });
  document.getElementById("zoomOut").addEventListener("click", function () {
    setZoom(state.zoom - STEP);
  });

  /* ------------------------------------------------------------ 页码导航 */

  function updateCurrentPage() {
    var mid = scrollEl.getBoundingClientRect().top + scrollEl.clientHeight * 0.4;
    var current = 1;
    state.pages.forEach(function (p) {
      var r = p.wrap.getBoundingClientRect();
      if (r.top <= mid) current = p.index + 1;
    });
    if (current !== state.currentPage) {
      state.currentPage = current;
      pageCounter.textContent = current + " / " + state.numPages;
    }
  }

  function goToPage(n) {
    var page = state.pages[n - 1];
    if (!page) return;
    scrollEl.scrollTo({ top: page.wrap.offsetTop - 72, behavior: "smooth" });
  }

  document.getElementById("pagePrev").addEventListener("click", function () {
    goToPage(Math.max(1, state.currentPage - 1));
  });
  document.getElementById("pageNext").addEventListener("click", function () {
    goToPage(Math.min(state.numPages, state.currentPage + 1));
  });

  scrollEl.addEventListener(
    "scroll",
    function () {
      updateCurrentPage();
      pageNav.classList.toggle("is-hidden", scrollEl.scrollTop < 80);
    },
    { passive: true }
  );

  /* ------------------------------------------------------------ 页面目录 */

  var outlinePop = null;

  document.getElementById("bOutline").addEventListener("click", function (e) {
    e.stopPropagation();
    if (outlinePop) {
      outlinePop.remove();
      outlinePop = null;
      return;
    }
    outlinePop = document.createElement("div");
    outlinePop.className = "popover open";
    outlinePop.style.position = "fixed";
    outlinePop.style.width = "11rem";
    outlinePop.style.top = "56px";
    var grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(5, minmax(0, 1fr))";
    grid.style.gap = "0.375rem";

    for (var i = 1; i <= state.numPages; i++) {
      (function (n) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "year-cell" + (n === state.currentPage ? " active" : "");
        b.textContent = String(n);
        b.addEventListener("click", function () {
          goToPage(n);
          outlinePop.remove();
          outlinePop = null;
        });
        grid.appendChild(b);
      })(i);
    }
    outlinePop.appendChild(grid);
    document.body.appendChild(outlinePop);
    var r = e.currentTarget.getBoundingClientRect();
    outlinePop.style.left = Math.min(window.innerWidth - 190, r.left - 20) + "px";
  });

  document.addEventListener("click", function () {
    if (outlinePop) {
      outlinePop.remove();
      outlinePop = null;
    }
  });

  /* -------------------------------------------------------------- 听力 */
  //
  // 音源优先级：本地文件 > 原站 HLS。
  // 本地文件约定放在 assets/audio/{slug}.mp3（也支持 .m4a / .wav），
  // 与 assets/pdf/{slug}.pdf 同一套 slug 命名，丢进去就能用，无需改任何配置。
  // 三个扩展名全部未命中时，才回落到原站 HLS——那条链路是 AES-128 加密，
  // 密钥接口要求登录（未登录 401），所以基本必然失败，失败后给出说明。

  var LOCAL_AUDIO_EXTS = ["mp3", "m4a", "wav"];
  var LOCAL_AUDIO_TIMEOUT = 2500;

  var hls = null;
  var audioReady = false; // 是否已经确定过音源
  var audioSource = ""; // "local" | "remote"
  var trialToken = 0; // 作废上一轮探测

  function teardownHls() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }

  function audioFail() {
    trialToken++;
    teardownHls();
    audioBar.classList.remove("show");
    audioEl.pause();
    audioEl.removeAttribute("src");
    audioReady = false;
    audioSource = "";
    if (!paper.audio) {
      toast("该试卷暂无听力音频（也未找到本地音频）");
      return;
    }
    toast("未找到本地音频；原站音频受登录保护，无法解密播放");
  }

  function startRemoteAudio() {
    if (!paper.audio) {
      audioFail();
      return;
    }
    if (audioEl.canPlayType("application/vnd.apple.mpegurl")) {
      audioSource = "remote";
      // 监听器必须一次性：否则失败后重试时，旧的 error 回调会把新一轮探测再次打断
      var onNativeErr = function () {
        audioEl.removeEventListener("error", onNativeErr);
        audioFail();
      };
      audioEl.addEventListener("error", onNativeErr);
      audioEl.src = paper.audio;
    } else if (window.Hls && window.Hls.isSupported()) {
      audioSource = "remote";
      hls = new window.Hls();
      hls.on(window.Hls.Events.ERROR, function (evt, data) {
        if (!data || !data.fatal) return;
        audioFail();
      });
      hls.loadSource(paper.audio);
      hls.attachMedia(audioEl);
    } else {
      toast("当前浏览器不支持 HLS 音频播放");
      audioBar.classList.remove("show");
      audioReady = false;
      return;
    }
    audioEl.play().catch(function () {});
  }

  // 清单命中：直接播本地文件；万一文件被删/损坏，再退回按扩展名探测
  function playLocalUrl(url) {
    var token = ++trialToken;
    function onErr() {
      audioEl.removeEventListener("error", onErr);
      if (token !== trialToken) return;
      tryLocalAudio(0);
    }
    audioEl.addEventListener("error", onErr);
    audioSource = "local";
    audioEl.src = url;
    audioEl.load();
    audioEl.play().catch(function () {});
  }

  function tryLocalAudio(idx) {
    if (idx >= LOCAL_AUDIO_EXTS.length) {
      startRemoteAudio();
      return;
    }
    var token = ++trialToken;
    var done = false;
    var timer = 0;
    var url = "assets/audio/" + paper.slug + "." + LOCAL_AUDIO_EXTS[idx];

    function cleanup() {
      clearTimeout(timer);
      audioEl.removeEventListener("loadedmetadata", onOk);
      audioEl.removeEventListener("error", onErr);
    }

    function onOk() {
      if (done || token !== trialToken) return;
      done = true;
      cleanup();
      audioSource = "local";
      audioEl.play().catch(function () {});
    }

    function onErr() {
      if (done || token !== trialToken) return;
      done = true;
      cleanup();
      tryLocalAudio(idx + 1);
    }

    audioEl.addEventListener("loadedmetadata", onOk);
    audioEl.addEventListener("error", onErr);
    // 极端情况下（某些协议下不抛 error）用超时兜底，避免卡死在空白播放器
    timer = setTimeout(onErr, LOCAL_AUDIO_TIMEOUT);

    audioEl.src = url;
    audioEl.load();
  }

  document.getElementById("bAudio").addEventListener("click", function () {
    var show = audioBar.classList.toggle("show");
    if (!show) {
      audioEl.pause();
      return;
    }
    if (audioReady) return;
    audioReady = true;
    teardownHls();

    // 清单里显式标注为 null = 这套确实没有任何音源，不必再联网试
    var known = window.CET6_AUDIO ? window.CET6_AUDIO[paper.slug] : undefined;
    if (known === null) {
      audioBar.classList.remove("show");
      audioReady = false;
      toast("该套听力音频暂缺（来源站未收录）");
      return;
    }
    if (typeof known === "string" && known) {
      playLocalUrl(known);
      return;
    }
    tryLocalAudio(0);
  });

  /* ------------------------------------------------------------ 下载/全屏 */

  document.getElementById("bDownload").addEventListener("click", function () {
    window.open(paper.pdf, "_blank", "noopener");
  });

  var fsBtn = document.getElementById("bFullscreen");

  function syncFullscreen() {
    var isFs = Boolean(document.fullscreenElement);
    fsBtn.setAttribute("data-tip", isFs ? "退出全屏" : "进入全屏");
    fsBtn.setAttribute("aria-label", isFs ? "退出全屏" : "进入全屏");
  }

  fsBtn.addEventListener("click", function () {
    if (!document.fullscreenElement) {
      var root = document.documentElement;
      if (!root.requestFullscreen) {
        toast("当前浏览器不支持网页全屏");
        return;
      }
      root.requestFullscreen().catch(function () {
        toast("当前浏览器阻止了网页全屏");
      });
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener("fullscreenchange", syncFullscreen);

  /* -------------------------------------------------------- 点词查义 */

  /* PDF 里没有字符信息，只有画好的图形；点词要先有一层「透明文字」叠在画面上。
     这层就是 .text-layer（PDF.js renderTextLayer 生成），文字设为透明色，
     视觉上完全看不见，但浏览器仍能对它做光标定位和选区。 */

  var dictLoaded = false;
  var dictLoading = null;
  var dictCard = null;

  function loadDict() {
    if (dictLoaded) return Promise.resolve(true);
    if (dictLoading) return dictLoading;
    dictLoading = new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = "assets/dict/cet6.js";
      s.onload = function () {
        dictLoaded = true;
        resolve(true);
      };
      s.onerror = function () {
        resolve(false);
      };
      document.head.appendChild(s);
    });
    return dictLoading;
  }

  function caretFromPoint(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      var r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    }
    return null;
  }

  var WORD_CHAR = /[A-Za-z\u00C0-\u024F'\-]/;

  function wordAt(cx, cy) {
    var range = caretFromPoint(cx, cy);
    if (!range) return null;
    var node = range.startContainer;
    if (node.nodeType !== 3) return null;
    var text = node.textContent || "";
    var off = range.startOffset;
    if (!text) return null;

    var start = off;
    var end = off;
    while (start > 0 && WORD_CHAR.test(text.charAt(start - 1))) start--;
    while (end < text.length && WORD_CHAR.test(text.charAt(end))) end++;

    var raw = text.slice(start, end);
    var word = raw.replace(/^['\-]+/, "").replace(/['\-]+$/, "");
    if (!word || !/[A-Za-z]/.test(word)) return null;
    if (word.length < 2) return null;

    // 记录高亮范围，供弹层下方画下划线用
    var rect = null;
    try {
      var r2 = document.createRange();
      r2.setStart(node, start);
      r2.setEnd(node, start + word.length);
      var rects = r2.getClientRects();
      if (rects.length) rect = rects[0];
    } catch (e) {}

    return { word: word, rect: rect };
  }

  /* ---------------------------- 悬停高亮 ---------------------------- */

  /* 文本层是透明的，肉眼看不到「词」在哪里，鼠标划过时容易不知道会点到哪个词。
     这里用一层固定定位的方框，套住光标下的那个单词（底纹 + 描边）。 */

  var hoverBox = null;
  var hoverKey = "";
  var hoverRaf = 0;
  var hoverPoint = null;

  function ensureHoverBox() {
    if (hoverBox && hoverBox.parentNode) return hoverBox;
    hoverBox = document.createElement("div");
    hoverBox.className = "word-hover";
    document.body.appendChild(hoverBox);
    return hoverBox;
  }

  function hideHoverBox() {
    hoverKey = "";
    if (hoverBox) hoverBox.classList.remove("show");
  }

  function hideHover() {
    hideHoverBox();
    hoverPoint = null;
    if (hoverRaf) {
      cancelAnimationFrame(hoverRaf);
      hoverRaf = 0;
    }
  }

  /* 只在真正命中文字时才算数：页边空白处 caretRangeFromPoint 会「吸附」到最近的字符，
     不校验就会在空白处标出老远的一个词。 */
  function hoverTarget(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || !el.closest) return null;
    if (!el.closest(".text-layer")) return null;

    var found = wordAt(x, y);
    if (!found || !found.rect) return null;

    var r = found.rect;
    var padY = r.height * 0.55 + 2;
    if (y < r.top - padY || y > r.bottom + padY) return null;
    if (x < r.left - 6 || x > r.right + 6) return null;
    return found;
  }

  function paintHover(found) {
    var box = ensureHoverBox();
    var r = found.rect;
    var pad = 2;
    box.style.width = Math.max(4, Math.round(r.width + pad * 2)) + "px";
    box.style.height = Math.max(4, Math.round(r.height + pad * 2)) + "px";
    box.style.left = Math.round(r.left - pad) + "px";
    box.style.top = Math.round(r.top - pad) + "px";
    box.classList.add("show");
  }

  function onHoverMove(e) {
    hoverPoint = { x: e.clientX, y: e.clientY };
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(function () {
      hoverRaf = 0;
      var p = hoverPoint;
      if (!p) return;

      // 画笔 / 荧光笔 / 橡皮模式下不干扰
      if (state.tool !== "pointer") {
        hideHoverBox();
        return;
      }
      // 正在划选文字时不显示，免得盖住选区
      var sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && String(sel).trim()) {
        hideHoverBox();
        return;
      }

      var found = hoverTarget(p.x, p.y);
      if (!found || !found.rect) {
        hideHoverBox();
        return;
      }

      var r = found.rect;
      var key = found.word + "@" + Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.width);
      if (key === hoverKey) return;
      hoverKey = key;
      paintHover(found);
    });
  }

  pagesEl.addEventListener("mousemove", onHoverMove, { passive: true });
  pagesEl.addEventListener("mouseleave", hideHover);

  /* 滚动 / 缩放后坐标全变了，按最后鼠标位置重算一次（鼠标没动也要跟上） */
  scrollEl.addEventListener(
    "scroll",
    function () {
      if (!hoverPoint) return;
      hoverKey = "";
      onHoverMove({ clientX: hoverPoint.x, clientY: hoverPoint.y });
    },
    { passive: true }
  );
  window.addEventListener("resize", hideHover);

  function lookup(word) {
    var key = word.toLowerCase();
    var dict = window.CET6_DICT || {};
    var exch = window.CET6_EXCH || {};
    var hit = dict[key];
    var base = key;
    if (!hit && exch[key]) {
      base = exch[key];
      hit = dict[base];
    }
    if (!hit) {
      // 规则还原：复数 / 三单 / 过去式 / 进行时
      var cands = [];
      if (/ies$/.test(key)) cands.push(key.slice(0, -3) + "y");
      if (/es$/.test(key)) cands.push(key.slice(0, -2));
      if (/s$/.test(key)) cands.push(key.slice(0, -1));
      if (/ied$/.test(key)) cands.push(key.slice(0, -3) + "y");
      if (/ed$/.test(key)) cands.push(key.slice(0, -2), key.slice(0, -1));
      if (/ing$/.test(key)) cands.push(key.slice(0, -3), key.slice(0, -3) + "e");
      if (/ly$/.test(key)) cands.push(key.slice(0, -2));
      for (var i = 0; i < cands.length; i++) {
        if (dict[cands[i]]) {
          base = cands[i];
          hit = dict[base];
          break;
        }
      }
    }
    if (!hit) return null;
    return { base: base, phonetic: hit[0] || "", translation: hit[1] || "" };
  }

  function ensureCard() {
    if (dictCard) return dictCard;
    dictCard = document.createElement("div");
    dictCard.className = "dict-card";
    dictCard.innerHTML =
      '<div class="dict-head">' +
      '<span class="dict-word"></span>' +
      '<button class="dict-speak" type="button" aria-label="朗读">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" />' +
      "</svg></button>" +
      "</div>" +
      '<div class="dict-phonetic"></div>' +
      '<div class="dict-body"></div>' +
      '<div class="dict-foot"></div>';
    document.body.appendChild(dictCard);

    dictCard.querySelector(".dict-speak").addEventListener("click", function (e) {
      e.stopPropagation();
      speak(dictCard.getAttribute("data-word"));
    });
    return dictCard;
  }

  function speak(word) {
    if (!word || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(word);
      u.lang = "en-US";
      u.rate = 0.9;
      var voices = window.speechSynthesis.getVoices() || [];
      for (var i = 0; i < voices.length; i++) {
        if (/en[-_]US/i.test(voices[i].lang)) {
          u.voice = voices[i];
          break;
        }
      }
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function hideDict() {
    if (dictCard) dictCard.classList.remove("show");
  }

  function placeCard(rect, cx, cy) {
    var card = dictCard;
    if (!card) return;

    var pad = 10;
    var topBar = 76;
    var bottomEdge = window.innerHeight - 12;
    var MIN_H = 108; // 再矮就看不清释义了

    // 用 offsetWidth/offsetHeight 而非 getBoundingClientRect：后者含入场缩放，量出来偏小
    card.style.maxHeight = "";
    var w = card.offsetWidth;
    var h = card.offsetHeight;

    var aTop = rect ? rect.top : cy;
    var aBottom = rect ? rect.bottom : cy;
    var above = aTop - pad - topBar;
    var below = bottomEdge - aBottom - pad;

    // 优先放上方：卡片压住的都是刚读完的行，不会挡住接下来要读的正文
    var side = "above";
    if (above < MIN_H) side = "below";
    if (side === "below" && below < MIN_H && above > below) side = "above";

    var top, maxH;
    if (side === "above") {
      // 从工具栏下沿到词顶，就是卡片能用的全部高度
      var limit = Math.max(0, aTop - topBar - 2);
      maxH = Math.min(h, Math.max(MIN_H, limit));
      top = aTop - maxH - pad;
      if (top < topBar) top = topBar;
    } else {
      var limit2 = Math.max(0, bottomEdge - aBottom - 2);
      maxH = Math.min(h, Math.max(MIN_H, limit2));
      top = aBottom + pad;
    }
    // 空间确实不够时压缩卡片（内部可滚动），而不是越界或盖住正文
    card.style.maxHeight = maxH + "px";

    var left = (rect ? rect.left : cx) + (rect ? rect.width / 2 : 0) - w / 2;
    left = Math.max(12, Math.min(window.innerWidth - w - 12, left));
    top = Math.max(8, Math.min(window.innerHeight - 24, top));

    card.style.left = Math.round(left) + "px";
    card.style.top = Math.round(top) + "px";
  }

  function showDict(word, rect, cx, cy) {
    var card = ensureCard();
    var info = lookup(word);

    card.setAttribute("data-word", info ? info.base : word);
    card.querySelector(".dict-word").textContent = info ? info.base : word;
    card.querySelector(".dict-phonetic").textContent = info && info.phonetic ? "/" + info.phonetic + "/" : "";
    card.querySelector(".dict-body").textContent = info
      ? info.translation
      : "本地词典未收录该词。";
    card.querySelector(".dict-foot").textContent =
      info && info.base !== word.toLowerCase() ? "原形：" + info.base : "";
    card.querySelector(".dict-speak").style.display = info ? "" : "none";

    card.classList.add("show");
    placeCard(rect, cx, cy);
  }

  /* 词典首次加载有 1.3 MB，先弹个占位，避免点了没反应 */
  function showDictLoading(word, rect, cx, cy) {
    var card = ensureCard();
    card.setAttribute("data-word", word);
    card.querySelector(".dict-word").textContent = word;
    card.querySelector(".dict-phonetic").textContent = "";
    card.querySelector(".dict-body").textContent = "正在加载本地词典…";
    card.querySelector(".dict-foot").textContent = "";
    card.querySelector(".dict-speak").style.display = "none";
    card.classList.add("show");
    placeCard(rect, cx, cy);
  }

  pagesEl.addEventListener("click", function (e) {
    if (state.tool !== "pointer") return;
    var hitLayer = e.target && e.target.closest ? e.target.closest(".text-layer") : null;
    if (!hitLayer) {
      hideDict();
      return;
    }
    // 正在拖选一段文字时不要弹卡片，否则会打断复制
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) {
      hideDict();
      return;
    }
    var found = wordAt(e.clientX, e.clientY);
    if (!found) {
      hideDict();
      return;
    }
    e.preventDefault();
    // 这次点击已经由页面自己处理了（查词），不要再冒泡到 document 的「点外部关闭」，
    // 否则卡片刚 show 出来就被同一个事件关掉。
    e.stopPropagation();

    if (dictLoaded) {
      showDict(found.word, found.rect, e.clientX, e.clientY);
      return;
    }
    showDictLoading(found.word, found.rect, e.clientX, e.clientY);
    loadDict().then(function (ok) {
      if (!ok) {
        toast("词典资源缺失，无法查询");
        hideDict();
        return;
      }
      showDict(found.word, found.rect, e.clientX, e.clientY);
    });
  });

  document.addEventListener("click", function (e) {
    if (!dictCard || !dictCard.classList.contains("show")) return;
    if (dictCard.contains(e.target)) return;
    hideDict();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideDict();
  });

  scrollEl.addEventListener("scroll", hideDict, { passive: true });
  window.addEventListener("resize", hideDict);

  /* ------------------------------------------------------------- 初始化 */

  bindTips();
  updateToolButtons();

  try {
    if (!localStorage.getItem("cet6:dictHint")) {
      localStorage.setItem("cet6:dictHint", "1");
      setTimeout(function () {
        toast("小提示：点击文中的英文单词即可查看释义");
      }, 3200);
    }
  } catch (e) {}
})();
