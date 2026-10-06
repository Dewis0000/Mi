// Тема до отрисовки, без вспышки светлого фона (отдельный файл — чтобы CSP не требовал inline-скриптов)
try {
  if (localStorage.getItem('theme') === 'light') document.documentElement.classList.add('light')
} catch (e) {}
