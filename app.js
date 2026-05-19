'use strict';

class Question {
  constructor(raw, shuffleOptions = false) {
    this.id = raw.id;
    this.text = raw.text;
    this.correctIndex = raw.correctIndex;

    if (shuffleOptions) {
      const indexed = raw.options.map((opt, i) => ({ opt, i }));
      this._shuffle(indexed);
      this.options = indexed.map(x => x.opt);
      this.correctIndex = indexed.findIndex(x => x.i === raw.correctIndex);
    } else {
      this.options = [...raw.options];
    }
  }

  isCorrect(chosenIndex) {
    return chosenIndex === this.correctIndex;
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}

class QuizEngine {
  static STORAGE_KEY = 'quiz_progress';

  constructor(data, opts = {}) {
    this.title = data.title;
    this.timeLimitSec = data.timeLimitSec;
    this.passThreshold = data.passThreshold ?? 0.7;

    let rawQuestions = [...data.questions];

    if (opts.shuffleQuestions) {
      this._shuffle(rawQuestions);
    }

    this.questions = rawQuestions.map(
      q => new Question(q, opts.shuffleOptions)
    );

    this.total = this.questions.length;

    this.currentIndex = 0;
    this.answers = new Array(this.total).fill(null);
    this.timeRemaining = this.timeLimitSec;
    this.finished = false;

    this._questionStartTimes = [];
    this._timePerQuestion = new Array(this.total).fill(0);

    this._timerInterval = null;
    this._onTick = null;
    this._onTimeout = null;
  }

  save() {
    const snapshot = {
      currentIndex: this.currentIndex,
      answers: this.answers,
      timeRemaining: this.timeRemaining,
      timePerQuestion: this._timePerQuestion
    };

    localStorage.setItem(
      QuizEngine.STORAGE_KEY,
      JSON.stringify(snapshot)
    );
  }

  static hasSaved() {
    return !!localStorage.getItem(QuizEngine.STORAGE_KEY);
  }

  static clearSaved() {
    localStorage.removeItem(QuizEngine.STORAGE_KEY);
  }

  restore() {
    const raw = localStorage.getItem(QuizEngine.STORAGE_KEY);

    if (!raw) {
      return false;
    }

    try {
      const snap = JSON.parse(raw);

      this.currentIndex = snap.currentIndex ?? 0;
      this.answers =
        snap.answers ?? new Array(this.total).fill(null);

      this.timeRemaining =
        snap.timeRemaining ?? this.timeLimitSec;

      this._timePerQuestion =
        snap.timePerQuestion ??
        new Array(this.total).fill(0);

      return true;
    } catch {
      return false;
    }
  }

  startTimer(onTick, onTimeout) {
    this._onTick = onTick;
    this._onTimeout = onTimeout;

    this._recordQuestionStart();

    this._timerInterval = setInterval(
      () => this._tick(),
      1000
    );
  }

  _tick() {
    this.timeRemaining = Math.max(
      0,
      this.timeRemaining - 1
    );

    this.save();

    this._onTick?.(this.timeRemaining);

    if (this.timeRemaining === 0) {
      this.stopTimer();
      this._onTimeout?.();
    }
  }

  stopTimer() {
    clearInterval(this._timerInterval);
    this._timerInterval = null;
  }

  get current() {
    return this.questions[this.currentIndex];
  }

  get isFirst() {
    return this.currentIndex === 0;
  }

  get isLast() {
    return this.currentIndex === this.total - 1;
  }

  selectAnswer(optionIndex) {
    this.answers[this.currentIndex] = optionIndex;
    this.save();
  }

  goNext() {
    this._recordTimeSpent();

    if (!this.isLast) {
      this.currentIndex++;
      this._recordQuestionStart();
      this.save();
    }
  }

  goPrev() {
    this._recordTimeSpent();

    if (!this.isFirst) {
      this.currentIndex--;
      this._recordQuestionStart();
      this.save();
    }
  }

