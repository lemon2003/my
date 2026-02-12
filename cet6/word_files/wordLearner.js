// wordLearner.js - 单词学习系统逻辑（修改版，支持最多显示20个单词，并添加背景色高亮）
class WordLearner {
    constructor(words) {
        this.words = words;
        this.currentWordIndex = 0;
        this.history = [0];
        this.historyIndex = 0;
        this.placedWords = [];
        this.displayQueue = []; // 用于跟踪当前显示的单词索引
        
        // 页面元素
        this.wordContainer = document.getElementById('wordContainer');
        this.homeBtn = document.getElementById('homeBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.translationModal = document.getElementById('translationModal');
        this.englishWord = document.getElementById('englishWord');
        this.chineseTranslation = document.getElementById('chineseTranslation');
        this.closeModal = document.getElementById('closeModal');
        this.currentIndex = document.getElementById('currentIndex');
        this.totalWords = document.getElementById('totalWords');
        
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
    
    // 显示单词（修改为最多显示20个，并添加背景色高亮）
    showWord(index) {
        // 创建单词元素
        const wordEl = document.createElement('div');
        wordEl.className = 'word-card';
        wordEl.textContent = this.words[index].english;
        wordEl.dataset.index = index;
        
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
            index: index // 添加索引以便后续查找
        });
        
        // 将当前单词索引添加到显示队列
        this.displayQueue.push(index);
        
        // 如果显示队列超过20个，移除最早显示的单词
        if (this.displayQueue.length > 20) {
            const oldestIndex = this.displayQueue.shift(); // 获取并移除队列中最老的索引
            
            // 在placedWords中查找对应的元素并移除
            const oldestWordIndex = this.placedWords.findIndex(item => item.index === oldestIndex);
            if (oldestWordIndex !== -1) {
                // 从DOM中移除元素
                this.placedWords[oldestWordIndex].element.remove();
                // 从placedWords数组中移除
                this.placedWords.splice(oldestWordIndex, 1);
            }
        }
        
        // 更新所有单词卡片的背景色
        this.updateWordBackgrounds();
        
        // 更新计数器
        this.currentIndex.textContent = index + 1;
    }
    
    // 新增方法：更新所有单词卡片的背景色
    updateWordBackgrounds() {
        // 先将所有单词背景色重置为白色
        this.placedWords.forEach(item => {
            item.element.style.backgroundColor = 'white';
            item.element.style.border = '1px solid #e0e0e0'; // 保持原有边框
        });
        
        // 将当前单词（最后一个显示的单词）背景色设置为浅橙色
        if (this.placedWords.length > 0) {
            const currentWord = this.placedWords[this.placedWords.length - 1];
            currentWord.element.style.backgroundColor = '#ffb74d'; // 浅橙色
            currentWord.element.style.border = '1px solid #ffb74d'; // 橙色边框，更明显
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
    
    // 返回首页功能 - 修改为返回上一级文件夹的index.html
    goToHomePage() {
        // 返回上一级文件夹的index.html
        window.location.href = '../index.html';
    }
    
    // 显示翻译弹窗
    showTranslation(index) {
        this.englishWord.textContent = this.words[index].english;
        this.chineseTranslation.textContent = this.words[index].chinese;
        this.translationModal.style.display = 'flex';
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
        });
        
        // 点击模态框外部关闭
        this.translationModal.addEventListener('click', (e) => {
            if (e.target === this.translationModal) {
                this.translationModal.style.display = 'none';
            }
        });
        
        // 键盘导航
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') {
                this.showNextWord();
            } else if (e.key === 'ArrowLeft') {
                // 左箭头键也返回首页
                this.goToHomePage();
            } else if (e.key === 'Escape' && this.translationModal.style.display === 'flex') {
                this.translationModal.style.display = 'none';
            }
        });
        
        // 窗口大小变化时重新布局
        window.addEventListener('resize', () => {
            // 保存当前显示队列
            const currentQueue = [...this.displayQueue];
            
            // 清空所有状态
            this.wordContainer.innerHTML = '';
            this.placedWords = [];
            this.displayQueue = [];
            
            // 重新显示当前队列中的所有单词
            currentQueue.forEach(index => {
                this.showWord(index);
            });
        });
    }
}

// 页面加载完成后初始化单词学习系统
document.addEventListener('DOMContentLoaded', () => {
    // 使用全局的 words 变量
    new WordLearner(words);
});