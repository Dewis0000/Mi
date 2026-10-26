import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

if (import.meta.env.DEV) {
  // Временный тестовый хук для ручной/автоматизированной проверки экранов
  // смерти/эпилога без ожидания реального броска смерти. Не попадает в
  // прод-сборку (ветка отсекается import.meta.env.DEV при билде).
  import('./store').then(({ useGameStore }) => {
    (window as unknown as { __gameStore: typeof useGameStore }).__gameStore = useGameStore;
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
