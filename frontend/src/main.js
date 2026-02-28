import React from 'react';
import { createRoot } from 'react-dom/client';
import ChatWidget from './components/ChatWidget.jsx';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw-chat.js').catch((err) => {
      console.warn('SW chat registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')).render(React.createElement(ChatWidget));