  finish() {
    this._recordTimeSpent();
    this.stopTimer();
    this.finished = true;

    QuizEngine.clearSaved();

    return this.getResults();
  }

  getResults() {
    let correct = 0;

    const details = this.questions.map((q, i) => {
      const chosen = this.answers[i];
      const isCorrect = q.isCorrect(chosen);

      if (isCorrect) {
        correct++;
      }

      return {
        question: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        chosenIndex: chosen,
        isCorrect,
        timeSpent: this._timePerQuestion[i]
      };
    });

    const pct = correct / this.total;
    const passed = pct >= this.passThreshold;

    return {
      correct,
      total: this.total,
      pct,
      passed,
      details,
      threshold: this.passThreshold
    };
  }

  _recordQuestionStart() {
    this._questionStartTimes[this.currentIndex] =
      Date.now();
  }

  _recordTimeSpent() {
    const start =
      this._questionStartTimes[this.currentIndex];

    if (start) {
      this._timePerQuestion[this.currentIndex] +=
        Math.round((Date.now() - start) / 1000);
    }
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}

class QuizUI {
  constructor() {
    this.engine = null;

    this.$loading =
      document.getElementById('screen-loading');

    this.$quiz =
      document.getElementById('screen-quiz');

    this.$result =
      document.getElementById('screen-result');

    this.$review =
      document.getElementById('screen-review');

    this.$quizTitle =
      document.getElementById('quiz-title');

    this.$progressText =
      document.getElementById('progress-text');

    this.$progressBar =
      document.getElementById('progress-bar-fill');

    this.$timer =
      document.getElementById('timer');

    this.$questionText =
      document.getElementById('question-text');

    this.$optionsList =
      document.getElementById('options-list');

    this.$btnPrev =
      document.getElementById('btn-prev');

    this.$btnNext =
      document.getElementById('btn-next');

    this.$btnFinish =
      document.getElementById('btn-finish');

    this.$resultTitle =
      document.getElementById('result-title');

    this.$resultStatus =
      document.getElementById('result-status');

    this.$resultScore =
      document.getElementById('result-score');

    this.$resultPct =
      document.getElementById('result-pct');

    this.$resultThreshold =
      document.getElementById('result-threshold');

    this.$btnReview =
      document.getElementById('btn-review');

    this.$btnRestart =
      document.getElementById('btn-restart');

    this.$reviewList =
      document.getElementById('review-list');

    this.$btnBackQuiz =
      document.getElementById(
        'btn-back-to-result'
      );

    this._resuming = false;
  }

  async init() {
    const data = await this._loadData();

    this.engine = new QuizEngine(data, {
      shuffleQuestions: false,
      shuffleOptions: false
    });

    if (QuizEngine.hasSaved()) {
      const resumed = await this._askResume();

      if (resumed) {
        this.engine.restore();
        this._resuming = true;
      } else {
        QuizEngine.clearSaved();
      }
    }

    this._bindEvents();
    this._showQuiz();
  }

  async _loadData() {
    const resp = await fetch(
      './data/questions.json'
    );

    if (!resp.ok) {
      throw new Error(
        'Не удалось загрузить вопросы'
      );
    }

    return resp.json();
  }

  _askResume() {
    return new Promise(resolve => {
      const overlay =
        document.getElementById(
          'resume-overlay'
        );

      overlay.hidden = false;

      overlay.querySelector(
        '#btn-resume'
      ).onclick = () => {
        overlay.hidden = true;
        resolve(true);
      };

      overlay.querySelector(
        '#btn-fresh'
      ).onclick = () => {
        overlay.hidden = true;
        resolve(false);
      };
    });
  }

  _bindEvents() {
    this.$btnPrev.addEventListener(
      'click',
      () => this._prev()
    );

    this.$btnNext.addEventListener(
      'click',
      () => this._next()
    );

    this.$btnFinish.addEventListener(
      'click',
      () => this._finish()
    );

    this.$btnReview.addEventListener(
      'click',
      () => this._showReview()
    );

    this.$btnRestart.addEventListener(
      'click',
      () => this._restart()
    );

    this.$btnBackQuiz.addEventListener(
      'click',
      () => this._backToResult()
    );

    document.addEventListener(
      'keydown',
      e => this._handleKey(e)
    );
  }

