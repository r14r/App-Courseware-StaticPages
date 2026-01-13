// src/main.js

// Import Tailwind CSS
import './styles.css';

// Import Alpine.js
import Alpine from 'alpinejs';

// Import htmx (registers global `htmx`)
import 'htmx.org';

// Make Alpine globally available
window.Alpine = Alpine;

// Register Alpine components BEFORE Alpine.start()
document.addEventListener('alpine:init', () => {
  Alpine.data('demoCourseList', () => ({
    courses: [
      { id: 1, title: 'Learning Linux CLI', description: 'Intro to terminal, navigation and permissions.' },
      { id: 2, title: 'Learning Streamlit Basics', description: 'Build interactive Python web apps.' },
      { id: 3, title: 'Learning Python Basics', description: 'Syntax, data types and control flow.' },
    ],
    goToCourse(id) {
      window.location.href = `/course.html?id=${encodeURIComponent(id)}`;
    },
  }));

  Alpine.data('demoCourseView', () => ({
    courseId: null,
    course: null,
    chapters: [],
    init() {
      const params = new URLSearchParams(window.location.search);
      this.courseId = params.get('id') || '1';

      const demoMap = {
        '1': {
          title: 'Learning Linux CLI',
          description: 'Intro to terminal, navigation and permissions.',
          chapters: [
            { title: 'What is the Shell?', summary: 'Text interface to the OS.' },
            { title: 'Navigation', summary: 'pwd, ls, cd.' },
          ],
        },
        '2': {
          title: 'Learning Streamlit Basics',
          description: 'From script to web app.',
          chapters: [
            { title: 'What is Streamlit?', summary: 'High-level web framework.' },
            { title: 'Layouts', summary: 'Columns and sidebars.' },
          ],
        },
        '3': {
          title: 'Learning Python Basics',
          description: 'First steps in Python.',
          chapters: [
            { title: 'Intro', summary: 'Why Python.' },
            { title: 'Variables', summary: 'Store data in memory.' },
          ],
        },
      };

      const c = demoMap[this.courseId] || demoMap['1'];
      this.course = { title: c.title, description: c.description };
      this.chapters = c.chapters;
    },
  }));
});

// Now start Alpine
Alpine.start();
