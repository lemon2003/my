// wordLearner.js - 单词学习系统逻辑（修改版，支持智能单词显示管理）
class WordLearner {
    constructor(words) {
        this.words = words;
        this.currentWordIndex = 0;
        this.history = [0];
        this.historyIndex = 0;
        this.placedWords = [];
        this.displayQueue = []; // 用于跟踪当前显示的单词索引（按显示顺序）
        this.markedWords = new Set(); // 存储被标记的单词索引
        this.removalQueue = []; // 存储非标记单词的移除顺序
        
        // 页面元素
        this.wordContainer = document.getElementById('wordContainer');
        this.homeBtn = document.getElementById('homeBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.translationModal = document.getElementById('translationModal');
        this.englishWord = document.getElementById('englishWord');
        this.chineseTranslation = document.getElementById('chineseTranslation');
        this.closeModal = document.getElementById('closeModal');
        this.markBtn = document.getElementById('markBtn');
        this.currentIndex = document.getElementById('currentIndex');
        this.totalWords = document.getElementById('totalWords');
        
        // 当前显示的单词索引（用于标记功能）
        this.currentModalIndex = null;
        
        // 初始化
        this.init();
    }
    
    // 初始化页面
    init() {
        // 设置总单词数
        this.totalWords.textContent = this.words.length;
        
        // 显示第一个单词
        this.showWord(this.currentWordIndex);
        
        // 设置事件监听器
        this.setupEventListeners();
    }
    
    // 显示单词（智能管理显示数量）
    showWord(index) {
        // 创建单词元素
        const wordEl = document.createElement('div');
        wordEl.className = 'word-card';
        wordEl.textContent = this.words[index].english;
        wordEl.dataset.index = index;
        
        // 如果是被标记的单词，设置粉色背景
        if (this.markedWords.has(index)) {
            wordEl.style.backgroundColor = '#f48fb1';
            wordEl.style.border = '1px solid #f48fb1';
        }
        
        // 设置随机位置（确保在视窗内且不重叠）
        const position = this.getRandomPosition(wordEl);
        
        wordEl.style.left = `${position.x}px`;
        wordEl.style.top = `${position.y}px`;
        
        // 添加到容器
        this.wordContainer.appendChild(wordEl);
        
        // 保存已放置单词的位置信息
        this.placedWords.push({
            element: wordEl,
            x: position.x,
            y: position.y,
            width: position.width,
            height: position.height,
            index: index
        });
        
        // 将当前单词索引添加到显示队列
        this.displayQueue.push(index);
        
        // 如果单词没有被标记，添加到移除队列
        if (!this.markedWords.has(index)) {
            this.removalQueue.push(index);
        }
        
        // 检查是否需要移除单词
        this.manageWordDisplay();
        
        // 更新所有单词卡片的背景色（高亮当前单词）
        this.updateWordBackgrounds();
        
        // 更新计数器
        this.currentIndex.textContent = index + 1;
    }
    
    // 管理单词显示数量
    manageWordDisplay() {
        // 计算当前非标记单词的数量
        const nonMarkedCount = this.displayQueue.filter(index => !this.markedWords.has(index)).length;
        const markedCount = this.markedWords.size;
        const totalDisplayed = nonMarkedCount + markedCount;
        
        // 如果总显示单词数超过20个，需要移除单词
        if (totalDisplayed > 20) {
            this.removeOldestNonMarkedWord();
        }
    }
    
    // 移除最早的非标记单词
    removeOldestNonMarkedWord() {
        // 从移除队列中找到最早的可移除单词（非标记的）
        let indexToRemove = -1;
        let removalIndex = -1;
        
        for (let i = 0; i < this.removalQueue.length; i++) {
            const candidateIndex = this.removalQueue[i];
            
            // 检查这个单词是否还在页面上且没有被标记
            const wordExists = this.placedWords.some(item => item.index === candidateIndex);
            if (wordExists && !this.markedWords.has(candidateIndex)) {
                indexToRemove = candidateIndex;
                removalIndex = i;
                break;
            }
        }
        
        if (indexToRemove !== -1 && removalIndex !== -1) {
            // 从移除队列中移除
            this.removalQueue.splice(removalIndex, 1);
            
            // 从页面上移除对应的单词元素
            const wordIndex = this.placedWords.findIndex(item => item.index === indexToRemove);
            if (wordIndex !== -1) {
                this.placedWords[wordIndex].element.remove();
                this.placedWords.splice(wordIndex, 1);
            }
            
            // 从显示队列中移除（但保留标记单词）
            const displayIndex = this.displayQueue.indexOf(indexToRemove);
            if (displayIndex !== -1) {
                this.displayQueue.splice(displayIndex, 1);
            }
        }
    }
    
    // 新增方法：更新所有单词卡片的背景色
    updateWordBackgrounds() {
        // 先将所有非标记单词背景色重置为白色
        this.placedWords.forEach(item => {
            if (!this.markedWords.has(item.index)) {
                item.element.style.backgroundColor = 'white';
                item.element.style.border = '1px solid #e0e0e0';
            }
        });
        
        // 将当前单词（最后一个显示的单词）背景色设置为浅橙色
        if (this.placedWords.length > 0) {
            const currentWord = this.placedWords[this.placedWords.length - 1];
            if (!this.markedWords.has(currentWord.index)) {
                currentWord.element.style.backgroundColor = '#ffb74d';
                currentWord.element.style.border = '1px solid #ffb74d';
            }
        }
    }
    
    // 标记/取消标记单词
    toggleMarkWord(index) {
        if (this.markedWords.has(index)) {
            // 取消标记
            this.markedWords.delete(index);
            
            // 如果单词还在页面上，更新样式
            const wordElement = this.placedWords.find(item => item.index === index);
            if (wordElement) {
                wordElement.element.style.backgroundColor = 'white';
                wordElement.element.style.border = '1px solid #e0e0e0';
                
                // 如果这个单词是当前显示的单词，设置为高亮
                if (this.placedWords.length > 0 && index === this.placedWords[this.placedWords.length - 1].index) {
                    wordElement.element.style.backgroundColor = '#ffb74d';
                    wordElement.element.style.border = '1px solid #ffb74d';
                }
                
                // 将这个单词添加到移除队列的末尾（最后被移除）
                if (!this.removalQueue.includes(index)) {
                    this.removalQueue.push(index);
                }
            } else {
                // 如果单词不在页面上，重新显示它
                this.showWord(index);
            }
        } else {
            // 标记单词
            this.markedWords.add(index);
            
            // 如果单词还在页面上，更新样式
            const wordElement = this.placedWords.find(item => item.index === index);
            if (wordElement) {
                wordElement.element.style.backgroundColor = '#f48fb1';
                wordElement.element.style.border = '1px solid #f48fb1';
            }
            
            // 从移除队列中移除，使其不会被自动清理
            const removalIndex = this.removalQueue.indexOf(index);
            if (removalIndex !== -1) {
                this.removalQueue.splice(removalIndex, 1);
            }
        }
        
        // 检查是否需要调整显示数量
        this.manageWordDisplay();
        
        // 更新标记按钮文本
        this.updateMarkButtonText();
    }
    
    // 更新标记按钮文本
    updateMarkButtonText() {
        if (this.currentModalIndex !== null) {
            if (this.markedWords.has(this.currentModalIndex)) {
                this.markBtn.textContent = '取消标记';
            } else {
                this.markBtn.textContent = '标记';
            }
        }
    }
    
    // 获取随机位置（确保不重叠）
    getRandomPosition(element) {
        const maxAttempts = 200;
        let attempt = 0;
        let position;
        let overlap;
        
        do {
            overlap = false;
            
            // 创建临时元素测量尺寸
            const tempEl = element.cloneNode(true);
            tempEl.style.visibility = 'hidden';
            tempEl.style.position = 'absolute';
            tempEl.style.left = '0';
            tempEl.style.top = '0';
            document.body.appendChild(tempEl);
            
            const width = tempEl.offsetWidth;
            const height = tempEl.offsetHeight;
            document.body.removeChild(tempEl);
            
            // 计算最大可放置位置
            const maxX = window.innerWidth - width - 40;
            const maxY = window.innerHeight - height - 80;
            
            // 生成随机位置
            const x = Math.max(20, Math.floor(Math.random() * maxX));
            const y = Math.max(60, Math.floor(Math.random() * maxY));
            
            position = { x, y, width, height };
            
            // 检查是否与已有单词重叠
            for (const placed of this.placedWords) {
                if (this.checkOverlap(position, placed)) {
                    overlap = true;
                    break;
                }
            }
            
            attempt++;
        } while (overlap && attempt < maxAttempts);
        
        return position;
    }
    
    // 检查两个矩形是否重叠
    checkOverlap(rect1, rect2) {
        const buffer = 15;
        
        return !(
            rect1.x + rect1.width + buffer < rect2.x || 
            rect1.y + rect1.height + buffer < rect2.y || 
            rect2.x + rect2.width + buffer < rect1.x || 
            rect2.y + rect2.height + buffer < rect1.y
        );
    }
    
    // 显示下一个单词
    showNextWord() {
        if (this.currentWordIndex < this.words.length - 1) {
            this.currentWordIndex++;
        } else {
            return; // 已经是最后一个单词
        }
        
        this.history.push(this.currentWordIndex);
        this.historyIndex = this.history.length - 1;
        this.showWord(this.currentWordIndex);
    }
    
    // 返回首页功能
    goToHomePage() {
        window.location.href = '../index.html';
    }
    
    // 显示翻译弹窗
    showTranslation(index) {
        this.englishWord.textContent = this.words[index].english;
        this.chineseTranslation.textContent = this.words[index].chinese;
        this.translationModal.style.display = 'flex';
        this.currentModalIndex = index;
        
        // 更新标记按钮文本
        this.updateMarkButtonText();
    }
    
    // 设置事件监听器
    setupEventListeners() {
        // 单词点击事件
        this.wordContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('word-card')) {
                const index = parseInt(e.target.dataset.index);
                this.showTranslation(index);
            }
        });
        
        // 导航按钮
        this.nextBtn.addEventListener('click', () => {
            this.showNextWord();
        });
        
        // 返回首页按钮
        this.homeBtn.addEventListener('click', () => {
            this.goToHomePage();
        });
        
        // 关闭弹窗
        this.closeModal.addEventListener('click', () => {
            this.translationModal.style.display = 'none';
            this.currentModalIndex = null;
        });
        
        // 标记按钮
        this.markBtn.addEventListener('click', () => {
            if (this.currentModalIndex !== null) {
                this.toggleMarkWord(this.currentModalIndex);
                this.translationModal.style.display = 'none';
                this.currentModalIndex = null;
            }
        });
        
        // 点击模态框外部关闭
        this.translationModal.addEventListener('click', (e) => {
            if (e.target === this.translationModal) {
                this.translationModal.style.display = 'none';
                this.currentModalIndex = null;
            }
        });
        
        // 键盘导航
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') {
                this.showNextWord();
            } else if (e.key === 'ArrowLeft') {
                this.goToHomePage();
            } else if (e.key === 'Escape' && this.translationModal.style.display === 'flex') {
                this.translationModal.style.display = 'none';
                this.currentModalIndex = null;
            } else if (e.key === 'm' && this.translationModal.style.display === 'flex') {
                if (this.currentModalIndex !== null) {
                    this.toggleMarkWord(this.currentModalIndex);
                    this.translationModal.style.display = 'none';
                    this.currentModalIndex = null;
                }
            }
        });
        
        // 窗口大小变化时重新布局
        window.addEventListener('resize', () => {
            // 保存当前状态
            const currentDisplayQueue = [...this.displayQueue];
            const currentMarkedWords = [...this.markedWords];
            const currentRemovalQueue = [...this.removalQueue];
            
            // 清空所有状态
            this.wordContainer.innerHTML = '';
            this.placedWords = [];
            this.displayQueue = [];
            this.removalQueue = [];
            
            // 重新显示所有标记的单词
            currentMarkedWords.forEach(index => {
                this.showWord(index);
            });
            
            // 重新显示其他单词
            currentDisplayQueue.forEach(index => {
                if (!currentMarkedWords.includes(index)) {
                    this.showWord(index);
                }
            });
            
            // 恢复移除队列
            this.removalQueue = currentRemovalQueue.filter(index => 
                !currentMarkedWords.includes(index)
            );
        });
    }
}

// 页面加载完成后初始化单词学习系统
document.addEventListener('DOMContentLoaded', () => {
    new WordLearner(words);
});