  _handleKey(e) {
    if (
      this.$quiz.classList.contains('hidden')
    ) {
      return;
    }

    if (
      e.key === 'ArrowRight' ||
      e.key === 'Enter'
    ) {
      if (!this.engine.isLast) {
        this._next();
      } else {
        this._finish();
      }
    }

    if (e.key === 'ArrowLeft') {
      this._prev();
    }

    const num = parseInt(e.key);

    if (
      num >= 1 &&
      num <=
        this.engine.current.options.length
    ) {
      this._selectOption(num - 1);
    }
  }

  _showScreen(name) {
    ['loading', 'quiz', 'result', 'review']
      .forEach(s => {
        document
          .getElementById(`screen-${s}`)
          .classList.toggle(
            'hidden',
            s !== name
          );
      });
  }

  _showQuiz() {
    const e = this.engine;

    this.$quizTitle.textContent = e.title;

    this._showScreen('quiz');

    this._renderQuestion();

    this._renderTimer(e.timeRemaining);

    e.startTimer(
      rem => this._renderTimer(rem),
      () => {
        this._showTimeout();
        this._finish(true);
      }
    );
  }

  _showResult(results) {
    this._showScreen('result');

    const {
      correct,
      total,
      pct,
      passed
    } = results;

    this.$resultTitle.textContent =
      this.engine.title;

    this.$resultStatus.textContent =
      passed
        ? '✓ Тест пройден'
        : '✗ Тест не пройден';

    this.$resultStatus.className =
      `result-status ${
        passed ? 'passed' : 'failed'
      }`;

    this.$resultScore.textContent =
      `${correct} / ${total}`;

    this.$resultPct.textContent =
      `${Math.round(pct * 100)}%`;

    this.$resultThreshold.textContent =
      `Порог: ${Math.round(
        this.engine.passThreshold * 100
      )}%`;

    this._animateScore(pct);
  }

  _showReview() {
    this._showScreen('review');

    const results =
      this.engine.getResults();

    this.$reviewList.innerHTML = '';

    results.details.forEach((d, i) => {
      const item =
        document.createElement('div');

      item.className = `review-item ${
        d.isCorrect
          ? 'correct'
          : 'incorrect'
      }`;

      const header =
        document.createElement('div');

      header.className =
        'review-question';

      header.innerHTML = `
        <span class="review-num">
          ${i + 1}
        </span>
        <span>${d.question}</span>
      `;

      const opts =
        document.createElement('ul');

      opts.className =
        'review-options';

      d.options.forEach((opt, oi) => {
        const li =
          document.createElement('li');

        const isChosen =
          oi === d.chosenIndex;

        const isCorrect =
          oi === d.correctIndex;

        li.className = [
          isCorrect
            ? 'opt-correct'
            : '',
          isChosen && !isCorrect
            ? 'opt-wrong'
            : '',
          isChosen
            ? 'opt-chosen'
            : ''
        ]
          .filter(Boolean)
          .join(' ');

        li.innerHTML = `
          <span class="opt-marker">
            ${
              isCorrect
                ? '✓'
                : isChosen
                ? '✗'
                : '○'
            }
          </span>
          <span>${opt}</span>
        `;

        opts.appendChild(li);
      });

      const timeNote =
        document.createElement('div');

      timeNote.className =
        'review-time';

      timeNote.textContent =
        `Время: ${d.timeSpent}с`;

      item.appendChild(header);
      item.appendChild(opts);
      item.appendChild(timeNote);

      this.$reviewList.appendChild(item);
    });
  }

  _backToResult() {
    this._showScreen('result');
  }

