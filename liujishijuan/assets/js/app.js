/* 分类页逻辑：分页加载、年份筛选、主题切换、滚动浮层、入场动画 */
(function () {
  "use strict";

  var DATA = window.CET6_DATA;
  var PAGE_SIZE = 1; // 与原站一致：每次加载 1 个月份分组
  var INITIAL_GROUPS = 2; // 首屏服务端渲染 2 组

  var scroller = document.getElementById("scroller");
  var groupsEl = document.getElementById("groups");
  var loaderRow = document.getElementById("loaderRow");
  var pageTitle = document.getElementById("pageTitle");
  var toTop = document.getElementById("toTop");
  var yearBtn = document.getElementById("yearBtn");
  var yearDot = document.getElementById("yearDot");
  var yearPopover = document.getElementById("yearPopover");
  var yearGrid = document.getElementById("yearGrid");
  var themeBtn = document.getElementById("themeBtn");
  var themeIcon = document.getElementById("themeIcon");

  var state = {
    allGroups: DATA.groups.slice(),
    groups: [],
    page: 0,
    hasMore: false,
    selectedYear: null,
    loading: false,
  };

  /* ---------------------------------------------------------------- 工具 */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function toast(message) {
    var layer = document.getElementById("toastLayer");
    var box = el("div", "toast");
    box.appendChild(el("span", null, message));
    layer.appendChild(box);
    setTimeout(function () {
      box.classList.add("out");
      setTimeout(function () {
        box.remove();
      }, 200);
    }, 2400);
  }

  var SPINNER =
    '<svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  var FILE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';

  /* ------------------------------------------------------------ 卡片渲染 */

  function renderCard(paper, index) {
    var wrap = el("div", "card");
    wrap.style.transitionDelay = index * 100 + "ms";

    var a = el("a", "card-link");
    a.href = "paper.html?slug=" + encodeURIComponent(paper.slug);

    var inner = el("div", "card-inner");
    var media = el("div", "card-media");

    if (paper.cover) {
      var img = document.createElement("img");
      img.src = paper.cover;
      img.alt = paper.title;
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", function () {
        img.remove();
        media.appendChild(fallback());
      });
      media.appendChild(img);
    } else {
      media.appendChild(fallback());
    }

    var caption = el("div", "card-caption");
    var capInner = el("div", "card-caption-inner");
    var h3 = el("h3", null, paper.title);
    h3.title = paper.title;
    capInner.appendChild(h3);
    caption.appendChild(capInner);
    media.appendChild(caption);

    inner.appendChild(media);
    a.appendChild(inner);
    wrap.appendChild(a);

    a.addEventListener("click", function () {
      try {
        sessionStorage.setItem("cet6:scroll", String(scroller.scrollTop));
        sessionStorage.setItem("cet6:year", state.selectedYear || "");
      } catch (e) {}
    });

    return wrap;
  }

  function fallback() {
    var box = el("div", "card-fallback");
    box.innerHTML = FILE_ICON;
    box.appendChild(el("p", null, "PDF 预览"));
    return box;
  }

  var revealObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { root: scroller, rootMargin: "0px 0px -50px 0px", threshold: 0 }
  );

  function renderGroup(group) {
    var box = el("div", "group");
    var head = el("div", "group-head");
    head.appendChild(el("h2", null, group.label));
    box.appendChild(head);

    var cards = el("div", "cards");
    group.papers.forEach(function (paper, i) {
      cards.appendChild(renderCard(paper, i));
    });
    box.appendChild(cards);

    groupsEl.appendChild(box);
    revealObserver.observe(box);

    // 已在视口内的分组立即淡入（避免首屏/回滚时等待观察器回调）
    requestAnimationFrame(function () {
      var r = box.getBoundingClientRect();
      var vp = scroller.getBoundingClientRect();
      if (r.top < vp.bottom - 50 && r.bottom > vp.top) {
        box.classList.add("is-in");
        revealObserver.unobserve(box);
      }
    });

    return box;
  }

  /* -------------------------------------------------------------- 分页 */

  function updateLoader() {
    if (state.loading) {
      loaderRow.innerHTML = SPINNER;
    } else if (!state.hasMore && state.groups.length > 0) {
      loaderRow.innerHTML = '<p style="color:hsl(var(--muted-foreground));font-size:.875rem">到底了</p>';
    } else {
      loaderRow.innerHTML = "";
    }
  }

  function loadMore() {
    if (state.loading || !state.hasMore) return;
    state.loading = true;
    updateLoader();

    setTimeout(function () {
      var slice = state.allGroups.slice(
        state.page * PAGE_SIZE,
        state.page * PAGE_SIZE + PAGE_SIZE
      );
      slice.forEach(renderGroup);
      state.groups = state.groups.concat(slice);
      state.page += 1;
      state.hasMore = state.page * PAGE_SIZE < state.allGroups.length;
      state.loading = false;
      updateLoader();
      // 新加载内容仍未铺满视口时继续追加
      if (state.hasMore) {
        var box = groupsEl.getBoundingClientRect();
        if (box.height < scroller.clientHeight) loadMore();
      }
    }, 220);
  }

  function reset() {
    groupsEl.innerHTML = "";
    state.groups = [];
    state.page = 0;
    state.loading = false;

    var first = state.allGroups.slice(0, INITIAL_GROUPS);
    first.forEach(renderGroup);
    state.groups = first;
    state.page = first.length;
    state.hasMore = state.page < state.allGroups.length;
    updateLoader();

    scroller.scrollTo({ top: 0, behavior: "auto" });
    if (state.hasMore) scheduleFill();
  }

  function scheduleFill() {
    setTimeout(function () {
      var box = groupsEl.getBoundingClientRect();
      if (state.hasMore && box.height < scroller.clientHeight) loadMore();
    }, 60);
  }

  /* ------------------------------------------------------- 无限滚动哨兵 */

  var sentinel = el("div");
  sentinel.style.height = "1px";
  loaderRow.parentNode.appendChild(sentinel);

  function checkSentinel() {
    if (!state.hasMore) return;
    var rect = sentinel.getBoundingClientRect();
    var viewport = scroller.getBoundingClientRect();
    if (rect.top < viewport.bottom + 500) loadMore();
  }

  var sentinelObserver = new IntersectionObserver(
    function (entries) {
      if (entries[0].isIntersecting) loadMore();
    },
    { root: scroller, rootMargin: "0px 0px 500px 0px" }
  );
  sentinelObserver.observe(sentinel);

  /* 滚动兜底：距底部 600px 内继续加载 */
  scroller.addEventListener(
    "scroll",
    function () {
      if (!state.hasMore || state.loading) return;
      if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 600) {
        loadMore();
      }
    },
    { passive: true }
  );

  /* ---------------------------------------------------------- 年份筛选 */

  function buildYearGrid() {
    yearGrid.innerHTML = "";
    var all = el("button", "year-cell" + (state.selectedYear === null ? " active" : ""), "全部");
    all.type = "button";
    all.addEventListener("click", function () {
      selectYear(null);
    });
    yearGrid.appendChild(all);

    DATA.category.availableYears.forEach(function (y) {
      var btn = el(
        "button",
        "year-cell" + (state.selectedYear === y ? " active" : ""),
        String(y)
      );
      btn.type = "button";
      btn.addEventListener("click", function () {
        selectYear(y);
      });
      yearGrid.appendChild(btn);
    });
  }

  function selectYear(year) {
    state.selectedYear = year;
    yearDot.hidden = year === null;
    yearPopover.classList.remove("open");
    yearBtn.setAttribute("aria-expanded", "false");
    buildYearGrid();
    applyFilter();
  }

  function applyFilter() {
    state.allGroups =
      state.selectedYear === null
        ? DATA.groups.slice()
        : DATA.groups.filter(function (g) {
            return g.year === state.selectedYear;
          });
    reset();
  }

  yearBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = yearPopover.classList.toggle("open");
    yearBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.addEventListener("click", function (e) {
    if (!yearPopover.contains(e.target) && e.target !== yearBtn) {
      yearPopover.classList.remove("open");
      yearBtn.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      yearPopover.classList.remove("open");
      closeAccount();
    }
  });

  /* ---------------------------------------------------------- 主题切换 */

  var SUN =
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>';
  var MOON = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';

  function syncThemeIcon() {
    themeIcon.innerHTML = document.documentElement.classList.contains("dark")
      ? MOON
      : SUN;
  }

  themeBtn.addEventListener("click", function () {
    var dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch (e) {}
    syncThemeIcon();
  });

  syncThemeIcon();

  /* --------------------------------------------------------- 滚动浮层 */

  function onScroll() {
    var top = scroller.scrollTop;
    pageTitle.classList.toggle("is-hidden", top >= 48);
    toTop.classList.toggle("is-hidden", top <= 480);
  }

  scroller.addEventListener("scroll", onScroll, { passive: true });
  toTop.addEventListener("click", function () {
    scroller.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ------------------------------------------------------------ 提示条 */

  var tipEl = null;

  function showTip(target) {
    var text = target.getAttribute("data-tip");
    if (!text) return;
    hideTip();
    tipEl = el("div", "tooltip", text);
    document.body.appendChild(tipEl);
    var r = target.getBoundingClientRect();
    var below = r.top < 56;
    tipEl.classList.toggle("below", below);
    tipEl.style.left = r.left + r.width / 2 + "px";
    if (below) {
      tipEl.style.top = r.bottom + 8 + "px";
    } else {
      tipEl.style.top = r.top - tipEl.offsetHeight - 8 + "px";
    }
    requestAnimationFrame(function () {
      tipEl.classList.add("show");
    });
  }

  function hideTip() {
    if (tipEl) {
      tipEl.remove();
      tipEl = null;
    }
  }

  Array.prototype.forEach.call(
    document.querySelectorAll("[data-tip]"),
    function (node) {
      node.addEventListener("mouseenter", function () {
        showTip(node);
      });
      node.addEventListener("mouseleave", hideTip);
      node.addEventListener("blur", hideTip);
    }
  );

  /* ---------------------------------------------------------- 账户弹窗 */

  var accountMask = document.getElementById("accountMask");

  function closeAccount() {
    accountMask.classList.remove("open");
  }

  document.getElementById("userBtn").addEventListener("click", function () {
    accountMask.classList.add("open");
  });

  accountMask.addEventListener("click", function (e) {
    if (e.target === accountMask) closeAccount();
  });

  document.getElementById("accForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("accEmail").value.trim();
    var pwd = document.getElementById("accPwd").value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast("请输入有效的邮箱地址");
      return;
    }
    if (pwd.length < 6) {
      toast("密码至少 6 位");
      return;
    }
    try {
      localStorage.setItem("cet6:account", JSON.stringify({ email: email }));
    } catch (err) {}
    closeAccount();
    toast("已登录：" + email);
  });

  /* ------------------------------------------------------------- 初始化 */

  function restoreScroll() {
    var saved = null;
    var year = null;
    try {
      saved = sessionStorage.getItem("cet6:scroll");
      year = sessionStorage.getItem("cet6:year");
      sessionStorage.removeItem("cet6:scroll");
      sessionStorage.removeItem("cet6:year");
    } catch (e) {}
    if (saved === null) return false;

    if (year) {
      state.selectedYear = Number(year) || null;
      yearDot.hidden = state.selectedYear === null;
      buildYearGrid();
      state.allGroups = DATA.groups.filter(function (g) {
        return g.year === state.selectedYear;
      });
    }
    reset();
    setTimeout(function () {
      var target = Number(saved) || 0;
      scroller.scrollTo({ top: target, behavior: "auto" });
      onScroll();
      if (state.hasMore) {
        var rect = sentinel.getBoundingClientRect();
        if (rect.top < scroller.getBoundingClientRect().bottom + 500) loadMore();
      }
    }, 300);
    return true;
  }

  buildYearGrid();
  pageTitle.textContent = DATA.category.name;
  if (!restoreScroll()) reset();
  onScroll();
})();
