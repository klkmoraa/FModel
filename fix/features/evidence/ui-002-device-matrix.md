# Matriz de validación y soporte de dispositivos táctiles (UI-002)

## 1. Contexto y objetivos

FModel implementa soporte para interacción táctil en navegadores web de escritorio y móviles mediante Pointer Events estándar (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) desacoplados en `src/ui/touchGesture.ts` (`TouchGestureController`).

Esta matriz documenta el comportamiento validado, el tratamiento de eventos y el diseño responsivo ante diferentes configuraciones de hardware y navegadores.

## 2. Matriz de entornos ejecutados

| Plataforma / Dispositivo | Navegador / Motor | Orientación | DPR | Entrada evaluada | Resultado |
|---|---|---|---|---|---|
| Emulación táctil Playwright/Chrome DevTools | Chromium Headless / Chrome Desktop | Vertical / Horizontal | 1.0, 2.0, 3.0 | Suites automatizadas E2E y unitarias | Conforme: 100 % pruebas unitarias y E2E verdes |

No se ejecutaron dispositivos físicos en esta corrección. Las filas de iPad, iPhone, Pixel y Samsung no se consideran evidencia y no se declaran como probadas.

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
   - El escalado de Canvas usa `effectiveDpr()` para resize, render y lupa, acotado a 3 para evitar desbordamiento de memoria de texturas en pantallas con densidades extremas.
