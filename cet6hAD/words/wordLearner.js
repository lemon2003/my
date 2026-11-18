// wordLearner.js —— 单词卡片学习器
// 交互：单词随机散落、点击查看释义、可标记。
//
// 同屏规则（2026-11-08 改版）：
//   1. 屏幕上最多 20 张卡片，**标记卡片也占位置**（旧版只限制未标记卡片，标记卡会无限堆积把屏幕挤满）。
//   2. 新词进来时从"消失队列"队首开始找：已标记的跳过，删掉第一张未标记的，新词补进去。
//   3. 20 张全部被标记 → 不放入新词、计数不前进，弹框提示先背完当前这一屏。
//   4. 取消标记 → 该卡片移到消失队列队尾，成为最后一个才会被淘汰的（不会立刻消失）。
// 消失队列 queue 的顺序就是卡片出现的先后顺序，与几何位置无关。
class WordLearner {
    constructor(words, options) {
        this.words = words;
        this.currentWordIndex = 0;

        this.placedWords = [];      // 当前在屏上的卡片 { element, index, x, y, width, height }
        this.queue = [];            // 消失队列：下标顺序 = 出现顺序，队首最先被淘汰
        this.markedWords = new Set();
        this.currentModalIndex = null;

        this.MAX_ONSCREEN = 20;     // 同屏卡片硬上限，标记卡片同样占位

        // 当前单元编号（由页面通过 window.UNIT_ID 传入）；缺失时只跳过进度记录
        this.unitId = (options && options.unitId != null) ? options.unitId
            : (typeof window !== 'undefined' && window.UNIT_ID != null ? window.UNIT_ID : null);
        this.progress = (typeof window !== 'undefined') ? window.CET6Progress : undefined;
        this.doneNotified = false;
        this.toastTimer = null;

        this.wordContainer = document.getElementById('wordContainer');
        this.homeBtn = document.getElementById('homeBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.translationModal = document.getElementById('translationModal');
        this.englishWord = document.getElementById('englishWord');
        this.chineseTranslation = document.getElementById('chineseTranslation');
        this.wordPhonetic = document.getElementById('wordPhonetic');
        this.collocationSection = document.getElementById('collocationSection');
        this.collocationList = document.getElementById('collocationList');
        this.memorySection = document.getElementById('memorySection');
        this.memoryText = document.getElementById('memoryText');
        this.closeModal = document.getElementById('closeModal');
        this.markBtn = document.getElementById('markBtn');
        this.currentIndex = document.getElementById('currentIndex');
        this.totalWords = document.getElementById('totalWords');

        this.resizeTimer = null;
        this.init();
    }

    init() {
        this.totalWords.textContent = this.words.length;
        this.showWord(this.currentWordIndex);
        this.setupEventListeners();
    }

    /* ---------- 进度记录 ---------- */

    // 记录"这个词被翻到过"。判定口径见 progress.js：
    // 一个单元的所有词都翻到过，该单元即为已背过。
    markSeen(index) {
        if (!this.progress || this.unitId === null) return;
        this.progress.markSeen(this.unitId, index, this.words.length);

        if (!this.doneNotified && this.progress.isDone(this.unitId, this.words.length)) {
            this.doneNotified = true;
            this.showToast('这个 Word List 已背完，首页按钮会变成灰色，仍可点进来重背');
        }
    }

    showToast(text) {
        if (!document.body) return;
        let el = document.getElementById('learnerToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'learnerToast';
            el.className = 'toast';
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.classList.add('toast-visible');
        window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => el.classList.remove('toast-visible'), 3200);
    }

    /* ---------- 卡片放置 ---------- */

    // 让 index 这张卡出现在屏幕上。返回 false 表示"没放进去"（屏幕 20 张全是标记卡）。
    // 放新卡前先腾位置，腾不出来就直接拒绝，绝不出现第 21 张。
    ensureOnScreen(index) {
        if (this.placedWords.some(item => item.index === index)) return true;
        if (!this.makeRoomForNewCard(index)) return false;

        const card = this.createCard(index);
        this.placeCard(card, index);
        this.enqueue(index);
        return true;
    }

    // 显示一个单词（新词或重新显示）：追加卡片 → 只测量一次尺寸 → 找一个不重叠的位置
    showWord(index) {
        if (!this.ensureOnScreen(index)) {
            // 满屏且全被标记：计数停在当前词，等用户处理完这一屏再来
            return false;
        }
        this.currentWordIndex = index;

        this.applyStates();
        this.currentIndex.textContent = index + 1;
        this.markSeen(index);
        return true;
    }

    /* ---------- 消失队列 ---------- */

    enqueue(index) {
        if (this.queue.indexOf(index) === -1) this.queue.push(index);
    }

    // 取消标记时调用：排到队尾，也就是"最后一个才会被淘汰"
    moveToQueueTail(index) {
        const pos = this.queue.indexOf(index);
        if (pos !== -1) this.queue.splice(pos, 1);
        this.queue.push(index);
    }

    // 从队首往后找第一张"未标记"的卡片并删除，找不到返回 false。
    // 标记卡一律跳过 —— 这正是"1 号被标记就删 2 号"的实现。
    evictFirstUnmarked(keepIndex) {
        for (let i = 0; i < this.queue.length; i++) {
            const idx = this.queue[i];
            if (idx === keepIndex) continue;
            if (!this.markedWords.has(idx)) {
                this.removeCard(idx);
                return true;
            }
        }
        return false;
    }

    // 兜底：连标记卡也删（只有窗口小到放不下 20 张时才会走到）
    evictOldestAny(keepIndex) {
        for (let i = 0; i < this.queue.length; i++) {
            const idx = this.queue[i];
            if (idx === keepIndex) continue;
            this.removeCard(idx);
            return true;
        }
        return false;
    }

    // 为新卡片腾位置：不足 20 张直接放行；满 20 张就淘汰队首那张未标记的。
    // 20 张全被标记 → 弹框、返回 false。
    makeRoomForNewCard(newIndex) {
        while (this.placedWords.length >= this.MAX_ONSCREEN) {
            if (!this.evictFirstUnmarked(newIndex)) {
                this.showLimitDialog();
                return false;
            }
        }
        return true;
    }

    // "屏幕已满"提示框。只提示、不锁死操作：关掉后仍可点卡片取消标记。
    showLimitDialog() {
        const text = '目前屏幕上单词数量为20，请先背完当前20个单词后，再背新单词吧。';
        let dlg = document.getElementById('limitModal');

        if (!dlg) {
            dlg = document.createElement('div');
            dlg.id = 'limitModal';
            dlg.className = 'modal';

            const box = document.createElement('div');
            box.className = 'modal-content limit-content';

            const body = document.createElement('p');
            body.className = 'limit-text';
            body.textContent = text;
            box.appendChild(body);

            const actions = document.createElement('div');
            actions.className = 'modal-actions';

            const ok = document.createElement('button');
            ok.id = 'limitOkBtn';
            ok.type = 'button';
            ok.textContent = '知道了';
            ok.addEventListener('click', () => this.closeLimitDialog());
            actions.appendChild(ok);

            box.appendChild(actions);
            dlg.appendChild(box);

            // 点击遮罩也能关掉，和释义弹层保持一致
            dlg.addEventListener('click', (e) => {
                if (e.target === dlg) this.closeLimitDialog();
            });

            document.body.appendChild(dlg);
        }

        dlg.style.display = 'flex';
    }

    closeLimitDialog() {
        const dlg = document.getElementById('limitModal');
        if (dlg) dlg.style.display = 'none';
    }

    limitDialogOpen() {
        const dlg = document.getElementById('limitModal');
        return !!dlg && dlg.style.display === 'flex';
    }

    createCard(index) {
        const word = this.words[index] || {};
        const el = document.createElement('div');
        el.className = 'word-card';
        el.dataset.index = String(index);

        const en = document.createElement('span');
        en.className = 'card-word';
        en.textContent = word.english || '';
        el.appendChild(en);

        // 卡片上带音标：字号更小、颜色更浅，不抢单词本身的视觉重心
        if (word.phonetic) {
            const ph = document.createElement('span');
            ph.className = 'card-phonetic';
            ph.textContent = word.phonetic;
            el.appendChild(ph);
        }

        el.style.visibility = 'hidden';
        this.wordContainer.appendChild(el);
        return el;
    }

    // 直接把卡片放到容器内，尺寸只读取一次（旧版在 200 次循环里反复克隆+挂载，属性能浪费）
    placeCard(el, index) {
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        let pos = this.findFreePosition(width, height);

        // 没有空位（窗口太小、20 张排不开）：先淘汰队首的未标记卡片腾地方；
        // 实在全是标记卡，才牺牲最早的那张，并提示一句。
        // 总之宁可少一张旧卡，也不让两张卡叠在一起。
        while (!pos) {
            if (this.evictFirstUnmarked(index)) {
                pos = this.findFreePosition(width, height);
                continue;
            }
            if (this.evictOldestAny(index)) {
                pos = this.findFreePosition(width, height);
                this.showToast('窗口偏小，最早标记的卡片已让位给新词（标记仍会保留）');
                continue;
            }
            break;
        }

        if (!pos) {
            // 视口小到放不下一张卡片：贴着左上角放，宁可挤在最前面也不能凭空消失
            pos = { x: 10, y: 10, width: width, height: height };
        }

        el.style.left = pos.x + 'px';
        el.style.top = pos.y + 'px';
        el.style.visibility = '';

        this.placedWords.push({
            element: el,
            index: index,
            x: pos.x,
            y: pos.y,
            width: width,
            height: height
        });
    }

    // 屏幕上被固定控件占住的区域：右上角计数、底部两个按钮。
    // 卡片不去这些地方，避免被压在按钮下面看不见。
    reservedRects() {
        const boxW = this.wordContainer.clientWidth || window.innerWidth;
        const boxH = this.wordContainer.clientHeight || window.innerHeight;
        return [
            { x: 0, y: 0, width: 130, height: 60 },            // 日间/夜间切换按钮
            { x: boxW - 150, y: 0, width: 150, height: 60 },   // 计数
            { x: 0, y: boxH - 88, width: 190, height: 88 },     // 返回首页
            { x: boxW - 190, y: boxH - 88, width: 190, height: 88 } // 下一个
        ];
    }

    // 找一个不与任何已放卡片、也不与固定控件重叠的位置。
    // 1) 先随机试 80 次，命中即用 —— 保留"单词随机散落"的观感；
    // 2) 随机失败（版面已经很满）时改按 6px 网格逐点扫描，只要还有一个空洞就一定能找到；
    // 3) 全都放不下则返回 null，交给 placeCard 淘汰旧卡片。
    // 关键点：绝不像旧版那样"试满次数就把重叠位置返回"，那样必然出现卡片叠在一起。
    findFreePosition(width, height) {
        const pad = 10;
        const boxW = this.wordContainer.clientWidth || window.innerWidth;
        const boxH = this.wordContainer.clientHeight || window.innerHeight;

        // 容器小于卡片时退化为左上角，避免出现负的可用宽度
        const maxX = Math.max(pad, boxW - width - pad);
        const maxY = Math.max(pad, boxH - height - pad);
        const spanX = Math.max(1, maxX - pad);
        const spanY = Math.max(1, maxY - pad);
        const reserved = this.reservedRects();

        const fits = (x, y) => {
            const trial = { x: x, y: y, width: width, height: height };
            if (this.placedWords.some(item => this.checkOverlap(trial, item))) return false;
            if (reserved.some(rect => this.checkOverlap(trial, rect, 0))) return false;
            return true;
        };

        for (let attempt = 0; attempt < 80; attempt++) {
            const x = pad + Math.floor(Math.random() * spanX);
            const y = pad + Math.floor(Math.random() * spanY);
            if (fits(x, y)) return { x: x, y: y, width: width, height: height };
        }

        const step = 6;
        for (let y = pad; y <= maxY; y += step) {
            for (let x = pad; x <= maxX; x += step) {
                if (fits(x, y)) return { x: x, y: y, width: width, height: height };
            }
        }
        return null;
    }

    checkOverlap(rect1, rect2, buffer) {
        const gap = buffer === undefined ? 12 : buffer;
        return !(
            rect1.x + rect1.width + gap < rect2.x ||
            rect1.y + rect1.height + gap < rect2.y ||
            rect2.x + rect2.width + gap < rect1.x ||
            rect2.y + rect2.height + gap < rect1.y
        );
    }

    // 删除一张卡片：DOM、位置表、消失队列三处同时移除，避免队列里留下"幽灵下标"
    removeCard(index) {
        const pos = this.placedWords.findIndex(item => item.index === index);
        if (pos !== -1) {
            const item = this.placedWords[pos];
            if (item.element && item.element.parentNode) {
                item.element.parentNode.removeChild(item.element);
            }
            this.placedWords.splice(pos, 1);
        }

        const q = this.queue.indexOf(index);
        if (q !== -1) this.queue.splice(q, 1);
    }

    /* ---------- 状态与样式 ---------- */

    // 统一用 class 表达状态，避免 inline style 与 :hover 互相覆盖
    applyStates() {
        this.placedWords.forEach(item => {
            item.element.classList.toggle('marked', this.markedWords.has(item.index));
            item.element.classList.toggle('current', item.index === this.currentWordIndex);
        });
    }

    toggleMarkWord(index) {
        const wasMarked = this.markedWords.has(index);

        if (wasMarked) {
            this.markedWords.delete(index);
            // 取消标记 = 已经背会、可以让位：排到消失队列队尾，
            // 要等前面 19 张都淘汰完才轮到它（屏幕仍有其它未标记卡时即"再出现 20 个新词才消失"）。
            this.moveToQueueTail(index);
        } else {
            this.markedWords.add(index);
        }

        // 若该词已不在页面上（例如窗口很小被挤掉），重新显示它；不改变"单词 x/75"的计数
        if (!this.placedWords.some(item => item.index === index)) {
            this.ensureOnScreen(index);
        }
        this.applyStates();
        this.updateMarkButtonText();
    }

    updateMarkButtonText() {
        if (this.currentModalIndex === null) return;
        const isMarked = this.markedWords.has(this.currentModalIndex);
        this.markBtn.textContent = isMarked ? '取消标记' : '标记';
        // 已标记时按钮回落成白底（样式见 style.css #markBtn.is-marked）
        this.markBtn.classList.toggle('is-marked', isMarked);
    }

    /* ---------- 翻页 ---------- */

    showNextWord() {
        if (this.currentWordIndex >= this.words.length - 1) {
            return; // 已是最后一个
        }
        this.showWord(this.currentWordIndex + 1);
    }

    goToHomePage() {
        window.location.href = '../index.html';
    }

    // 释义：有 senses 就按词性分行渲染（n. / v. / adj. 各一行），否则退回整段文本
    renderSenses(word) {
        const box = this.chineseTranslation;
        if (!box) return;
        box.innerHTML = '';

        const senses = Array.isArray(word.senses) ? word.senses.filter(s => s && s.def) : [];
        if (senses.length === 0) {
            box.textContent = word.chinese || '';
            return;
        }

        senses.forEach(sense => {
            const row = document.createElement('div');
            row.className = 'sense-row';

            if (sense.pos) {
                const pos = document.createElement('span');
                pos.className = 'sense-pos';
                pos.textContent = sense.pos;
                row.appendChild(pos);
            }

            const def = document.createElement('span');
            def.className = 'sense-def';
            def.textContent = sense.def;
            row.appendChild(def);

            box.appendChild(row);
        });
    }

    showTranslation(index) {
        const word = this.words[index] || {};

        this.englishWord.textContent = word.english || '';

        if (this.wordPhonetic) {
            this.wordPhonetic.textContent = word.phonetic || '';
            this.wordPhonetic.style.display = word.phonetic ? 'block' : 'none';
        }

        this.renderSenses(word);

        const collocations = Array.isArray(word.collocations) ? word.collocations : [];
        if (this.collocationList) {
            this.collocationList.innerHTML = '';
            collocations.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                this.collocationList.appendChild(li);
            });
        }
        if (this.collocationSection) {
            this.collocationSection.style.display = collocations.length ? 'block' : 'none';
        }

