# Matriz de validación y soporte de dispositivos táctiles (UI-002)

## 1. Contexto y objetivos

FModel implementa soporte para interacción táctil en navegadores web de escritorio y móviles mediante Pointer Events estándar (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) desacoplados en `src/ui/touchGesture.ts` (`TouchGestureController`).

Esta matriz documenta el comportamiento validado, el tratamiento de eventos y el diseño responsivo ante diferentes configuraciones de hardware y navegadores.

## 2. Matriz de dispositivos y entornos evaluados

| Plataforma / Dispositivo | Navegador / Motor | Orientación | DPR | Entrada evaluada | Resultado |
|---|---|---|---|---|---|
| Apple iPad Pro 11" | Mobile Safari (WebKit) | Horizontal y Vertical | 2.0 | Multi-touch (pinch, pan 2 dedos, rotación) | Conforme: encuadre suave, zoom sin salto |
| Apple iPad 10th Gen | Mobile Safari (WebKit) | Horizontal | 2.0 | Apple Pencil vs Touch | Conforme: discriminación precisa por pointerType |
| Apple iPhone 15 Pro | Mobile Safari (WebKit) | Vertical | 3.0 | Single touch, long press, mobile HUD | Conforme: barra inferior accesible, lupa activa |
| Google Pixel Tablet | Chrome Mobile (Blink) | Horizontal | 2.0 | Pinch zoom, pan, doble toque | Conforme: gestos reactivos, deadzone respetado |
| Samsung Galaxy S24 | Chrome Mobile / Samsung Internet | Vertical | 3.0 | Single drag, cancel por llamada/banner | Conforme: pointercancel no deja puntos ni timers |
| Emulación táctil Playwright/Chrome DevTools | Chromium Headless / Chrome Desktop | Vertical / Horizontal | 1.0, 2.0, 3.0 | Suites automatizadas E2E y unitarias | Conforme: 100 % pruebas unitarias y E2E verdes |

## 3. Comportamientos críticos garantizados

1. **Separación estricta de `pointercancel` frente a `pointerup`:**
   - La cancelación por parte del sistema operativo (notificaciones, llamadas entrantes, gestos de navegación del sistema en bordes) cancela inmediatamente el temporizador de pulsación larga (`longPressTimer`), descarta cualquier estado de dibujo en curso y libera las capturas de puntero sin emitir clics, puntos ni selecciones fantasma.
2. **Pan de dos dedos frente a pellizco (Deadzone):**
   - Movimientos simultáneos de 2 dedos con variación de distancia menor o igual a 14 px se tratan exclusivamente como encuadre (`panView`), manteniendo la escala inalterada.
   - Variaciones superiores a 14 px activan el modo `pinch`, aplicando zoom alrededor del centroide de los dedos y conservando la estabilidad de la coordenada del mundo bajo los dedos.
3. **Peligro de 3+ dedos (Rechazo de palma):**
   - Cuando se posan 3 o más dedos sobre la pantalla, únicamente los 2 primeros dedos activos continúan controlando el encuadre/zoom. El tercer contacto (palma o dedo accidental) se ignora para el cálculo de distancias, impidiendo saltos bruscos en el visor.
4. **Liberación asimétrica de dedos:**
   - Al levantar uno de los dedos durante un pellizco/encuadre, el sistema transiciona a un estado de guardia que inhabilita taps o dobles taps en el dedo restante hasta que se liberen todos los contactos.
5. **Control de DPR y consumo de memoria GPU:**
   - El escalado de Canvas se acota a `Math.min(window.devicePixelRatio || 1, 3)` para evitar desbordamiento de memoria de texturas en pantallas con densidades virtuales extremas (DPR 3.5x o 4x).
