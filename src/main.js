// src/main.js

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './styles.css';
import Alpine from 'alpinejs';
import 'htmx.org';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

window.Alpine = Alpine;

// Helper: fetch JSON and return parsed object or null on 404
async function fetchJson(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function renderContent(data) {
  if (!data) return '<p>No content.</p>';
  if (Array.isArray(data.content)) {
    return data.content.filter(Boolean).join('\n\n') || '<p>No content.</p>';
  }
  if (data.contentHtml) return data.contentHtml;
  return '<p>No content.</p>';
}

function normalizeQuiz(raw) {
  if (!raw) return null;
  if (Array.isArray(raw.questions)) return raw;
  if (raw.quiz && Array.isArray(raw.quiz.questions)) {
    return {
      title: raw.title || raw.quiz.title || 'Quiz',
      questions: raw.quiz.questions.map(q => ({
        id: q.id,
        type: q.type || 'single',
        question: q.question,
        options: q.options || q.choices || [],
        correctIndex: q.correctIndex ?? q.answerIndex,
        explanation: q.explanation || ''
      }))
    };
  }
  return null;
}

document.addEventListener('alpine:init', () => {
  Alpine.data('demoCourseList', () => ({
    courses: [],
    async init() {
      // index.json contains an array of course folder slugs
      const idx = await fetchJson('/data/courses/index.json');

      if (!idx || !Array.isArray(idx)) return;

      const list = [];
      for (const item of idx) {
        const slug = item.slug || item;
        const course = await fetchJson(`/data/courses/${slug}/course.json`);

        if (course) {
          list.push({ slug, title: course.title, description: course.description || '', id: course.id || slug });
        }
      }
      this.courses = list;
    },
    goToCourse(slug) {
      window.location.href = `/course.html?id=${encodeURIComponent(slug)}`;
    },
    handleImageError(e, title) {
      e.target.onerror = null;
      const txt = encodeURIComponent(title || 'Course');
      e.target.src = `https://placehold.co/600x350?text=${txt}`;
    },
  }));

  Alpine.data('demoCourseView', () => ({
    slug: null,
    course: null,
    chapters: [],
    selectedChapterIndex: 0,
    chapterContentHtml: '',
    chapterTitle: '',
    topics: [],
    selectedTopicIndex: 0,
    topicCache: {},
    quizAvailable: false,
    quizTitle: '',
    quizLink: '',
    showOnlyTopic: false,

    async init() {
      const params = new URLSearchParams(window.location.search);
      this.slug = params.get('id') || 'linux-cli';
      await this.loadCourse();
      if (this.chapters.length) await this.loadChapter(0);
    },

    async loadCourse() {
      const course = await fetchJson(`/data/courses/${this.slug}/course.json`);
      if (!course) {
        this.course = { title: 'Course not found', description: '' };
        this.chapters = [];
        return;
      }
      this.course = course;
      // Normalize chapters and try to prefetch topics index for each chapter so sidebar can show topics
      const rawCh = course.chapters || [];
      const normalized = [];
      for (const ch of rawCh) {
        const chapter = Object.assign({}, ch);
        // try flattened then legacy topics.json
        let topicsIndex = await fetchJson(`/data/courses/${this.slug}/${chapter.id}/topics.json`);
        if (!topicsIndex) {
          topicsIndex = await fetchJson(`/data/courses/${this.slug}/chapters/${chapter.id}/topics.json`);
        }
        if (Array.isArray(topicsIndex)) {
          // normalize entries to objects {file, title}
          const normalizedTopics = topicsIndex.map(entry => {
            if (typeof entry === 'string') {
              const file = entry;
              const title = file.replace(/^\d+-|\.json$/g, '').replace(/-/g, ' ')
                .replace(/\b\w/g, s => s.toUpperCase());
              return { file, title };
            }
            // assume object with file and optional title
            const file = entry.file || entry.filename || String(entry);
            const title = entry.title || (file.replace(/^\d+-|\.json$/g, '').replace(/-/g, ' ').replace(/\b\w/g, s => s.toUpperCase()));
            return { file, title };
          });
          const quizEntry = normalizedTopics.find(topic => String(topic.file || '').toLowerCase().endsWith('quiz.json'));
          chapter.topics = normalizedTopics.filter(topic => {
            const fname = String(topic.file || '');
            return !fname.toLowerCase().endsWith('quiz.json');
          });
          if (quizEntry) {
            chapter.topics.push({ file: quizEntry.file, title: quizEntry.title || 'Quiz' });
          }
        } else {
          chapter.topics = [];
        }
        normalized.push(chapter);
      }
      this.chapters = normalized;
    },

    highlightCode() {
      if (hljs && typeof hljs.highlightAll === 'function') {
        hljs.highlightAll();
      }
    },

    async loadChapter(idx) {
      if (idx < 0 || idx >= this.chapters.length) return;
      this.selectedChapterIndex = idx;
      const chapter = this.chapters[idx];

      // Try topic-based structure first. Support flattened layout (/course/<chapter>/...) and
      // legacy layout (/course/chapters/<chapter>/...). Try flattened first, then fallback.
      let topicsIndex = await fetchJson(`/data/courses/${this.slug}/${chapter.id}/topics.json`);
      if (!topicsIndex) {
        topicsIndex = await fetchJson(`/data/courses/${this.slug}/chapters/${chapter.id}/topics.json`);
      }
      if (topicsIndex && Array.isArray(topicsIndex) && topicsIndex.length) {
        this.topics = topicsIndex.slice();
        this.selectedTopicIndex = 0;
        this.showOnlyTopic = false; // when explicitly loading a chapter, show the topics list by default
        await this.loadTopic(this.selectedTopicIndex);
      } else {
        // Fallback to single content.json (check flattened then legacy)
        this.topics = [];
        this.selectedTopicIndex = 0;
        let content = await fetchJson(`/data/courses/${this.slug}/${chapter.id}/content.json`);
        if (!content) {
          content = await fetchJson(`/data/courses/${this.slug}/chapters/${chapter.id}/content.json`);
        }
        this.chapterContentHtml = renderContent(content);
        this.chapterTitle = chapter.title || '';
        this.$nextTick(() => this.highlightCode());
      }

      let quiz = await fetchJson(`/data/courses/${this.slug}/${chapter.id}/quiz.json`);
      if (!quiz) {
        quiz = await fetchJson(`/data/courses/${this.slug}/chapters/${chapter.id}/quiz.json`);
      }
      this.quizAvailable = !!(quiz && quiz.questions);
      this.quizTitle = (quiz && quiz.title) ? quiz.title : 'Quiz';
      this.quizLink = this.quizAvailable
        ? `/quiz.html?id=${encodeURIComponent(this.slug)}&chapter=${encodeURIComponent(chapter.id)}`
        : '';
    },

    async loadTopic(tidx) {
      const chapter = this.chapters[this.selectedChapterIndex];
      if (!chapter) return;
      if (tidx < 0 || tidx >= this.topics.length) return;
      this.selectedTopicIndex = tidx;
      const topicEntry = this.topics[tidx];
      const fname = (typeof topicEntry === 'string') ? topicEntry : (topicEntry && topicEntry.file) ? topicEntry.file : topicEntry;
      if (String(fname || '').toLowerCase().endsWith('quiz.json')) {
        const link = `/quiz.html?id=${encodeURIComponent(this.slug)}&chapter=${encodeURIComponent(chapter.id)}`;
        window.location.href = link;
        return;
      }
      if (this.topicCache[fname]) {
        // If quiz is cached but missing its questions for some reason, clear cache and re-fetch
        const cached = this.topicCache[fname];
        if (fname.toLowerCase().endsWith('quiz.json') && !(cached && cached.questions && Array.isArray(cached.questions))) {
          delete this.topicCache[fname];
        }
      }
      if (this.topicCache[fname]) {
        const t = this.topicCache[fname];
          this.chapterContentHtml = renderContent(t);
          this.chapterTitle = t.title || ((typeof topicEntry === 'object' && topicEntry.title) ? topicEntry.title : chapter.title) || '';
        this.showOnlyTopic = true;
        this.$nextTick(() => this.highlightCode());
        return;
      }
      // Try flattened path first, then legacy chapters/ path
      let data = await fetchJson(`/data/courses/${this.slug}/${chapter.id}/${fname}`);
      if (!data) {
        data = await fetchJson(`/data/courses/${this.slug}/chapters/${chapter.id}/${fname}`);
      }
      if (data) {
        this.topicCache[fname] = data;
        this.chapterContentHtml = renderContent(data);
        this.chapterTitle = data.title || ((typeof topicEntry === 'object' && topicEntry.title) ? topicEntry.title : chapter.title) || '';
        // when loading a specific topic, show only that topic in the main view
        this.showOnlyTopic = true;
        this.$nextTick(() => this.highlightCode());
      } else {
        this.chapterContentHtml = '<p>No content.</p>';
        this.chapterTitle = chapter.title || '';
      }
    },

    nextChapter() {
      // If current chapter has topics, move to next topic first
      if (this.topics && this.selectedTopicIndex < this.topics.length - 1) {
        this.loadTopic(this.selectedTopicIndex + 1);
        return;
      }
      if (this.selectedChapterIndex < this.chapters.length - 1) {
        this.loadChapter(this.selectedChapterIndex + 1);
      }
    },

    prevChapter() {
      // If current chapter has topics and not at first, go to previous topic
      if (this.topics && this.selectedTopicIndex > 0) {
        this.loadTopic(this.selectedTopicIndex - 1);
        return;
      }
      if (this.selectedChapterIndex > 0) {
        // load previous chapter and jump to its last topic if present
        const prevIdx = this.selectedChapterIndex - 1;
        this.loadChapter(prevIdx);
        if (this.topics && this.topics.length) {
          this.loadTopic(this.topics.length - 1);
        }
      }
    },

    goToQuiz() {
      if (!this.quizLink) return;
      window.location.href = this.quizLink;
    }
  }));

  Alpine.data('demoQuizPage', () => ({
    title: 'Quiz',
    slug: null,
    chapter: null,
    quiz: null,
    answers: {},
    quizState: 'in-progress',
    courseLink: '#',
    currentIndex: 0,
    async init() {
      const params = new URLSearchParams(window.location.search);
      this.slug = params.get('id');
      this.chapter = params.get('chapter');
      this.courseLink = this.slug ? `/course.html?id=${encodeURIComponent(this.slug)}` : '/';
      if (!this.slug || !this.chapter) return;
      let quiz = await fetchJson(`/data/courses/${this.slug}/${this.chapter}/quiz.json`);
      if (!quiz) {
        quiz = await fetchJson(`/data/courses/${this.slug}/chapters/${this.chapter}/quiz.json`);
      }
      this.quiz = normalizeQuiz(quiz);
      if (this.quiz) {
        this.title = this.quiz.title || 'Quiz';
        this.currentIndex = 0;
      }
    },
    get currentQuestion() {
      if (!this.quiz) return null;
      return this.quiz.questions[this.currentIndex] || null;
    },
    progressPercent() {
      if (!this.quiz || !this.quiz.questions.length) return 0;
      return Math.round(((this.currentIndex + 1) / this.quiz.questions.length) * 100);
    },
    nextLabel() {
      if (!this.quiz) return 'Next';
      return this.currentIndex === this.quiz.questions.length - 1 ? 'Submit Quiz' : 'Next';
    },
    handleNext() {
      if (!this.quiz) return;
      const current = this.currentQuestion;
      if (!current) return;
      if (this.answers[current.id] === undefined) {
        alert('Please answer the question');
        return;
      }
      if (this.currentIndex < this.quiz.questions.length - 1) {
        this.currentIndex += 1;
        return;
      }
      this.submitQuiz();
    },
    submitQuiz() {
      if (!this.quiz) return;
      const unanswered = this.quiz.questions.some(q => this.answers[q.id] === undefined);
      if (unanswered) {
        alert('Please answer all questions');
        return;
      }
      let score = 0;
      const results = this.quiz.questions.map(q => {
        const selectedIndex = Number(this.answers[q.id]);
        const correctIndex = Number(q.correctIndex);
        if (q.type === 'single' && selectedIndex === correctIndex) score++;
        return {
          id: q.id,
          question: q.question,
          options: q.options || [],
          selectedIndex,
          correctIndex,
          explanation: q.explanation || ''
        };
      });
      const payload = {
        title: this.quiz.title || 'Quiz',
        slug: this.slug,
        chapter: this.chapter,
        total: this.quiz.questions.length,
        score,
        results
      };
      const key = `quizResults:${this.slug}:${this.chapter}`;
      sessionStorage.setItem(key, JSON.stringify(payload));
      const link = `/results.html?id=${encodeURIComponent(this.slug)}&chapter=${encodeURIComponent(this.chapter)}`;
      window.location.href = link;
    },
    score() {
      if (!this.quiz) return 0;
      let s = 0;
      for (const q of this.quiz.questions) {
        if (q.type === 'single') {
          if (Number(this.answers[q.id]) === Number(q.correctIndex)) s++;
        }
      }
      return s;
    }
  }));

  Alpine.data('demoQuizResults', () => ({
    title: 'Quiz Results',
    slug: null,
    chapter: null,
    payload: null,
    courseLink: '#',
    quizLink: '#',
    async init() {
      const params = new URLSearchParams(window.location.search);
      this.slug = params.get('id');
      this.chapter = params.get('chapter');
      this.courseLink = this.slug ? `/course.html?id=${encodeURIComponent(this.slug)}` : '/';
      this.quizLink = (this.slug && this.chapter)
        ? `/quiz.html?id=${encodeURIComponent(this.slug)}&chapter=${encodeURIComponent(this.chapter)}`
        : '/quiz.html';
      if (!this.slug || !this.chapter) return;
      const key = `quizResults:${this.slug}:${this.chapter}`;
      const stored = sessionStorage.getItem(key);
      if (stored) {
        try {
          this.payload = JSON.parse(stored);
          this.title = this.payload.title || 'Quiz Results';
        } catch (e) {
          this.payload = null;
        }
      }
    },
    progressPercent() {
      if (!this.payload || !this.payload.total) return 0;
      return Math.round((this.payload.score / this.payload.total) * 100);
    },
    progressStyle() {
      return `width: ${this.progressPercent()}%`;
    },
    isPerfect() {
      if (!this.payload) return false;
      return Number(this.payload.score) === Number(this.payload.total);
    },
    isCorrect(result) {
      if (!result) return false;
      return Number(result.selectedIndex) === Number(result.correctIndex);
    },
    selectedLabel(result) {
      if (!result || !Array.isArray(result.options)) return '—';
      return result.options[result.selectedIndex] || '—';
    },
    correctLabel(result) {
      if (!result || !Array.isArray(result.options)) return '—';
      return result.options[result.correctIndex] || '—';
    }
  }));
});

Alpine.start();