        if (this.memoryText) this.memoryText.textContent = word.memory || '';
        if (this.memorySection) {
            this.memorySection.style.display = word.memory ? 'block' : 'none';
        }

        this.translationModal.style.display = 'flex';
        this.currentModalIndex = index;
        this.updateMarkButtonText();
    }

    closeTranslation() {
        this.translationModal.style.display = 'none';
        this.currentModalIndex = null;
    }

    /* ---------- 事件 ---------- */

    setupEventListeners() {
        this.wordContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.word-card');
            if (card) {
                this.showTranslation(parseInt(card.dataset.index, 10));
            }
        });

        this.nextBtn.addEventListener('click', () => this.showNextWord());
        this.homeBtn.addEventListener('click', () => this.goToHomePage());

        this.closeModal.addEventListener('click', () => this.closeTranslation());

        this.markBtn.addEventListener('click', () => {
            if (this.currentModalIndex === null) return;
            this.toggleMarkWord(this.currentModalIndex);
            this.closeTranslation();
        });

        this.translationModal.addEventListener('click', (e) => {
            if (e.target === this.translationModal) {
                this.closeTranslation();
            }
        });

        // 键盘：→ / 空格 / Enter 都等于「下一个」，← 返回首页
        document.addEventListener('keydown', (e) => {
            // "屏幕已满"提示框开着时，任意翻页键都只关提示，不再叠加新提示
            if (this.limitDialogOpen()) {
                const dismissKey = e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' ||
                    e.key === 'Escape' || e.key === 'ArrowRight';
                if (dismissKey) {
                    if (typeof e.preventDefault === 'function') e.preventDefault();
                    this.closeLimitDialog();
                }
                return;
            }

            const modalOpen = this.translationModal.style.display === 'flex';
            const target = e.target || {};
            const tag = String(target.tagName || '').toLowerCase();
            // 光标在输入框里时不抢键；页面目前没有输入框，留这一层是为了以后加搜索不出错
            const typing = tag === 'input' || tag === 'textarea' || tag === 'select' ||
                target.isContentEditable === true;
            const isNextKey = e.key === 'ArrowRight' || e.key === ' ' ||
                e.key === 'Spacebar' || e.key === 'Enter';

            if (isNextKey && !typing) {
                // 空格默认滚页面、Enter 默认激活聚焦的按钮，都会和翻页打架，先拦掉默认行为
                if (typeof e.preventDefault === 'function') {
                    e.preventDefault();
                }
                this.showNextWord();
            } else if (e.key === 'ArrowLeft') {
                this.goToHomePage();
            } else if (e.key === 'Escape' && modalOpen) {
                this.closeTranslation();
            } else if ((e.key === 'm' || e.key === 'M') && modalOpen && this.currentModalIndex !== null) {
                this.toggleMarkWord(this.currentModalIndex);
                this.closeTranslation();
            }
        });

        // 窗口尺寸变化：按现有卡片重新布局，不经过上限截断（旧版重建时会顺手删掉卡片）
        window.addEventListener('resize', () => {
            window.clearTimeout(this.resizeTimer);
            this.resizeTimer = window.setTimeout(() => this.relayout(), 150);
        });
    }

    relayout() {
        const indexes = this.placedWords.map(item => item.index);
        this.placedWords.forEach(item => {
            if (item.element && item.element.parentNode) {
                item.element.parentNode.removeChild(item.element);
            }
        });
        this.placedWords = [];

        indexes.forEach(index => {
            const card = this.createCard(index);
            this.placeCard(card, index);
        });

        this.applyStates();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WordLearner(words, { unitId: window.UNIT_ID != null ? window.UNIT_ID : null });
});