  _renderQuestion() {
    const e = this.engine;
    const q = e.current;
    const idx = e.currentIndex;

    const progress =
      ((idx + 1) / e.total) * 100;

    this.$progressText.textContent =
      `Вопрос ${idx + 1} из ${e.total}`;

    this.$progressBar.style.width =
      `${progress}%`;

    this.$progressBar.setAttribute(
      'aria-valuenow',
      progress
    );

    this.$questionText.textContent =
      q.text;

    this.$questionText.setAttribute(
      'aria-label',
      `Вопрос ${idx + 1}: ${q.text}`
    );

    this.$optionsList.innerHTML = '';

    q.options.forEach((opt, i) => {
      const li =
        document.createElement('li');

      li.setAttribute(
        'role',
        'listitem'
      );

      const btn =
        document.createElement('button');

      btn.className = 'option-btn';

      btn.textContent =
        `${String.fromCharCode(
          65 + i
        )}. ${opt}`;

      btn.setAttribute(
        'aria-label',
        `Вариант ${String.fromCharCode(
          65 + i
        )}: ${opt}`
      );

      if (e.answers[idx] === i) {
        btn.classList.add('selected');
      }

      btn.addEventListener(
        'click',
        () => this._selectOption(i)
      );

      li.appendChild(btn);

      this.$optionsList.appendChild(li);
    });

    this.$btnPrev.hidden =
      e.isFirst;

    this.$btnNext.hidden =
      e.isLast;

    this.$btnFinish.hidden =
      !e.isLast;

    const card =
      this.$questionText.closest(
        '.question-card'
      );

    card.classList.remove('slide-in');

    void card.offsetWidth;

    card.classList.add('slide-in');
  }

  _selectOption(index) {
    this.engine.selectAnswer(index);

    this.$optionsList
      .querySelectorAll('.option-btn')
      .forEach((btn, i) => {
        btn.classList.toggle(
          'selected',
          i === index
        );
      });
  }

  _prev() {
    this.engine.goPrev();
    this._renderQuestion();
  }

  _next() {
    this.engine.goNext();
    this._renderQuestion();
  }

  _finish(auto = false) {
    this.engine.stopTimer();

    const results =
      this.engine.finish();

    if (!auto) {
      this._showResult(results);
    } else {
      setTimeout(
        () => this._showResult(results),
        1500
      );
    }
  }

  _restart() {
    QuizEngine.clearSaved();
    location.reload();
  }

  _renderTimer(sec) {
    const m = String(
      Math.floor(sec / 60)
    ).padStart(2, '0');

    const s = String(
      sec % 60
    ).padStart(2, '0');

    this.$timer.textContent =
      `${m}:${s}`;

    this.$timer.classList.remove(
      'warning',
      'danger'
    );

    if (sec <= 30) {
      this.$timer.classList.add(
        'danger'
      );
    } else if (sec <= 60) {
      this.$timer.classList.add(
        'warning'
      );
    }
  }

  _showTimeout() {
    const toast =
      document.getElementById(
        'timeout-toast'
      );

    toast.hidden = false;

    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');

      setTimeout(() => {
        toast.hidden = true;
      }, 400);
    }, 2000);
  }

  _animateScore(targetPct) {
    const ring =
      document.getElementById(
        'score-ring-fill'
      );

    if (!ring) {
      return;
    }

    const circumference =
      2 * Math.PI * 54;

    ring.style.strokeDasharray =
      circumference;

    ring.style.strokeDashoffset =
      circumference;

    requestAnimationFrame(() => {
      ring.style.transition =
        'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)';

      ring.style.strokeDashoffset =
        circumference *
        (1 - targetPct);
    });
  }
}

document.addEventListener(
  'DOMContentLoaded',
  async () => {
    const ui = new QuizUI();

    try {
      await ui.init();
    } catch (err) {
      console.error(err);

      document.getElementById(
        'screen-loading'
      ).innerHTML = `
        <div class="load-error">
          <p> Ошибка загрузки данных</p>
          <small>${err.message}</small>
          <br>
          <small>
            Убедитесь, что файл запущен через локальный сервер
          </small>
        </div>
      `;
    }
  }
);
