// wordLearner.js - 单词学习系统逻辑（修改版，支持分组学习和完成检测）
class WordLearner {
    constructor(words) {
        // 从localStorage获取当前组信息
        const groupInfo = JSON.parse(localStorage.getItem('currentGroupInfo'));

        if (groupInfo) {
            // 根据组信息过滤单词
            const groupWords = words.slice(groupInfo.startIndex, groupInfo.endIndex + 1);
            this.words = groupWords;
            this.groupInfo = groupInfo;
        } else {
            // 如果没有组信息，使用所有单词（兼容旧版本）
            this.words = words;
            this.groupInfo = null;
        }

        this.currentWordIndex = 0;
        this.history = [0];
        this.historyIndex = 0;
        this.placedWords = [];
        this.displayQueue = [];
        this.markedWords = new Set();
        this.removalQueue = [];
        this.isCompleted = false; // 新增：标记是否完成当前组

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

        this.currentModalIndex = null;

        this.init();
    }

    init() {
        this.totalWords.textContent = this.words.length;
        this.showWord(this.currentWordIndex);
        this.setupEventListeners();
    }

    showWord(index) {
        if (this.isCompleted) return;

        const wordEl = document.createElement('div');
        wordEl.className = 'word-card';
        wordEl.textContent = this.words[index].english;
        wordEl.dataset.index = index;

        if (this.markedWords.has(index)) {
            wordEl.style.backgroundColor = '#f48fb1';
            wordEl.style.border = '1px solid #f48fb1';
        }

        const position = this.getRandomPosition(wordEl);
        wordEl.style.left = `${position.x}px`;
        wordEl.style.top = `${position.y}px`;

        this.wordContainer.appendChild(wordEl);

        this.placedWords.push({
            element: wordEl,
            x: position.x,
            y: position.y,
            width: position.width,
            height: position.height,
            index: index
        });

        this.displayQueue.push(index);

        if (!this.markedWords.has(index)) {
            this.removalQueue.push(index);
        }

        this.manageWordDisplay();
        this.updateWordBackgrounds();
        this.currentIndex.textContent = index + 1;
    }

    // 新增：检查是否完成当前组
    checkCompletion() {
        if (this.currentWordIndex >= this.words.length - 1) {
            this.isCompleted = true;
            this.showCompletionModal();
            return true;
        }
        return false;
    }

    // 新增：显示完成弹窗
    showCompletionModal() {
        const completionModal = document.createElement('div');
        completionModal.className = 'modal';
        completionModal.style.display = 'flex';
        completionModal.innerHTML = `
            <div class="modal-content">
                <h2>🎉 今日任务已完成</h2>
                <p>你已经完成了第${this.groupInfo ? this.groupInfo.groupId : '当前'}组单词的学习！</p>
                <button id="backToHome" style="padding: 8px 20px; font-size: 1rem; background-color: #4a6fa5; color: white; border: none; border-radius: 6px; cursor: pointer; margin-top: 10px;">返回首页</button>
            </div>
        `;

        document.body.appendChild(completionModal);

        // 返回首页按钮事件
        completionModal.querySelector('#backToHome').addEventListener('click', () => {
            this.goToHomePage();
        });

        // 点击外部关闭
        completionModal.addEventListener('click', (e) => {
            if (e.target === completionModal) {
                completionModal.remove();
            }
        });

        // 更新学习进度
        if (this.groupInfo) {
            this.updateLearningProgress();
        }
    }

    // 新增：更新学习进度
    updateLearningProgress() {
        const progress = JSON.parse(localStorage.getItem('wordLearningProgress') || '{}');
        progress[this.groupInfo.groupId] = true;
        localStorage.setItem('wordLearningProgress', JSON.stringify(progress));
    }

    showNextWord() {
        if (this.isCompleted) return;

        // 检查是否已经是最后一个单词
        if (this.currentWordIndex >= this.words.length - 1) {
            this.checkCompletion();
            return;
        }

        this.currentWordIndex++;
        this.history.push(this.currentWordIndex);
        this.historyIndex = this.history.length - 1;
        this.showWord(this.currentWordIndex);

        // 检查是否完成（显示最后一个单词后）
        if (this.currentWordIndex >= this.words.length - 1) {
            setTimeout(() => this.checkCompletion(), 500);
        }
    }

    // 其他方法保持不变...
    manageWordDisplay() {
        const nonMarkedCount = this.displayQueue.filter(index => !this.markedWords.has(index)).length;
        const markedCount = this.markedWords.size;
        const totalDisplayed = nonMarkedCount + markedCount;

        if (totalDisplayed > 20) {
            this.removeOldestNonMarkedWord();
        }
    }

    removeOldestNonMarkedWord() {
        let indexToRemove = -1;
        let removalIndex = -1;

        for (let i = 0; i < this.removalQueue.length; i++) {
            const candidateIndex = this.removalQueue[i];
            const wordExists = this.placedWords.some(item => item.index === candidateIndex);
            if (wordExists && !this.markedWords.has(candidateIndex)) {
                indexToRemove = candidateIndex;
                removalIndex = i;
                break;
            }
        }

        if (indexToRemove !== -1 && removalIndex !== -1) {
            this.removalQueue.splice(removalIndex, 1);
            const wordIndex = this.placedWords.findIndex(item => item.index === indexToRemove);
            if (wordIndex !== -1) {
                this.placedWords[wordIndex].element.remove();
                this.placedWords.splice(wordIndex, 1);
            }

            const displayIndex = this.displayQueue.indexOf(indexToRemove);
            if (displayIndex !== -1) {
                this.displayQueue.splice(displayIndex, 1);
            }
        }
    }

