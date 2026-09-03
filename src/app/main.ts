// Composition root: the only place allowed to import concrete adapter
// implementations across the board, per AD-1.
import { mount } from 'svelte';
import App from './App.svelte';
import './theme.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('#app root element is missing from index.html');
}

mount(App, { target });
