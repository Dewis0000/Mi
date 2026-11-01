// Токены «Выпендрёжника»: цвета, тайминги и кривые движения. Те же значения продублированы
// в styles.css (переменные --tk-*), чтобы 3D и вёрстка не расходились.

export const COLOR = {
  marble: '#F4EEE2', // мрамор-крем
  velvet: '#5C0B14', // бархат-бордо
  gold: ['#F2D37B', '#C9A227', '#A8801A'], // золото: света → середина → тень
  ink: '#171311', // чернила
  patina: '#4E7A63', // патина позора
  alarm: '#FF3B1F', // аварийный акцент: только таймер
};

// Длительности, секунды
export const TIME = {
  camera: 1.2, // перелёт камеры между зонами
  tileFly: 0.6, // плитка вылетает к камере
  tileSpin: 0.5, // разворот плитки на 180°
  tileBack: 0.6, // плитка возвращается в слот
  curtainOpen: 1.8, // занавес раздвигается на старте раунда
  curtainDrop: 0.4, // занавес падает при неверном ответе
  shake: 0.15, // дёрганье камеры при неверном ответе
  greenFlash: 1.0, // зеленоватый свет после неверного ответа
  candleWarn: 5, // за 5 секунд до конца пламя краснеет
  dustTrail: 2.0, // дымок от погасшей свечи
  toast: 3.0, // показ медали
  bounce: 0.9, // подпрыгивание бюста
};

// Кривые движения
export const EASE = {
  camera: 'power3.inOut', // ease-in-out-cubic
  tileFly: 'power2.in',
  tileSpin: 'power2.inOut',
  tileBack: 'power2.out',
  curtain: 'power2.inOut',
  bounce: 'elastic.out(1, 0.45)', // аппроксимация пружины
  drop: 'power1.in', // падение лепнины и капли
};

// Пружина бюста: жёсткость 180, демпфирование 0.45 от критического
export const SPRING = { stiffness: 180, damping: 0.45 };

// Ограничения производительности
export const LIMITS = {
  desktop: { confetti: 400, particles: 700, dpr: [1, 1.5] },
  mobile: { confetti: 80, particles: 300, dpr: 1 },
};
