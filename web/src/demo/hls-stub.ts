/** Заглушка hls.js для демо-сборки: трансляция там имитируется, библиотека не нужна */
export default class Hls {
  static isSupported() {
    return false
  }
}
