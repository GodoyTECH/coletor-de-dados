import React from 'react';
import { createRoot } from 'react-dom/client';
import ChatWidget from './components/ChatWidget.jsx';

createRoot(document.getElementById('root')).render(React.createElement(ChatWidget));