    updateWordBackgrounds() {
        this.placedWords.forEach(item => {
            if (!this.markedWords.has(item.index)) {
                item.element.style.backgroundColor = 'white';
                item.element.style.border = '1px solid #e0e0e0';
            }
        });

        if (this.placedWords.length > 0) {
            const currentWord = this.placedWords[this.placedWords.length - 1];
            if (!this.markedWords.has(currentWord.index)) {
                currentWord.element.style.backgroundColor = '#ffb74d';
                currentWord.element.style.border = '1px solid #ffb74d';
            }
        }
    }

    toggleMarkWord(index) {
        if (this.markedWords.has(index)) {
            this.markedWords.delete(index);
            const wordElement = this.placedWords.find(item => item.index === index);
            if (wordElement) {
                wordElement.element.style.backgroundColor = 'white';
                wordElement.element.style.border = '1px solid #e0e0e0';

                if (this.placedWords.length > 0 && index === this.placedWords[this.placedWords.length - 1].index) {
                    wordElement.element.style.backgroundColor = '#ffb74d';
                    wordElement.element.style.border = '1px solid #ffb74d';
                }

                if (!this.removalQueue.includes(index)) {
                    this.removalQueue.push(index);
                }
            } else {
                this.showWord(index);
            }
        } else {
            this.markedWords.add(index);
            const wordElement = this.placedWords.find(item => item.index === index);
            if (wordElement) {
                wordElement.element.style.backgroundColor = '#f48fb1';
                wordElement.element.style.border = '1px solid #f48fb1';
            }

            const removalIndex = this.removalQueue.indexOf(index);
            if (removalIndex !== -1) {
                this.removalQueue.splice(removalIndex, 1);
            }
        }

        this.manageWordDisplay();
        this.updateMarkButtonText();
    }

    updateMarkButtonText() {
        if (this.currentModalIndex !== null) {
            if (this.markedWords.has(this.currentModalIndex)) {
                this.markBtn.textContent = '取消标记';
            } else {
                this.markBtn.textContent = '标记';
            }
        }
    }

    getRandomPosition(element) {
        const maxAttempts = 200;
        let attempt = 0;
        let position;
        let overlap;

        do {
            overlap = false;

            const tempEl = element.cloneNode(true);
            tempEl.style.visibility = 'hidden';
            tempEl.style.position = 'absolute';
            tempEl.style.left = '0';
            tempEl.style.top = '0';
            document.body.appendChild(tempEl);

            const width = tempEl.offsetWidth;
            const height = tempEl.offsetHeight;
            document.body.removeChild(tempEl);

            const maxX = window.innerWidth - width - 40;
            const maxY = window.innerHeight - height - 80;

            const x = Math.max(20, Math.floor(Math.random() * maxX));
            const y = Math.max(60, Math.floor(Math.random() * maxY));

            position = { x, y, width, height };

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

    checkOverlap(rect1, rect2) {
        const buffer = 15;
        return !(
            rect1.x + rect1.width + buffer < rect2.x ||
            rect1.y + rect1.height + buffer < rect2.y ||
            rect2.x + rect2.width + buffer < rect1.x ||
            rect2.y + rect2.height + buffer < rect1.y
        );
    }

    goToHomePage() {
        window.location.href = 'index.html';
    }

    showTranslation(index) {
        if (this.isCompleted) return;

        this.englishWord.textContent = this.words[index].english;
        this.chineseTranslation.textContent = this.words[index].chinese;
        this.translationModal.style.display = 'flex';
        this.currentModalIndex = index;
        this.updateMarkButtonText();
    }

    setupEventListeners() {
        this.wordContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('word-card')) {
                const index = parseInt(e.target.dataset.index);
                this.showTranslation(index);
            }
        });

        this.nextBtn.addEventListener('click', () => {
            this.showNextWord();
        });

        this.homeBtn.addEventListener('click', () => {
            this.goToHomePage();
        });

        this.closeModal.addEventListener('click', () => {
            this.translationModal.style.display = 'none';
            this.currentModalIndex = null;
        });

        this.markBtn.addEventListener('click', () => {
            if (this.currentModalIndex !== null) {
                this.toggleMarkWord(this.currentModalIndex);
                this.translationModal.style.display = 'none';
                this.currentModalIndex = null;
            }
        });

        this.translationModal.addEventListener('click', (e) => {
            if (e.target === this.translationModal) {
                this.translationModal.style.display = 'none';
                this.currentModalIndex = null;
            }
        });

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

        window.addEventListener('resize', () => {
            const currentDisplayQueue = [...this.displayQueue];
            const currentMarkedWords = [...this.markedWords];
            const currentRemovalQueue = [...this.removalQueue];

            this.wordContainer.innerHTML = '';
            this.placedWords = [];
            this.displayQueue = [];
            this.removalQueue = [];

            currentMarkedWords.forEach(index => {
                this.showWord(index);
            });

            currentDisplayQueue.forEach(index => {
                if (!currentMarkedWords.includes(index)) {
                    this.showWord(index);
                }
            });

            this.removalQueue = currentRemovalQueue.filter(index =>
                !currentMarkedWords.includes(index)
            );
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WordLearner(words);
});