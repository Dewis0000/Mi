import { UI } from './texts.js';

// Телефон ведущего-выступающего: одна кнопка. Связи с залом пока нет (нет сервера), поэтому кнопка только даёт отклик.
export default function Phone() {
  const tap = () => {
    if (navigator.vibrate) navigator.vibrate(35);
  };

  return (
    <main className="cx-phone">
      <p className="cx-phone-hint">{UI.phoneHint}</p>
      <button type="button" className="cx-phone-btn" onClick={tap}>
        {UI.phoneAction}
      </button>
    </main>
  );
}
