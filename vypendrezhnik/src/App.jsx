import Hall from './Hall.jsx';
import Overlay from './Overlay.jsx';
import Phone from './Phone.jsx';

// Экран у телевизора — по умолчанию. Адрес с ?phone открывает телефон выступающего
export default function App() {
  const phone = new URLSearchParams(window.location.search).has('phone');
  if (phone) return <Phone />;

  return (
    <div className="cx-stage">
      <Hall />
      <Overlay />
    </div>
  );
}
