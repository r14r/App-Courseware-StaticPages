// src/main.js

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';
import Alpine from 'alpinejs';
import 'htmx.org';

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
    quiz: null,
    answers: {},
    quizState: 'not-started', // not-started | in-progress | completed
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
          chapter.topics = topicsIndex.map(entry => {
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
        } else {
          chapter.topics = [];
        }
        normalized.push(chapter);
      }
      this.chapters = normalized;
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
        this.chapterContentHtml = (content && content.contentHtml) ? content.contentHtml : '<p>No content.</p>';
        this.chapterTitle = chapter.title || '';
      }

      let quiz = await fetchJson(`/data/courses/${this.slug}/${chapter.id}/quiz.json`);
      if (!quiz) {
        quiz = await fetchJson(`/data/courses/${this.slug}/chapters/${chapter.id}/quiz.json`);
      }
      this.quiz = quiz && quiz.questions ? quiz : null;
      this.answers = {};
      this.quizState = 'not-started';
    },

    async loadTopic(tidx) {
      const chapter = this.chapters[this.selectedChapterIndex];
      if (!chapter) return;
      if (tidx < 0 || tidx >= this.topics.length) return;
      this.selectedTopicIndex = tidx;
      const topicEntry = this.topics[tidx];
      const fname = (typeof topicEntry === 'string') ? topicEntry : (topicEntry && topicEntry.file) ? topicEntry.file : topicEntry;
      if (this.topicCache[fname]) {
        // If quiz is cached but missing its questions for some reason, clear cache and re-fetch
        const cached = this.topicCache[fname];
        if (fname.toLowerCase().endsWith('quiz.json') && !(cached && cached.questions && Array.isArray(cached.questions))) {
          delete this.topicCache[fname];
        }
      }
      if (this.topicCache[fname]) {
        const t = this.topicCache[fname];
        // If cached entry is a quiz, restore quiz state
        if (t && t.questions && Array.isArray(t.questions)) {
          this.quiz = t;
          this.answers = {};
          this.quizState = 'in-progress';
          this.chapterContentHtml = '';
          this.chapterTitle = t.title || ((typeof topicEntry === 'object' && topicEntry.title) ? topicEntry.title : chapter.title) || '';
        } else {
          this.quiz = null;
          this.chapterContentHtml = t.contentHtml || '<p>No content.</p>';
          this.chapterTitle = t.title || ((typeof topicEntry === 'object' && topicEntry.title) ? topicEntry.title : chapter.title) || '';
        }
        this.showOnlyTopic = true;
        return;
      }
      // Try flattened path first, then legacy chapters/ path
      let data = await fetchJson(`/data/courses/${this.slug}/${chapter.id}/${fname}`);
      if (!data) {
        data = await fetchJson(`/data/courses/${this.slug}/chapters/${chapter.id}/${fname}`);
      }
      if (data) {
        this.topicCache[fname] = data;
          // If the loaded file is a quiz (contains questions), treat it as the chapter quiz
          if (data && data.questions && Array.isArray(data.questions)) {
            this.quiz = data;
            this.answers = {};
            // show quiz immediately when the quiz topic is opened
            this.quizState = 'in-progress';
            this.chapterContentHtml = '';
            this.chapterTitle = (data.title || ((typeof topicEntry === 'object' && topicEntry.title) ? topicEntry.title : chapter.title)) || '';
          } else {
            // regular topic content
            this.quiz = null;
            this.chapterContentHtml = data.contentHtml || '<p>No content.</p>';
            this.chapterTitle = data.title || ((typeof topicEntry === 'object' && topicEntry.title) ? topicEntry.title : chapter.title) || '';
          }
          // when loading a specific topic, show only that topic in the main view
          this.showOnlyTopic = true;
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

    startQuiz() {
      if (!this.quiz) return;
      this.quizState = 'in-progress';
    },

    submitQuiz() {
      // basic validation: ensure every question has an answer
      const unanswered = this.quiz.questions.some(q => this.answers[q.id] === undefined);
      if (unanswered) {
        alert('Please answer all questions before submitting.');
        return;
      }
      this.quizState = 'completed';
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
});

Alpine.start();
